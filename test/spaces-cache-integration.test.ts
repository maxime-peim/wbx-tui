import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import { SpacesCache, spacesCacheKey, spacesCacheAccount } from '../src/spaces-cache.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { AccessCredentials } from '../src/auth-protocol.js';
import { parseEditorOperation, parseEditorRequest } from '../src/editor-protocol.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';

const profile = { clientId: 'synthetic-cache', clientSecret: 'PRIVATE-SECRET', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
const rooms: MessageRoom[] = [{ id: 'kept', title: 'Fresh name', type: 'group', lastActivity: '2026-11-10T12:00:00.000Z' }];
const old: MessageRoom[] = [{ ...rooms[0]!, title: 'Old name' }, { ...rooms[0]!, id: 'removed', title: 'Former membership' }];
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function until(engine: EditorEngine, check: () => boolean): Promise<void> {
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { if (check()) { clearTimeout(timer); engine.off('state', done); resolve(); } };
    const timer = setTimeout(() => { engine.off('state', done); reject(new Error('Synthetic cache state timeout.')); }, 3000);
    engine.on('state', done); done();
  });
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-spaces-engine-'), config = join(directory, 'config.json'), base = join(directory, 'cache');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  let access: AccessCredentials = { token: 'PRIVATE-ACCESS', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 };
  let account = 'account-a', rest = rooms, restGate: Promise<void> | undefined, identityGate: Promise<void> | undefined, sdkGate: Promise<void> | undefined;
  let failure = false, identities = 0, histories = 0, sends = 0, receipts = 0, creates = 0, restReads = 0;
  const sources: ReadStatusSource[] = [];
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => { restReads++; await restGate; if (failure) throw new Error('Synthetic REST failure.'); return { items: rest }; });
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => { histories++; return { items: [{ id: 'message-kept', author: 'Synthetic', text: 'Never cached body', created: rooms[0]!.lastActivity }] }; });
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw new Error('No sends admitted.'); });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.equal(url, 'https://webexapis.com/v1/people/me'); identities++;
    const id = account; await identityGate;
    return new Response(JSON.stringify({ id, type: 'person', displayName: 'PRIVATE IDENTITY RESPONSE', emails: ['private@example.invalid'] }));
  });
  const engine = new EditorEngine(async () => assert.fail('No real browser.'), () => {
    const source: ReadStatusSource = { onRooms() {}, onFailure() {}, async start() { await sdkGate; source.onRooms(rooms.map(room => ({ ...room, lastSeen: '2026-11-10T11:00:00.000Z' }))); },
      async markRead() { receipts++; }, close() {} }; sources.push(source); return source;
  }, undefined, undefined, undefined, { create() { creates++; return new SpacesCache(base); }, account: spacesCacheAccount });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  const key = () => spacesCacheKey(config, profile, account);
  return { engine, config, base, directory, sources, key, row: () => engine.snapshot().rooms[0],
    async seed() { const cache = new SpacesCache(base); await cache.save(key(), old); cache.close(); },
    start: (cache = true, read = false) => engine.start('live', config, read, false, false, cache),
    setRest(value: MessageRoom[]) { rest = value; }, fail(value = true) { failure = value; },
    setAccount(value: string) { account = value; }, setScope(value: string) { access = { ...access, scope: value }; },
    rotateToken() { access = { ...access, token: 'DIFFERENT-PRIVATE-ACCESS' }; },
    restGate(value?: Promise<void>) { restGate = value; }, identityGate(value?: Promise<void>) { identityGate = value; }, sdkGate(value?: Promise<void>) { sdkGate = value; },
    restReads: () => restReads, counts: () => ({ identities, histories, sends, receipts, creates }),
    async persisted() { const files = (await readdir(join(base, 'wbx-tui-spaces'))).filter(name => name.endsWith('.json')); return Promise.all(files.map(name => readFile(join(base, 'wbx-tui-spaces', name), 'utf8'))); } };
}

