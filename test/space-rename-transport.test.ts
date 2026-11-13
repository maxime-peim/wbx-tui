/** MF23 actual engine/PublicREST composition; fixed-origin requests redirected only to an inert loopback fixture. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI, type MessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import { OAuthSession } from '../src/oauth.js';
import { PublicREST } from '../src/public-rest.js';
import type { ReadStatusSource } from '../src/read-status.js';
import { SpacesCache, type CachedUnread } from '../src/spaces-cache.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';

const oldTitle = 'Existing standalone', newTitle = 'Sprint résumé 😀 | inert title';
const grants = 'spark:people_read spark:rooms_read spark:memberships_read spark:rooms_write';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => boolean) {
  const end = Date.now() + 3000;
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'bounded physical settlement');
}
class MemoryCache extends SpacesCache {
  jobs: { rooms: MessageRoom[]; unread: CachedUnread[]; observedAt: number }[] = [];
  override async load() { return undefined; }
  override async save(_key: string, rooms: MessageRoom[], unread: CachedUnread[] = [], observedAt = Date.now()) {
    this.jobs.push(structuredClone({ rooms, unread, observedAt }));
  }
  override close() {}
}
async function fixture(t: TestContext, options: {
  room?: Record<string, unknown>; membership?: Record<string, unknown>; duplicate?: boolean;
  status?: number; ack?: (raw: Record<string, unknown>) => unknown;
  hold?: 'self' | 'room' | 'member' | 'put'; scopes?: string; listed?: Partial<MessageRoom>; cache?: boolean; self?: string;
} = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-rename-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'INERT', scope: options.scopes ?? 'spark:all', expiresAt: Date.now() + 600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK operation'));
  const room: MessageRoom = { id: 'group', title: oldTitle, type: 'group', lastActivity: '2026-11-01T12:00:00Z', ...options.listed };
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ ...room },
    { id: 'other', title: 'Other', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{
    id: 'existing-message', author: 'Peer', text: 'Retained history', created: room.lastActivity,
  }] }));
  const calls: { method: string; path: string; body: Buffer }[] = [], held = deferred<void>();
  const replies: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), path = req.url!, method = req.method!;
    calls.push({ method, path, body });
    assert.equal(req.headers.authorization, 'Bearer INERT');
    let step: 'self' | 'room' | 'member' | 'put', value: unknown, status = 200;
    if (path === '/v1/people/me') { step = 'self'; value = { id: options.self ?? 'self' }; }
    else if (method === 'GET' && path === '/v1/rooms/group') { step = 'room'; value = { ...room, isLocked: false, ...options.room }; }
    else if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      step = 'member';
      const membership = { id: 'own', roomId: 'group', personId: 'self', isModerator: false, ...options.membership };
      value = { items: options.duplicate ? [membership, membership] : [membership] };
    } else {
      assert.equal(method, 'PUT'); assert.equal(path, '/v1/rooms/group');
      assert.equal(req.headers['content-type'], 'application/json');
      assert.equal(Number(req.headers['content-length']), body.length);
      const intent = JSON.parse(body.toString());
      assert.deepEqual(Object.keys(intent), ['title']);
      step = 'put'; status = options.status ?? 200;
      const raw = { ...room, title: intent.title, isLocked: false, ignoredLargeProfile: 'x'.repeat(20000) };
      value = options.ack ? options.ack(raw) : raw;
    }
    if (method === 'GET') assert.equal(body.length, 0);
    const reply = () => {
      res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
      res.end(status === 204 ? undefined : JSON.stringify(value));
    };
    if (options.hold === step) { replies.push(reply); held.resolve(); } else reply();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const native = (input: any, receive: (res: any) => void) => {
    assert.equal(input.protocol, 'https:'); assert.equal(input.hostname, 'webexapis.com'); assert.equal(input.agent, false);
    return request({ ...input, protocol: 'http:', hostname: '127.0.0.1', port }, receive);
  };
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {}, close() {},
    markRead: async () => assert.fail('Rename must never mark read') };
  const cache = new MemoryCache();
  const engine = new EditorEngine(undefined, () => source, undefined, undefined, undefined,
    { create: () => cache, account: async () => 'self' }, { publicRequest: native });
  t.after(async () => {
    engine.stop(); for (const reply of replies.splice(0)) reply(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, readStatus: true, notificationPreview: true, ...(options.cache ? { spacesCache: true } : {}) });
  await engine.select('group'); source.onHealth?.('live');
  const delivery: unknown[] = [];
  engine.on('delivery', value => delivery.push(value));
  engine.on('direct.delivery', value => delivery.push(value));
  return { engine, calls, room, source, delivery, cache, config, held: held.promise,
    release: () => { for (const reply of replies.splice(0)) reply(); },
    puts: () => calls.filter(call => call.method === 'PUT'),
    send: (id = 'rename', expected = oldTitle, title = newTitle) => engine.renameSpace(id, 'group', expected, title) };
}
for (const change of ['same-partition', 'account', 'config', 'clientId', 'redirectUri', 'scopes'] as const)
  test(`C2 physical engine/RPC reset recovery: ${change}, no replay, later deliberate rename`, async t => {
    const options = { ack: (raw: Record<string, unknown>): unknown => ({ ...raw, id: 'invalid-ack' }), self: 'self' };
    const f = await fixture(t, options), output: any[] = [];
    const rpc = new EditorRPC(f.engine, new EditorMeetings(), value => { output.push(value); });
    let serial = 0;
    const invoke = async (params: object) => {
      const id = ++serial;
      await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method: 'conversations.resolve', params }));
      return output.find(value => value.id === id);
    };
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: ++serial, method: 'hello', params: { version: 1 } }));
    assert.equal((await f.send('original')).status, 'unknown');
    const previous = f.engine.snapshot().localContext!.sessionId;
    f.engine.stop();
    let config = f.config;
    if (change === 'account') options.self = 'other-account';
    if (change === 'config') {
      config = join(f.config, '..', 'other.json');
      await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
        redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
    }
    if (['clientId', 'redirectUri', 'scopes'].includes(change)) {
      await writeFile(config, JSON.stringify({ oauth: { clientId: change === 'clientId' ? 'different-client' : 'inert', clientSecret: 'inert',
        redirectUri: change === 'redirectUri' ? 'http://127.0.0.1:53683/oauth/callback' : 'http://127.0.0.1:53682/oauth/callback',
        scopes: change === 'scopes' ? ['spark:rooms_read', 'spark:people_read'] : ['spark:rooms_read'] } }), { mode: 0o600 });
    }
    await f.engine.startSession({ mode: 'live', config, readStatus: true, notificationPreview: true });
    await f.engine.select('group');
    assert.notEqual(f.engine.snapshot().localContext!.sessionId, previous);
    assert.equal(f.puts().length, 1, 'stop/start never resubmits');
    assert.throws(() => f.engine.resolveConversationAction('rename', 'group', 'original'), 'sync API cannot adopt retired evidence');
    assert.equal((await invoke({ action: 'rename', roomId: 'group', requestId: 'wrong', checked: true })).error.code, -32035);
    const before = f.calls.length, snapshot = f.engine.snapshot();
    const result = await invoke({ action: 'rename', roomId: 'group', requestId: 'original', checked: true });
    assert.deepEqual(f.calls.slice(before).map(c => c.method + ' ' + c.path), ['GET /v1/people/me']);
    assert.deepEqual(f.engine.snapshot(), snapshot, 'resolution publishes no metadata/cache/roles');
    assert.equal(f.puts().length, 1);
    if (change === 'same-partition') {
      assert.equal(result.result, null);
      options.ack = raw => raw;
      assert.equal((await f.send('deliberate')).status, 'changed');
      assert.equal(f.puts().length, 2);
    } else {
      assert.equal(result.error.code, -32035, 'no old-account/config/profile evidence adoption');
      f.engine.stop(); options.self = 'self';
      await writeFile(f.config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
        redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
      await f.engine.startSession({ mode: 'live', config: f.config }); await f.engine.select('group');
      assert.equal((await invoke({ action: 'rename', roomId: 'group', requestId: 'original', checked: true })).result, null,
        'refusal never consumes the original account evidence');
      assert.equal(f.puts().length, 1);
    }
  });
for (const reset of ['stop', 'auth-failure'] as const)
  test(`C2 physical submitted rename ${reset}: late ACK cannot fill active ledger, checked recovery and deliberate work succeed`, async t => {
    const options: { hold?: 'put' } = { hold: 'put' }, f = await fixture(t, options), pending = f.send('original');
    const rejected = assert.rejects(pending);
    await f.held;
    if (reset === 'stop') f.engine.stop();
    else {
      t.mock.method((f.engine as any).oauth, 'refresh', async () => { throw new Error('inert refresh failure'); });
      await f.engine.refreshAuth(); assert.equal(f.engine.snapshot().state, 'failed');
    }
    f.release(); await rejected;
    await until(() => !(f.engine as any).conversations.busy());
    assert.equal((f.engine as any).conversations.requests.size, 0);
    assert.equal((f.engine as any).conversations.uncertain.size, 0);
    options.hold = undefined;
    await f.engine.startSession({ mode: 'live', config: f.config }); await f.engine.select('group');
    await f.engine.recoverConversationAction('rename', 'group', 'original');
    assert.equal(f.puts().length, 1);
    assert.equal((await f.send('deliberate')).status, 'changed'); assert.equal(f.puts().length, 2);
  });
test('MF23 physical engine preflight performs three GETs then one exact UTF-8 title-only PUT, with zero delivery/activity side effects', async t => {
  const f = await fixture(t), before = f.engine.snapshot();
  const outcome = await f.send();
  assert.equal(outcome.status, 'changed');
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), [
    'GET /v1/people/me', 'GET /v1/rooms/group', 'GET /v1/memberships?roomId=group&personId=self&max=100', 'PUT /v1/rooms/group',
  ]);
  assert.deepEqual(f.puts()[0]!.body, Buffer.from(JSON.stringify({ title: newTitle })));
  const after = f.engine.snapshot();
  assert.deepEqual(after.rooms.map(r => r.id === 'group' ? { ...r, title: oldTitle } : r), before.rooms);
  assert.deepEqual({ ...after.room, title: oldTitle }, before.room);
  for (const key of ['messages', 'readStatus', 'messageEvents', 'uploadPending', 'directPending'] as const) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(f.delivery, []);
  await f.send(); assert.equal(f.calls.length, 4, 'exact replay is evidence only');
});
test('MF23 replaying an old ACK never rolls back a later confirmed rename', async t => {
  const f = await fixture(t);
  assert.equal((await f.send('first')).status, 'changed');
  f.room.title = newTitle;
  assert.equal((await f.send('second', newTitle, 'Later confirmed name')).status, 'changed');
  assert.equal((await f.send('first')).status, 'changed');
  assert.equal(f.engine.snapshot().room!.title, 'Later confirmed name');
  assert.equal(f.puts().length, 2);
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, nullTeam: { teamId: null }, readOnly: { isReadOnly: true },
  lock: { isLocked: null }, publicFlag: { isPublic: 'true' }, changedTitle: { title: 'Already changed' },
})) test(`MF23 physical ${kind} room proof never reaches the PUT`, async t => {
  const f = await fixture(t, { room }), outcome = await f.send();
  assert.equal(outcome.status, kind === 'changedTitle' ? 'conflict' : 'failed');
  assert.equal(f.puts().length, 0); assert.equal(f.calls.length, 2);
});
test('MF23 physical duplicate own memberships cannot be collapsed into moderator authority', async t => {
  const f = await fixture(t, { duplicate: true });
  assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3); assert.equal(f.puts().length, 0);
});
test('MF23 physical fresh moderator proof admits a locked standalone space without replaying settings fields', async t => {
  const f = await fixture(t, { room: { isLocked: true, isAnnouncementOnly: true, isPublic: true }, membership: { isModerator: true } });
  assert.equal((await f.send()).status, 'changed'); assert.deepEqual(JSON.parse(f.puts()[0]!.body.toString()), { title: newTitle });
});
for (const [kind, patch] of Object.entries({
  id: { id: 'other' }, type: { type: 'direct' }, title: { title: newTitle + ' ' }, missingTitle: { title: undefined }, errors: { errors: [] },
})) test(`MF23 physical ${kind} ACK is unknown before any title/cache installation`, async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, ...patch }) }), before = f.engine.snapshot();
  assert.equal((await f.send()).status, 'unknown');
  assert.deepEqual(f.engine.snapshot().rooms, before.rooms); assert.deepEqual(f.engine.snapshot().room, before.room);
  await assert.rejects(f.send('fresh', oldTitle, 'Another name')); assert.equal(f.puts().length, 1);
  assert.throws(() => f.engine.resolveConversationAction('rename', 'group', 'not-original'));
  f.engine.resolveConversationAction('rename', 'group', 'rename');
  assert.equal((await f.send('rename')).status, 'unknown', 'resolution does not rewrite old evidence');
});
for (const status of [204, 302, 401, 403, 409, 429, 500]) test(`MF23 title PUT HTTP ${status} is classified once, never redirected/refreshed/retried`, async t => {
  const f = await fixture(t, { status });
  const result = await f.send();
  assert.equal(result.status, [401, 403, 409, 429].includes(status) ? 'failed' : 'unknown');
  assert.equal((await f.send()).status, result.status);
  assert.equal(f.puts().length, 1); assert.equal(f.calls.length, 4);
});
for (const step of ['self', 'room', 'member', 'put'] as const) test(`MF23 ${step} grant loss is refused before admission or unknown after PUT`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.send();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:rooms_write' }); f.release();
  assert.equal((await pending).status, step === 'put' ? 'unknown' : 'failed');
  assert.equal(f.puts().length, step === 'put' ? 1 : 0);
});
test('MF23 selection leave-and-return after PUT cannot publish title success or erase its unknown ledger', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.send();
  await f.held; await f.engine.select('other'); await f.engine.select('group'); f.release();
  await assert.rejects(pending);
  assert.equal(f.engine.snapshot().room!.title, oldTitle);
  await assert.rejects(f.send('new-request')); assert.equal(f.puts().length, 1);
});
test('MF23 session replacement after physical PUT rejects publication and never replays through the demo owner', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.send();
  await f.held; f.engine.stop(); await f.engine.start('demo'); f.release();
  await assert.rejects(pending);
  assert.equal(f.engine.snapshot().rooms.some(r => r.id === 'group'), false);
  assert.equal(f.puts().length, 1);
});
test('MF23 retained result drops all unrelated Room/provider data before storing evidence', async t => {
  const f = await fixture(t); await f.send();
  const owner = (f.engine as any).conversations;
  const retained = JSON.stringify(owner.requests.get('rename'));
  assert.ok(Buffer.byteLength(retained) < 16384); assert.doesNotMatch(retained, /ignoredLargeProfile|INERT/);
});
for (const scope of grants.split(' ')) test(`MF23 physical missing ${scope} refuses before any service-shaped request`, async t => {
  const f = await fixture(t, { scopes: grants.split(' ').filter(value => value !== scope).join(' ') });
  await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
});
for (const listed of [{ type: 'direct' as const }, { teamId: 'team' }, { isReadOnly: true }]) {
  test('MF23 loaded direct/Team/read-only exclusion refuses engine admission before all GETs', async t => {
    const f = await fixture(t, { listed });
    await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
  });
}
test('MF23 selected expected-title drift refuses before GETs; a fresh event during preflight prevents PUT', async t => {
  const f = await fixture(t, { hold: 'member' });
  await assert.rejects(f.send('stale-local', 'Different loaded title')); assert.equal(f.calls.length, 0);
  const pending = f.send(); await f.held;
  f.source.onRooms([{ ...f.room, lastSeen: '', title: 'Another client just renamed this' }]); f.release();
  assert.equal((await pending).status, 'failed'); assert.equal(f.puts().length, 0);
});
test('MF23 opt-in existing space cache saves only the title change without renewing age or unread evidence', async t => {
  const f = await fixture(t, { cache: true });
  await until(() => f.cache.jobs.length > 0);
  const before = structuredClone(f.cache.jobs.at(-1)!);
  const next = performance.now() + 6000;
  t.mock.method(performance, 'now', () => next);
  await f.send();
  await until(() => f.cache.jobs.at(-1)!.rooms.find(r => r.id === 'group')!.title === newTitle);
  const after = f.cache.jobs.at(-1)!;
  assert.equal(after.observedAt, before.observedAt);
  assert.deepEqual(after.unread, before.unread);
  assert.deepEqual(after.rooms.map(r => r.id === 'group' ? { ...r, title: oldTitle } : r), before.rooms);
});
test('MF23 already-in-flight room list cannot undo the ACK, but a fresh explicit list can show a later remote rename', async () => {
  const group: MessageRoom = { id: 'group', type: 'group', title: oldTitle, lastActivity: '2026-11-01T12:00:00Z', isLocked: true };
  let response = deferred<{ items: MessageRoom[] }>();
  const api: MessagingAPI = { rooms: async () => response.promise, history: async () => ({ items: [] }), send: async () => assert.fail('No send'), close() {} };
  const store = new MessagingStore(api, 0, 'demo');
  try {
    store.mergeRooms([group]); await store.select('group');
    const before = structuredClone(store.room), pending = store.loadRooms();
    store.renameRoomTitle('group', newTitle);
    response.resolve({ items: [{ ...group }] }); await pending;
    assert.deepEqual(store.room, { ...before, title: newTitle });
    response = deferred();
    const later = store.loadRooms();
    response.resolve({ items: [{ ...group, title: 'Later remote change' }] }); await later;
    assert.equal(store.room!.title, 'Later remote change', 'no sticky local override');
  } finally { store.close(); }
});
test('MF23 physical malformed ACK keeps native PUT admission until stubborn close, including across logical reset', async () => {
  let calls = 0, consumed = false, received!: (value: any) => void;
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
    destroy() { response.emit('close'); return response; },
    async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from([0xc3, 0x28]); },
  });
  const client = Object.assign(new EventEmitter(), {
    end() { queueMicrotask(() => received(response)); return client; }, destroy() { return client; },
  });
  const rest = new PublicREST((options, callback) => {
    calls++; assert.equal(options.method, 'PUT'); assert.equal(options.path, '/v1/rooms/group'); received = callback; return client as any;
  });
  const abort = new AbortController(), pending = rest.call('/v1/rooms/group', 'PUT', 'INERT', abort.signal, { title: newTitle });
  await until(() => consumed); abort.abort(); await assert.rejects(pending);
  assert.equal(rest.busy(), true);
  await assert.rejects(rest.call('/v1/rooms/group', 'PUT', 'INERT', new AbortController().signal, { title: 'No overlap' }));
  assert.equal(calls, 1);
  client.emit('close'); await rest.settled(); assert.equal(rest.busy(), false);
});
