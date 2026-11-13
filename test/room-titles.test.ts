import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebexMessagingAPI, demoMessageAPI, type MessageRoom } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { RoomReadStatus } from '../src/read-status-protocol.js';

const direct = (id: string, title = '', lastActivity = '2026-11-09T12:00:00.000Z'): MessageRoom => ({ id, title, type: 'direct', lastActivity });

test('REST room parsing leaves missing titles unknown instead of manufacturing a name that overwrites known metadata', async () => {
  const requests: string[] = [];
  const api = new WebexMessagingAPI(() => 'synthetic', async url => {
    requests.push(String(url));
    return Response.json({ items: [
      { id: 'personal', type: 'direct' }, { id: 'blank', type: 'direct', title: ' \n ' },
      { id: 'named', type: 'direct', title: '  Alex\nExample\u202e\x1b  ' }, { id: 'group', type: 'group', title: null },
    ] });
  });
  try {
    const result = await api.rooms();
    assert.deepEqual(result.items.map(room => room.title), ['', '', 'Alex Example', '']);
    assert.equal(requests.length, 1); assert.equal(new URL(requests[0]!).pathname, '/v1/rooms');
  } finally { api.close(); }
});

test('SDK-only direct rooms use computed names when supplied and never become Untitled space when no name is available', async () => {
  const api = demoMessageAPI(), store = new MessagingStore(api, 0); let histories = 0, posts = 0;
  api.history = async () => { histories++; return { items: [] }; };
  api.send = async () => { posts++; throw new Error('No sends permitted.'); };
  try {
    store.mergeRooms([direct('personal'), { ...direct('group'), type: 'group' }]);
    assert.equal(store.rooms.find(room => room.id === 'personal')!.title, 'Direct conversation');
    assert.equal(store.rooms.find(room => room.id === 'group')!.title, 'Untitled space');
    await store.select('personal');
    store.mergeRooms([direct('personal', 'Alex Example')]);
    assert.equal(store.room!.title, 'Alex Example'); assert.equal(store.room!.id, 'personal');
    store.mergeRooms([direct('personal', '   ')]);
    assert.equal(store.room!.title, 'Alex Example', 'empty SDK events retain a known personal-space name');
    store.mergeRooms([direct('personal', 'Renamed Person')]);
    assert.equal(store.room!.title, 'Renamed Person');
    assert.equal(histories, 1); assert.equal(posts, 0, 'title reconciliation never opens history or sends a message');
  } finally { store.close(); }
});

test('REST refresh and pagination retain known peer names, preserve newer activity, and update selected-room labels without changing its identity', async () => {
  const api = demoMessageAPI(); let title = '', next = 'second';
  api.rooms = async page => ({ items: [direct(page ? 'older-personal' : 'personal', title, '2026-11-09T10:00:00.000Z')], next: page ? undefined : next });
  api.history = async () => ({ items: [] });
  const store = new MessagingStore(api, 0);
  try {
    store.mergeRooms([direct('personal', 'Alex Example'), direct('older-personal', 'Morgan Example')]);
    await store.select('personal'); await store.loadRooms();
    assert.equal(store.room!.title, 'Alex Example');
    assert.equal(store.room!.lastActivity, '2026-11-09T12:00:00.000Z');
    store.mergeRooms([direct('older-personal', 'Morgan Example')]);
    await store.loadRooms(true);
    assert.equal(store.rooms.find(room => room.id === 'older-personal')!.title, 'Morgan Example');
    title = 'Alex Renamed'; next = '';
    await store.loadRooms();
    assert.equal(store.room!.title, 'Alex Renamed'); assert.equal(store.room!.id, 'personal'); assert.ok(store.ready);
  } finally { store.close(); }
});

test('literal server titles are authoritative, even when they happen to look like fallback labels', () => {
  const store = new MessagingStore(demoMessageAPI(), 0);
  try {
    store.mergeRooms([direct('personal', 'Alex Example')]);
    store.mergeRooms([direct('personal', 'Untitled space')]);
    assert.equal(store.rooms[0]!.title, 'Untitled space', 'do not guess missingness from title text');
    store.mergeRooms([direct('personal', 'Direct conversation')]);
    assert.equal(store.rooms[0]!.title, 'Direct conversation');
  } finally { store.close(); }
});

test('initial unread-aware discovery and later blank SDK/REST metadata preserve direct names and authoritative read status without extra requests', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-direct-names-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] } }), { mode: 0o600 });
  const status: RoomReadStatus = { ...direct('personal', 'Alex Example'), lastSeen: '2026-11-09T11:00:00.000Z' };
  let lists = 0, histories = 0, receipts = 0;
  const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {},
    start: async () => { source.onRooms([status]); }, markRead: async () => { receipts++; }, close() {} };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => { lists++; return { items: [direct('personal')] }; });
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => { histories++; return { items: [] }; });
  const engine = new EditorEngine(async () => { throw new Error('Browser forbidden.'); }, () => source);
  const snapshots: ReturnType<EditorEngine['snapshot']>[] = [];
  engine.on('state', snapshot => snapshots.push(snapshot));
  try {
    await engine.start('live', config, true);
    const first = snapshots.find(snapshot => snapshot.rooms.length)!;
    assert.equal(first.rooms[0]!.title, 'Alex Example');
    assert.ok('unread' in first.rooms[0]! && first.rooms[0]!.unread);
    await engine.select('personal');
    source.onRooms([{ ...status, title: '', lastSeen: status.lastActivity }]);
    await engine.rooms();
    const room = engine.snapshot().rooms[0]!;
    assert.equal(room.title, 'Alex Example'); assert.ok('unread' in room && room.unread === false);
    assert.equal(engine.snapshot().room!.id, 'personal'); assert.equal(engine.snapshot().room!.title, 'Alex Example');
    assert.equal(lists, 2); assert.equal(histories, 1); assert.equal(receipts, 0);
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});