test('cache-disabled catalogue distinguishes pending, failed, explicit retry and successful empty/nonempty without identity or mutation work', async t => {
  const f = await fixture(t); f.setRest([]); f.fail();
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  await rpc.receive(JSON.stringify({ jsonrpc:'2.0', id:1, method:'hello', params:{ version:1 } }));
  assert.equal(output.at(-1).result.state.roomsStatus, 'unverified');
  const refresh = (id: number) => rpc.receive(JSON.stringify({ jsonrpc:'2.0', id, method:'rooms.list', params:{} }));
  const rest = gate(); f.restGate(rest.promise);
  assert.equal(f.engine.snapshot().roomsStatus, 'unverified');
  const starting = f.start(false);
  await until(f.engine, () => f.engine.snapshot().roomsStatus === 'loading');
  assert.equal(f.engine.snapshot().loadingRooms, true);
  assert.deepEqual(f.engine.snapshot().spacesCache, { state: 'off' });
  rest.resolve(); await starting;
  assert.equal(f.engine.snapshot().state, 'ready', 'a failed catalogue is not a failed messaging connection');
  assert.equal(f.engine.snapshot().roomsStatus, 'failed'); assert.deepEqual(f.engine.snapshot().rooms, []);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.restReads(), 1);
  f.restGate(); f.fail(false);
  await refresh(2);
  assert.equal(f.engine.snapshot().roomsStatus, 'ready'); assert.deepEqual(f.engine.snapshot().rooms, []);
  f.fail(); await refresh(3);
  assert.equal(f.engine.snapshot().roomsStatus, 'failed', 'previous successful emptiness is not reused after another failure');
  f.fail(false); f.setRest(rooms); await refresh(4);
  assert.equal(f.engine.snapshot().roomsStatus, 'ready'); assert.equal(f.row()?.id, 'kept');
  assert.deepEqual(f.counts(), { identities: 0, histories: 0, sends: 0, receipts: 0, creates: 0 });
  assert.equal(f.restReads(), 4); assert.equal(f.engine.snapshot().room, null);
  assert.deepEqual(output.filter(item => item.method === 'state').map(item => item.params.roomsStatus)
    .filter((value, index, values) => index === 0 || value !== values[index-1]),
    ['unverified','loading','failed','loading','ready','loading','failed','loading','ready'],
    'JSON-RPC coalescing preserves catalogue evidence transitions without a new capability');
  f.engine.stop(); assert.equal(f.engine.snapshot().roomsStatus, 'unverified');
});

test('catalogue status is independent of cached metadata, unread startup and old-session completions', async t => {
  const f = await fixture(t); await f.seed(); f.fail();
  await f.start(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'stale');
  assert.equal(f.engine.snapshot().roomsStatus, 'failed'); assert.equal(f.engine.snapshot().rooms[0]?.cached, true);
  f.engine.stop();
  const rest = gate(); f.restGate(rest.promise); f.fail(false); f.setRest([]);
  const starting = f.start(false);
  await until(f.engine, () => f.engine.snapshot().roomsStatus === 'loading');
  f.engine.stop(); rest.resolve(); await starting;
  assert.equal(f.engine.snapshot().roomsStatus, 'unverified');
  assert.deepEqual(f.engine.snapshot().rooms, []); assert.equal(f.engine.snapshot().state, 'idle');
  f.restGate(); const sdk = gate(); f.sdkGate(sdk.promise);
  const combined = f.start(false, true);
  await until(f.engine, () => f.engine.snapshot().roomsStatus === 'ready');
  assert.equal(f.engine.snapshot().loadingRooms, true, 'REST evidence does not prematurely release the existing unread startup gate');
  sdk.resolve(); await combined;
  assert.equal(f.engine.snapshot().loadingRooms, false);
  assert.equal(f.engine.snapshot().roomsStatus, 'ready', 'supplemental SDK rows cannot replace REST success/failure evidence');
  f.engine.stop(); f.sdkGate(); f.fail();
  await f.start(false, true);
  assert.equal(f.engine.snapshot().roomsStatus, 'failed', 'SDK metadata after failed REST discovery cannot verify the catalogue');
  assert.ok(f.engine.snapshot().rooms.length > 0, 'supplemental rows remain useful without an absence claim');
  assert.deepEqual(f.counts(), { identities: 1, histories: 0, sends: 0, receipts: 0, creates: 1 });
});

test('cache is default-off/demo-inert and cannot perform filesystem or identity work through ordinary inspection', async t => {
  const f = await fixture(t);
  f.engine.snapshot(); assert.equal(f.engine.snapshot().spacesCache.state, 'off');
  await f.start(false); await f.engine.rooms(); f.engine.snapshot();
  assert.equal(f.counts().creates, 0); assert.equal(f.counts().identities, 0);
  await assert.rejects(f.start(true), /Disconnect/);
  f.engine.stop(); await f.engine.start('demo', f.config, false, false, false, true);
  assert.equal(f.engine.snapshot().roomsStatus, 'ready', 'demo discovery uses the same observational lifecycle');
  assert.equal(f.engine.snapshot().spacesCache.state, 'off'); assert.equal(f.counts().creates, 0); assert.equal(f.counts().identities, 0);
});

