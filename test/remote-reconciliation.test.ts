import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { WebexMessagingAPI, MessagingError } from '../src/messaging-api.js';
import { ReadStatusWorker } from '../src/read-status.js';
import { parseReadChange, validReadChange } from '../src/read-status-protocol.js';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { OAuthSession } from '../src/oauth.js';
import type { ChatMessage } from '../src/chat-protocol.js';
const message = (id: string, day: number, text = id): ChatMessage => ({ id, created: `2026-11-${String(day).padStart(2, '0')}T12:00:00.000Z`, text, author: 'Synthetic' });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
function fixture() {
  let page = [message('a', 1), message('b', 2), message('c', 3)];
  const reads: string[] = [];
  let get = async (_room: string, id: string, _signal?: AbortSignal): Promise<ChatMessage | undefined> => message(id, 1, 'Fresh exact content');
  const api = {
    rooms: async () => ({ items: ['r', 'other'].map(id => ({ id, type: 'group' as const, title: id, lastActivity: '' })) }),
    history: async () => ({ items: structuredClone(page) }),
    getMessage: (room: string, id: string, signal?: AbortSignal) => { reads.push(id); return get(room, id, signal); },
    send: async (): Promise<ChatMessage> => { throw new Error('MUTATIONS FORBIDDEN'); }, close() {},
  };
  return { api, store: new MessagingStore(api, 0), reads, page: (items: ChatMessage[]) => { page = items; },
    get: (fn: typeof get) => { get = fn; } };
}
test('selected-history polling reconciles one loaded identity outside the newest page, without inferring deletion from page absence', async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r');
    assert.deepEqual(f.reads, [], 'a complete first page needs no duplicate exact reads');
    f.page([message('c', 3)]);
    await f.store.refresh();
    assert.deepEqual(f.reads, ['a'], 'one bounded exact GET, not a full loaded-history refetch');
    assert.equal(f.store.messages.find(item => item.id === 'a')!.text, 'Fresh exact content');
    assert.ok(f.store.messages.some(item => item.id === 'b'), 'absence in a bounded page is never deletion evidence');
    f.get(async () => undefined); // Contract: only a confirmed exact GET 404 returns undefined.
    await f.store.refresh();
    assert.deepEqual(f.reads, ['a', 'b'], 'round-robin reconciliation reaches other loaded identities');
    assert.equal(f.store.messages.some(item => item.id === 'b'), false);
    f.page([message('b', 2), message('c', 3)]);
    await f.store.refresh();
    assert.equal(f.store.messages.some(item => item.id === 'b'), false, 'a stale list cannot resurrect a confirmed tombstone');
  } finally { f.store.close(); }
});
test('a deleted canonical endpoint remains ineligible until explicit latest revalidation', async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r');
    f.page([message('a', 1)]);
    f.get(async () => undefined);
    await f.store.refresh();
    assert.equal(f.reads[0], 'c', 'prioritize a missing canonical endpoint for exact revalidation');
    assert.equal(f.store.latestMessageId, 'c', 'deletion does not invent a new canonical read endpoint');
    assert.equal(f.store.messages.some(item => item.id === 'c'), false);
    await f.store.select('r', true);
    assert.equal(f.store.latestMessageId, 'a', 'only explicit latest reload adopts the fresh endpoint');
  } finally { f.store.close(); }
});
test('late exact reads cannot cross a selection or overwrite a newer local mutation', { timeout: 5000 }, async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r'); f.page([message('c', 3)]);
    const read = deferred<ChatMessage | undefined>(), entered = deferred<void>();
    f.get(async () => { entered.resolve(); return read.promise; });
    const refreshing = f.store.refresh();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.reads.length, 1, 'the pending exact read is admitted');
    await entered.promise;
    f.store.reconcileMutation('r', 'a', message('a', 1, 'Newer confirmed local edit'));
    read.resolve(message('a', 1, 'Stale remote result')); await refreshing;
    assert.equal(f.store.messages.find(item => item.id === 'a')!.text, 'Newer confirmed local edit');
    const late = deferred<ChatMessage | undefined>(), enteredAgain = deferred<void>();
    f.get(async () => { enteredAgain.resolve(); return late.promise; });
    const oldRefresh = f.store.refresh(); await enteredAgain.promise;
    await f.store.select('other');
    const before = structuredClone(f.store.messages);
    late.resolve(message('b', 2, 'Wrong room')); await oldRefresh;
    assert.equal(f.store.room!.id, 'other'); assert.deepEqual(f.store.messages, before);
  } finally { f.store.close(); }
});
test('exact reconciliation failures preserve loaded bodies and never become delete proof', async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r'); f.page([message('c', 3)]);
    f.get(async () => { throw new Error('PRIVATE provider failure'); });
    await f.store.refresh();
    assert.equal(f.store.messages.length, 3);
    assert.ok(!f.store.notice.includes('PRIVATE'));
  } finally { f.store.close(); }
});
test('unchanged, mismatched and older exact versions cannot replace loaded edits or emit spurious mutations', async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r');
    const edited = { ...message('a', 1, 'Confirmed'), updated: '2026-11-02T12:00:00.000Z', edited: true };
    f.store.reconcileMutation('r', 'a', edited);
    f.page([message('c', 3)]);
    let previousRevision = (f.store as any).revision;
    for (const item of [edited, { ...edited, text: 'Ambiguous same version' },
      { ...edited, text: 'Old', updated: '2026-11-02T11:00:00.000Z' },
      { ...edited, text: 'Unversioned', updated: undefined }, { ...edited, created: message('a', 3).created },
      { ...edited, id: 'different' }]) {
      (f.store as any).reconciliationCursor = 0; f.get(async () => item);
      await f.store.refresh();
      assert.equal(f.store.messages[0]!.text, 'Confirmed');
      assert.equal((f.store as any).revision, previousRevision, 'no synthetic edit for unchanged/stale/mismatched exact content');
    }
    (f.store as any).reconciliationCursor = 0;
    f.get(async () => ({ ...edited, text: 'New version', updated: '2026-11-02T13:00:00.000Z' }));
    await f.store.refresh();
    assert.equal(f.store.messages[0]!.text, 'New version');
    assert.equal((f.store as any).revision, previousRevision + 1);
  } finally { f.store.close(); }
});
test('exact deletion received before selection or while history is in flight cannot be resurrected by a stale page', async () => {
  const f = fixture();
  try {
    f.store.observeDeletion('r', 'a');
    await f.store.loadRooms(); await f.store.select('r');
    assert.equal(f.store.messages.some(item => item.id === 'a'), false);
    const history = deferred<{ items: ChatMessage[] }>();
    f.api.history = () => history.promise;
    const refreshing = f.store.refresh();
    f.store.observeDeletion('r', 'b');
    history.resolve({ items: [message('a', 1), message('b', 2), message('c', 3)] });
    await refreshing;
    assert.deepEqual(f.store.messages.map(item => item.id), ['c']);
  } finally { f.store.close(); }
});
test('current private source forwards exact remote deletion and self-removal; partial snapshots never revoke membership', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const source: any = { onRooms() {}, onFailure() {}, start: async () => {}, markRead: async () => { throw new Error('RECEIPTS FORBIDDEN'); }, close() {} };
  const engine = new EditorEngine(undefined, () => source), revoked: unknown[] = [];
  engine.on('room.revoked', value => revoked.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const internal = engine as any;
    internal.token = 'synthetic'; internal.expiresAt = Date.now() + 3600_000;
    await internal.startReadStatus({ token: 'synthetic', scope: 'spark:all spark:kms', expiresAt: internal.expiresAt }, internal.generation);
    source.onRooms([]);
    assert.ok(engine.snapshot().rooms.some(item => item.id === 'demo-general'), 'absence in partial SDK state is not access-loss evidence');
    const endpoint = engine.snapshot().messages.at(-1)!.id;
    source.onChanges?.([{ kind: 'message-deleted', roomId: 'demo-general', id: endpoint }]);
    assert.equal(engine.snapshot().messages.some(item => item.id === endpoint), false);
    assert.equal(engine.snapshot().historyLatest, false);
    await engine.select('demo-engineering');
    source.onChanges?.([{ kind: 'room-revoked', roomId: 'demo-general' }]);
    assert.deepEqual(revoked, [{ roomId: 'demo-general' }]);
    assert.equal(engine.snapshot().room!.id, 'demo-engineering');
    assert.equal(engine.snapshot().ready, true);
    assert.equal(engine.snapshot().rooms.some(item => item.id === 'demo-general'), false);
    internal.store.mergeRooms([{ id: 'demo-general', title: 'Stale', type: 'group', lastActivity: '' }]);
    assert.equal(engine.snapshot().rooms.some(item => item.id === 'demo-general'), false);
    await engine.roomMembers();
    assert.equal(internal.members.snapshot().roomId, 'demo-engineering');
    // Observe the real lifecycle effect; do not recreate a removed private
    // engine.people field or replace presence behavior to assert revocation.
    const deselect = t.mock.method(internal.presence, 'deselect');
    const valid = internal.store.conversationOwner('demo-engineering');
    source.onChanges([{ kind: 'room-revoked', roomId: 'demo-engineering' }]);
    assert.equal(valid(), false); assert.equal(engine.snapshot().ready, false);
    assert.equal(internal.members.snapshot().roomId, ''); assert.equal(deselect.mock.callCount(), 1);
    const selectedText = engine.snapshot().messages;
    source.onRooms([{ id: 'demo-engineering', title: 'Stale', type: 'group',
      lastActivity: '2026-11-01T12:00:00.000Z', lastSeen: '2026-11-01T11:00:00.000Z' }]);
    source.onChanges([{ kind: 'room-revoked', roomId: 'demo-engineering' }]);
    assert.equal(revoked.length, 2, 'duplicate removal is consumed without re-invalidating unknown outcomes');
    assert.equal(engine.snapshot().ready, false); assert.equal(engine.snapshot().rooms.length, 1);
    assert.deepEqual(engine.snapshot().messages, selectedText, 'loaded text remains available as retained, nonauthoritative context');
    const callback = source.onChanges; engine.stop(); const revision = engine.snapshot().revision;
    callback?.([{ kind: 'room-revoked', roomId: 'demo-engineering' }]);
    assert.equal(engine.snapshot().revision, revision, 'old sources cannot invalidate a replacement/stopped session');
  } finally { engine.stop(); }
});
test('public projections distinguish removed member from actor and private IPC strips identity/body fields', () => {
  const self = Buffer.from('ciscospark://us/PEOPLE/self').toString('base64url');
  const event = { resource: 'memberships', event: 'deleted', createdBy: self, actorId: 'moderator',
    data: { id: 'membership', roomId: 'room', personId: self, personEmail: 'PRIVATE' } };
  assert.deepEqual(parseReadChange(event, self), { kind: 'room-revoked', roomId: 'room' });
  assert.equal(parseReadChange({ ...event, actorId: self, data: { ...event.data, personId: 'other' } }, self), undefined);
  for (const patch of [{ resource: 'rooms' }, { event: 'seen' }, { createdBy: 'other' }, { data: { ...event.data, roomId: '../bad' } }]) {
    assert.equal(parseReadChange({ ...event, ...patch }, self), undefined);
  }
  const deletion = parseReadChange({ ...event, resource: 'messages' }, self)!;
  assert.deepEqual(deletion, { kind: 'message-deleted', roomId: 'room', id: 'membership' });
  assert.ok(validReadChange(deletion));
  assert.equal(validReadChange({ ...deletion, token: 'PRIVATE' }), false);
  assert.equal(validReadChange({ kind: 'room-revoked', roomId: 'room', personId: self }), false);
});
for (const mode of ['change-valid', 'change-extra', 'change-duplicate', 'change-oversized']) test(`private invalidation IPC is bounded and strict: ${mode}`, async () => {
  const source = new ReadStatusWorker(fileURLToPath(new URL('read-status-worker-fixture.mjs', import.meta.url)), 2000);
  const changes: unknown[] = [], failures: unknown[] = [];
  const received = new Promise<void>(resolve => {
    source.onChanges = value => { changes.push(...value); resolve(); };
    source.onFailure = value => { failures.push(value); resolve(); };
  });
  try {
    await source.start({ token: mode, scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 }); await received;
    assert.deepEqual(failures, mode === 'change-valid' ? [] : ['invalid-data']);
    assert.equal(changes.length, mode === 'change-valid' ? 2 : 0);
  } finally {
    const child = (source as unknown as { child: ChildProcess }).child;
    const ended = child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
    source.close(); await ended;
  }
});
test('exact public message GET is identity-bound and only a 404 is tombstone proof', async () => {
  let response = Response.json({ id: 'm', roomId: 'r', text: 'Body', created: '2026-11-01T00:00:00Z' });
  const reads: string[] = [];
  const api = new WebexMessagingAPI(() => 'synthetic', async (url, options) => {
    reads.push(String(url)); assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    return response;
  });
  try {
    assert.equal((await api.getMessage('r', 'm'))!.text, 'Body');
    assert.deepEqual(reads, ['https://webexapis.com/v1/messages/m']);
    response = new Response('', { status: 404 }); assert.equal(await api.getMessage('r', 'm'), undefined);
    for (const status of [401, 403, 429, 500]) {
      response = new Response('', { status }); await assert.rejects(api.getMessage('r', 'm'));
    }
    response = Response.json({ id: 'other', roomId: 'r', text: 'Wrong identity' });
    await assert.rejects(api.getMessage('r', 'm'), /identity/);
    await assert.rejects(api.getMessage('r', '../bad'));
  } finally { api.close(); }
});
test('retained deletion/revocation identities are capped and saturation fails closed without losing drafts or replaying reads', async () => {
  const f = fixture();
  try {
    await f.store.loadRooms(); await f.store.select('r');
    for (let i = 0; i < 1002; i++) {
      f.store.acceptExternalMessage({ id: 'r', type: 'group', title: 'r', lastActivity: '' }, message('deleted-' + i, 4));
      f.store.observeDeletion('r', 'deleted-' + i);
    }
    assert.equal((f.store as any).deleted.size, 1000);
    assert.equal(f.store.ready, false);
    await f.store.refresh(); assert.deepEqual(f.reads, []);
    assert.match(f.store.notice, /budget/);
  } finally { f.store.close(); }
});
test('revocation saturation closes all old authority and in-flight room discovery cannot restore it', async () => {
  const f = fixture(), loaded = deferred<{ items: any[] }>();
  try {
    await f.store.loadRooms(); await f.store.select('r');
    const valid = f.store.conversationOwner('r');
    f.api.rooms = () => loaded.promise;
    const loading = f.store.loadRooms();
    for (let i = 0; i <= 1000; i++) f.store.revokeRoom('revoked-' + i);
    assert.equal((f.store as any).blockedRooms.size, 1000);
    assert.equal(f.store.isRevoked('r'), true); assert.equal(valid(), false);
    loaded.resolve({ items: [{ id: 'inflight', title: 'Late', type: 'group', lastActivity: '' }] }); await loading;
    assert.equal(f.store.rooms.some(room => room.id === 'inflight'), false);
    assert.equal(f.store.ready, false); assert.match(f.store.notice, /budget/);
  } finally { f.store.close(); }
});
test('unselected deletion saturation publishes lost readiness even when no loaded message body changed', async () => {
  const f = fixture(), observations: boolean[] = [];
  try {
    await f.store.loadRooms(); await f.store.select('r');
    f.store.onChange = () => observations.push(f.store.ready);
    for (let i = 0; i <= 1000; i++) f.store.observeDeletion('unselected', 'deleted-' + i);
    assert.equal(f.store.ready, false);
    assert.equal(observations.at(-1), false, 'native observers must not retain an old ready=true projection');
    assert.equal((f.store as any).deleted.size, 1000);
    const emitted = observations.length;
    f.store.observeDeletion('unselected', 'after-saturation');
    assert.equal(observations.length, emitted, 'a closed budget cannot amplify unchanged invalidations');
  } finally { f.store.close(); }
});
test('positive room-history denial revokes its original room even after selection moves; 401 is not membership proof', async () => {
  const f = fixture(), revoked: string[] = [];
  (f.store as any).onAccessLost = (room: string) => revoked.push(room);
  try {
    await f.store.loadRooms(); await f.store.select('r');
    const denied = deferred<Error>(), entered = deferred<void>();
    f.api.history = async () => { entered.resolve(); throw await denied.promise; };
    const oldPoll = f.store.refresh(); await entered.promise;
    f.api.history = async () => ({ items: [message('other-message', 4)] });
    await f.store.select('other');
    denied.resolve(new MessagingError('denied', 'Access denied', 403)); await oldPoll;
    assert.equal(f.store.room!.id, 'other'); assert.equal(f.store.ready, true);
    assert.deepEqual(revoked, ['r']);
    assert.equal(f.store.rooms.some(room => room.id === 'r'), false);
    f.store.mergeRooms([{ id: 'r', title: 'Stale', type: 'group', lastActivity: '' }]);
    assert.equal(f.store.rooms.some(room => room.id === 'r'), false);
    f.api.history = async () => { throw new MessagingError('denied', 'Expired access', 401); };
    await f.store.refresh();
    assert.deepEqual(revoked, ['r'], 'token expiration does not prove loss of another room membership');
    assert.ok(f.store.rooms.some(room => room.id === 'other'));
  } finally { f.store.close(); }
});
for (const overflow of [false, true]) test(`positive self-removal during SDK startup fences REST discovery (overflow=${overflow})`, async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const source: any = {
    onRooms() {}, onFailure() {}, close() {}, markRead: async () => { throw new Error('RECEIPTS FORBIDDEN'); },
    start: async () => {
      source.onChanges?.([{ kind: 'room-revoked', roomId: 'r' }]);
      if (overflow) for (let i = 0; i < 65; i++) source.onChanges?.([{ kind: 'room-revoked', roomId: 'extra-' + i }]);
      source.onRooms([{ id: 'r', title: 'SDK stale row', type: 'group',
        lastActivity: '2026-11-01T12:00:00.000Z', lastSeen: '2026-11-01T11:00:00.000Z' }]);
    },
  };
  const directory = await mkdtemp('/tmp/opencode/wbx-startup-revocation-'), path = join(directory, 'config.json');
  await writeFile(path, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'r', title: 'REST stale row', type: 'group' as const, lastActivity: '' }] }));
  const engine = new EditorEngine(undefined, () => source), snapshots: ReturnType<EditorEngine['snapshot']>[] = [];
  engine.on('state', value => snapshots.push(value));
  try {
    await engine.start('live', path, true);
    assert.equal(engine.snapshot().state, overflow ? 'failed' : 'ready');
    if (overflow) assert.match(engine.snapshot().notice, /budget/);
    assert.equal(engine.snapshot().rooms.some(room => room.id === 'r'), false);
    assert.ok(snapshots.every(value => !value.rooms.some(room => room.id === 'r')), 'startup never briefly publishes a positively revoked row');
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});