test('verified-account cached rows arrive before REST/SDK, remain browse-only, and fresh REST releases display before unread initialization', async t => {
  const f = await fixture(t); await f.seed(); const rest = gate(), sdk = gate(); f.restGate(rest.promise); f.sdkGate(sdk.promise);
  const starting = f.start(true, true);
  await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'stale');
  const cached = f.engine.snapshot();
  for (const value of ['PRIVATE-ACCESS', 'PRIVATE-SECRET', 'PRIVATE IDENTITY RESPONSE', 'account-a']) assert.ok(!JSON.stringify(cached).includes(value));
  assert.deepEqual(cached.rooms.map(room => room.id), ['kept', 'removed']); assert.equal(cached.spacesCache.verified, false);
  assert.ok(cached.rooms.every(room => room.cached === true && room.unread === undefined && room.unreadStale === undefined));
  assert.equal(cached.room, null); assert.deepEqual(cached.messages, []); assert.equal(cached.ready, false); assert.equal(cached.moreRooms, false);
  await assert.rejects(f.engine.select('kept'), /browse-only/);
  await f.engine.send('cached-send', 'kept', 'Do not send'); await assert.rejects(f.engine.markRead('kept', 'message-kept'));
  assert.deepEqual(f.counts(), { identities: 1, histories: 0, sends: 0, receipts: 0, creates: 1 });
  rest.resolve(); await until(f.engine, () => f.engine.snapshot().spacesCache.verified === true);
  assert.deepEqual(f.engine.snapshot().rooms.map(room => room.id), ['kept']); assert.equal(f.row()?.title, 'Fresh name');
  assert.equal(f.row()?.cached, undefined); assert.equal(f.row()?.unread, undefined); assert.equal(f.engine.snapshot().readStatus, 'connecting');
  await f.engine.select('kept'); assert.equal(f.counts().histories, 1);
  await assert.rejects(f.engine.markRead('kept', 'message-kept'), /unavailable/);
  sdk.resolve(); await starting;
  assert.equal(f.row()?.unread, true); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  for (const raw of await f.persisted()) {
    for (const value of ['PRIVATE-ACCESS', 'PRIVATE-SECRET', 'PRIVATE IDENTITY RESPONSE', 'Never cached body', 'lastSeen', 'messages']) assert.ok(!raw.includes(value));
    for (const flag of JSON.parse(raw).unread) assert.deepEqual(Object.keys(flag).sort(), ['id', 'observedAt', 'unread']);
  }
  assert.equal(f.counts().receipts, 0);
});

test('missing identity grant and failed identity do not probe/guess accounts or block fresh messaging', async t => {
  const f = await fixture(t); await f.seed(); f.setScope('spark:rooms_read spark:messages_read spark:messages_write');
  await f.start(); assert.equal(f.engine.snapshot().spacesCache.reason, 'scope-required'); assert.equal(f.counts().identities, 0);
  assert.equal(f.row()?.title, 'Fresh name'); await f.engine.select('kept');
  f.engine.stop(); f.setScope('spark:all'); f.setAccount('me'); await f.start();
  await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'unavailable');
  assert.equal(f.engine.snapshot().spacesCache.reason, 'identity-unavailable'); assert.equal(f.row()?.cached, undefined);
});

test('a different verified account or profile cannot load a prior list, even with the same token', async t => {
  const f = await fixture(t); await f.seed(); f.setAccount('account-b'); const rest = gate(); f.restGate(rest.promise);
  const starting = f.start(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'miss');
  assert.deepEqual(f.engine.snapshot().rooms, []); rest.resolve(); await starting;
  await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'ready');
  assert.equal(f.row()?.title, 'Fresh name'); assert.equal(f.row()?.cached, undefined);
});

test('cache identity/load cannot replace already fresh rows or delay startup when its service is slow', async t => {
  const f = await fixture(t); await f.seed(); const identity = gate(); f.identityGate(identity.promise);
  await f.start(); assert.equal(f.row()?.title, 'Fresh name'); assert.equal(f.row()?.cached, undefined);
  assert.equal(f.engine.snapshot().spacesCache.state, 'loading');
  identity.resolve(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'ready');
  assert.equal(f.row()?.title, 'Fresh name'); assert.equal(f.row()?.cached, undefined);
});

test('a fresh empty membership list replaces the cache rather than preserving removed destinations', async t => {
  const f = await fixture(t); await f.seed(); f.setRest([]);
  await f.start(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.deepEqual(f.engine.snapshot().rooms, []); assert.equal(f.engine.snapshot().spacesCache.verified, true);
  await assert.rejects(f.engine.select('kept'), /existing listed/);
  assert.deepEqual(JSON.parse((await f.persisted())[0]!).rooms, []);
});

test('corrupt local data cannot fail the live connection, leak file contents or overwrite a current space list', async t => {
  const f = await fixture(t); await f.seed();
  const files = await readdir(join(f.base, 'wbx-tui-spaces'));
  await writeFile(join(f.base, 'wbx-tui-spaces', files[0]!), '{PRIVATE LOCAL FILE CONTENT');
  await f.start(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'unavailable');
  assert.equal(f.engine.snapshot().state, 'ready'); assert.equal(f.row()?.title, 'Fresh name');
  assert.equal(f.engine.snapshot().spacesCache.reason, 'cache-unavailable');
  assert.ok(!JSON.stringify(f.engine.snapshot()).includes('PRIVATE LOCAL FILE CONTENT'));
  await f.engine.select('kept'); assert.equal(f.counts().histories, 1);
});

test('renewed tokens reuse account-scoped metadata without more identity reads; losing the grant disables cache writes without disabling messaging', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const before = f.counts().identities;
  f.rotateToken();
  await f.engine.refreshAuth(); assert.equal(f.counts().identities, before);
  f.setScope('spark:rooms_read spark:messages_read spark:messages_write');
  await f.engine.refreshAuth(); assert.equal(f.engine.snapshot().spacesCache.reason, 'scope-required');
  assert.equal(f.engine.snapshot().spacesCache.verified, true); assert.equal(f.row()?.title, 'Fresh name');
  await f.engine.select('kept'); assert.equal(f.counts().identities, before);
});

test('REST failure retains a labeled non-actionable list until an explicit successful refresh reconciles removed spaces', async t => {
  const f = await fixture(t); await f.seed(); f.fail(); await f.start();
  await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'stale');
  assert.equal(f.engine.snapshot().spacesCache.reason, 'refresh-failed', 'a cache arriving after REST failure must not imply a refresh is still running');
  await assert.rejects(f.engine.select('removed'), /browse-only/);
  f.fail(false); await f.engine.rooms();
  assert.equal(f.engine.snapshot().spacesCache.verified, true); assert.deepEqual(f.engine.snapshot().rooms.map(room => room.id), ['kept']);
  await assert.rejects(f.engine.select('removed'), /existing listed/); assert.equal(f.counts().histories, 0);
});

test('disconnect suppresses late identity success and explicit clear forgets the current profile without repopulating it in this session', async t => {
  const f = await fixture(t); await f.seed(); const identity = gate(); f.identityGate(identity.promise);
  await f.start(); f.engine.stop(); const stopped = f.engine.snapshot().revision;
  identity.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.engine.snapshot().revision, stopped); assert.equal(f.engine.snapshot().spacesCache.state, 'off');
  f.identityGate(); await f.start(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  await f.engine.clearCachedSpaces(); assert.equal(f.engine.snapshot().spacesCache.reason, 'cleared');
  await f.engine.rooms(); assert.deepEqual(await f.persisted(), []); assert.equal(f.row()?.title, 'Fresh name');
});

test('ordinary RPC disk restore, failed refresh, recovery and clear leave live history independent of held SDK startup', async t => {
  const f = await fixture(t); await f.seed(); f.fail(); const sdk = gate(); f.sdkGate(sdk.promise);
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = output.find(value => value.id === request); assert.ok(reply && !reply.error, method); return reply.result;
  };
  await send('hello', { version: 1 });
  const starting = send('session.start', { mode: 'live', config: f.config, spacesCache: true, readStatus: true });
  await until(f.engine, () => f.engine.snapshot().spacesCache.reason === 'refresh-failed');
  assert.equal(f.row()?.cached, true); assert.equal(f.engine.snapshot().spacesCache.verified, false);
  assert.deepEqual(f.engine.snapshot().rooms.map(room => room.id), ['kept', 'removed']);
  assert.equal(f.counts().histories, 0); assert.equal(f.counts().creates, 1); assert.equal(f.counts().identities, 1);
  f.fail(false); await send('rooms.list');
  assert.deepEqual(f.engine.snapshot().rooms.map(room => room.id), ['kept']);
  await send('rooms.select', { roomId: 'kept' });
  const live = await send('state.get');
  assert.equal(live.ready, true); assert.equal(live.messages[0].id, 'message-kept');
  assert.equal(live.readStatus, 'connecting', 'cached refresh/history do not wait for optional SDK startup');
  assert.equal(live.spacesCache.verified, true); assert.equal(live.room.cached, undefined); assert.equal(live.room.unread, undefined);
  sdk.resolve(); await starting;
  assert.equal(f.row()?.unreadStale, false);
  await send('spaces.cacheClear');
  await send('rooms.list');
  const cleared = await send('state.get');
  assert.equal(cleared.spacesCache.reason, 'cleared'); assert.equal(cleared.ready, true);
  assert.equal(cleared.room.unreadStale, false); assert.deepEqual(await f.persisted(), []);
  assert.equal(f.counts().receipts, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC disk restore refresh recovery and clear',
    restoredRows: 2, reconciledRows: 1, historyBeforeSDKSettlement: live.ready,
    clearLeavesLiveUnreadFresh: true, implicitReceipts: f.counts().receipts, identityReads: f.counts().identities }));
});

test('ordinary RPC disk account replacement ignores delayed old identity and binds only the current session', async t => {
  const f = await fixture(t); await f.seed();
  const oldIdentity = gate(); f.identityGate(oldIdentity.promise);
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = output.find(value => value.id === request); assert.ok(reply && !reply.error, method); return reply.result;
  };
  const start = () => send('session.start', { mode: 'live', config: f.config, spacesCache: true });
  await send('hello', { version: 1 }); await start();
  assert.equal(f.engine.snapshot().spacesCache.state, 'loading'); assert.equal(f.counts().creates, 0);
  const oldSession = f.engine.snapshot().localContext!.sessionId;
  await send('session.stop'); f.setAccount('account-b'); const nextIdentity = gate(); f.identityGate(nextIdentity.promise);
  await start();
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, oldSession);
  const revision = f.engine.snapshot().revision;
  oldIdentity.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.counts().creates, 0);
  nextIdentity.resolve(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.equal(f.counts().creates, 1);
  const internal = f.engine as unknown as { disk: { boundKey(): string | undefined } };
  assert.equal(internal.disk.boundKey(), f.key());
  await send('rooms.select', { roomId: 'kept' });
  const live = await send('state.get');
  assert.equal(live.ready, true); assert.equal(live.room.cached, undefined);
  assert.deepEqual(live.rooms.map((room: MessageRoom) => room.id), ['kept']);
  assert.equal(f.counts().receipts, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC disk account/session replacement',
    oldIdentityPublications: 0, retiredStorageCreates: 0, currentStorageCreates: f.counts().creates, currentHistoryReady: live.ready }));
});

test('cache RPC accepts only a boolean opt-in and no-argument clear, with explicit capability and no credential/profile IDs', async t => {
  const start = (value: unknown) => parseEditorOperation(parseEditorRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.start', params: { mode: 'demo', spacesCache: value } })));
  for (const value of [null, 0, 1, 'true', {}, []]) assert.throws(() => start(value)); assert.equal(start(true).method, 'session.start');
  const f = await fixture(t), output: any[] = [], meetings = new EditorMeetings(), calls: unknown[][] = [];
  t.mock.method(f.engine, 'start', async (...args: unknown[]) => { calls.push(args); });
  t.mock.method(f.engine, 'clearCachedSpaces', async () => { calls.push(['clear']); });
  const rpc = new EditorRPC(f.engine, meetings, value => output.push(value)); t.after(() => rpc.close());
  const wire = (id: number, method: string, params = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  await rpc.receive(wire(1, 'hello', { version: 1 })); assert.ok(output.at(-1).result.capabilities.includes('spaces-cache'));
  await rpc.receive(wire(2, 'session.start', { mode: 'demo', spacesCache: true })); assert.deepEqual(calls[0], ['demo', undefined, false, false, false, true]);
  await rpc.receive(wire(3, 'spaces.cacheClear', { accountId: 'untrusted' })); assert.equal(output.at(-1).error.code, -32602);
  await rpc.receive(wire(4, 'spaces.cacheClear')); assert.deepEqual(calls.at(-1), ['clear']);
});
