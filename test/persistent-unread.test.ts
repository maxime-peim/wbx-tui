import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import { SpacesCache, spacesCacheAccount, spacesCacheKey, SPACES_CACHE_LIMITS, type CachedUnread } from '../src/spaces-cache.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { RoomReadStatus } from '../src/read-status-protocol.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';

const profile = { clientId: 'persistent-unread-test', clientSecret: 'PRIVATE-SECRET', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
const at = '2026-11-10T12:00:00.000Z', before = '2026-11-10T11:00:00.000Z';
const rooms: MessageRoom[] = ['known-unread', 'known-read', 'unknown'].map(id => ({ id, title: id, type: 'group', lastActivity: at }));
const confirmed = (id: string, unread: boolean): RoomReadStatus => ({ ...rooms.find(room => room.id === id)!, lastSeen: unread ? before : at });
const flags = (observedAt = Date.now() - 1000): CachedUnread[] => [{ id: 'known-unread', unread: true, observedAt }, { id: 'known-read', unread: false, observedAt }];
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function until(engine: EditorEngine, check: () => boolean): Promise<void> {
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { if (check()) { clearTimeout(timer); engine.off('state', done); resolve(); } };
    const timer = setTimeout(() => { engine.off('state', done); reject(new Error('Persistent unread fixture timeout.')); }, 3000);
    engine.on('state', done); done();
  });
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-persistent-unread-'), base = join(directory, 'cache'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  let rest = rooms, initial: RoomReadStatus[] = [], restGate: Promise<void> | undefined, sdkGate: Promise<void> | undefined, identityGate: Promise<void> | undefined;
  let account = 'owner-a', identities = 0, factories = 0, histories = 0, receipts = 0, sends = 0, receiptFailed = false;
  const access = { token: 'PRIVATE-ACCESS', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 };
  const sources: ReadStatusSource[] = [], engines: EditorEngine[] = [];
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {}); // Test cache time, never real auth timers.
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.equal(url, 'https://webexapis.com/v1/people/me'); identities++; const id = account; await identityGate;
    return new Response(JSON.stringify({ id, type: 'person' }));
  });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => { await restGate; return { items: rest }; });
  t.mock.method(WebexMessagingAPI.prototype, 'history', async (id: string) => {
    histories++; return { items: [{ id: `message-${id}`, created: at, author: 'Local', text: 'NEVER PERSIST THIS BODY' }] };
  });
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw new Error('No posts allowed.'); });
  const createEngine = () => {
    const engine = new EditorEngine(async () => assert.fail('No browser allowed.'), () => {
      factories++; const rows = initial, pending = sdkGate;
      const source: ReadStatusSource = { onRooms() {}, onFailure() {}, onHealth() {},
        async start() { source.onRooms(rows); await pending; },
        async markRead() { receipts++; if (receiptFailed) throw new Error('Synthetic unknown receipt.'); }, close() {} };
      sources.push(source); return source;
    }, undefined, undefined, undefined, { create: () => new SpacesCache(base), account: spacesCacheAccount });
    engines.push(engine); return engine;
  };
  const engine = createEngine();
  t.after(async () => { for (const item of engines) item.stop(); await rm(directory, { recursive: true, force: true }); });
  return { engine, createEngine, config, base, sources,
    async seed(unread = flags()) { const cache = new SpacesCache(base); await cache.save(spacesCacheKey(config, profile, account), rooms, unread); cache.close(); },
    start: (owner = engine, cached = true, read = true) => owner.start('live', config, read, false, false, cached),
    row: (id: string, owner = engine) => owner.snapshot().rooms.find(room => room.id === id),
    source: () => sources.at(-1)!, setInitial(rows: RoomReadStatus[]) { initial = rows; },
    holdRest(pending?: Promise<void>) { restGate = pending; }, holdSDK(pending?: Promise<void>) { sdkGate = pending; }, holdIdentity(pending?: Promise<void>) { identityGate = pending; },
    setAccount(id: string) { account = id; }, setRest(value: MessageRoom[]) { rest = value; }, failReceipt() { receiptFailed = true; },
    counts: () => ({ identities, factories, histories, receipts, sends }),
    async document() { const files = (await readdir(join(base, 'wbx-tui-spaces'))).filter(name => name.endsWith('.json')); return JSON.parse(await readFile(join(base, 'wbx-tui-spaces', files[0]!), 'utf8')); } };
}

test('persisted unread/read flags appear on cached and fresh metadata but stay stale even when the SDK is healthy and omits them', async t => {
  const f = await fixture(t); await f.seed(); const rest = gate(), sdk = gate(); f.holdRest(rest.promise); f.holdSDK(sdk.promise);
  const starting = f.start(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'stale');
  assert.equal(f.row('known-unread')?.cached, true); assert.equal(f.row('known-unread')?.unread, true);
  assert.equal(f.row('known-read')?.unread, false); assert.equal(f.row('unknown')?.unread, undefined);
  assert.ok(f.engine.snapshot().rooms.filter(room => room.unread !== undefined).every(room => room.unreadStale));
  const internal = f.engine as unknown as { unread: { size: number }; reads: { rooms(): unknown[] } };
  assert.equal(internal.unread.size, 0); assert.equal(internal.reads.rooms().length, 0, 'file bits never enter authoritative SDK maps');
  await assert.rejects(f.engine.select('known-unread'), /browse-only/);
  rest.resolve(); await until(f.engine, () => f.engine.snapshot().spacesCache.verified === true);
  assert.equal(f.row('known-unread')?.cached, undefined); assert.equal(f.row('known-unread')?.unreadStale, true);
  sdk.resolve(); await starting; assert.equal(f.engine.snapshot().readStatus, 'ready');
  for (const id of ['known-unread', 'known-read']) {
    await f.engine.select(id); await assert.rejects(f.engine.markRead(id, `message-${id}`), /unavailable or stale/);
  }
  f.source().onHealth!('live'); f.source().onRooms([]);
  assert.equal(f.row('known-read')?.unreadStale, true); assert.equal(f.row('unknown')?.unread, undefined);
  assert.equal(f.counts().receipts, 0); assert.equal(f.counts().sends, 0);
});

test('only a fresh per-room SDK observation supersedes disk history; partial snapshots cannot freshen other flags', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  f.source().onRooms([confirmed('known-unread', false)]);
  assert.equal(f.row('known-unread')?.unread, false); assert.equal(f.row('known-unread')?.unreadStale, false);
  assert.equal(f.row('known-read')?.unreadStale, true); assert.equal(f.row('unknown')?.unread, undefined);
  await f.engine.select('known-read'); await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  f.source().onRooms([confirmed('known-read', true)]);
  assert.equal(f.row('known-read')?.unread, true); assert.equal(f.row('known-read')?.unreadStale, false);
  await f.engine.markRead('known-read', 'message-known-read'); assert.equal(f.counts().receipts, 1);
});

test('a late disk load cannot overwrite a newer SDK observation, and only the small confirmed flag is written', async t => {
  const f = await fixture(t); await f.seed([{ id: 'known-unread', unread: false, observedAt: Date.now() - 5000 }]);
  f.setInitial([confirmed('known-unread', true)]); const identity = gate(); f.holdIdentity(identity.promise);
  await f.start(); assert.equal(f.row('known-unread')?.unread, true); assert.equal(f.row('known-unread')?.unreadStale, false);
  identity.resolve(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const document = await f.document(); assert.equal(document.version, 2);
  assert.equal(document.unread.find((flag: CachedUnread) => flag.id === 'known-unread').unread, true);
  for (const flag of document.unread) assert.deepEqual(Object.keys(flag).sort(), ['id', 'observedAt', 'unread']);
  for (const forbidden of ['PRIVATE-ACCESS', 'PRIVATE-SECRET', 'lastSeen', 'message-known', 'NEVER PERSIST THIS BODY']) assert.ok(!JSON.stringify(document).includes(forbidden));
  assert.equal(f.row('known-read')?.unread, undefined, 'missing flags are not fabricated as read');
});

test('real confirmed flags survive a new engine instance without restoring freshness or renewing their observation times', async t => {
  const f = await fixture(t); f.setInitial([confirmed('known-unread', true), confirmed('known-read', false)]);
  await f.start(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const saved = (await f.document()).unread;
  assert.deepEqual(saved.map((flag: CachedUnread) => [flag.id, flag.unread]), [['known-unread', true], ['known-read', false]]);
  f.engine.stop(); f.setInitial([]); const sdk = gate(); f.holdSDK(sdk.promise);
  const other = f.createEngine(), starting = f.start(other);
  await until(other, () => !!other.snapshot().spacesCache.observedAt);
  assert.equal(f.row('known-unread', other)?.unread, true); assert.equal(f.row('known-read', other)?.unread, false);
  assert.equal(f.row('known-unread', other)?.unreadStale, true); assert.equal(f.row('unknown', other)?.unread, undefined);
  assert.deepEqual((await f.document()).unread, saved, 'a warm metadata rewrite does not advance any flag timestamp');
  sdk.resolve(); await starting;
  await other.select('known-unread'); await assert.rejects(other.markRead('known-unread', 'message-known-unread'), /unavailable or stale/);
  assert.equal(f.counts().receipts, 0);
});

test('cached flags are neither displayed nor saved with read_status disabled; spaces_cache off performs no cache identity work', async t => {
  const f = await fixture(t); await f.seed(); await f.start(f.engine, true, false);
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.ok(f.engine.snapshot().rooms.every(room => room.unread === undefined && room.unreadStale === undefined));
  assert.deepEqual((await f.document()).unread, []); assert.equal(f.counts().factories, 0);
  f.engine.stop(); const other = f.createEngine(), count = f.counts().identities;
  await f.start(other, false, true); assert.equal(f.counts().identities, count);
  assert.ok(other.snapshot().rooms.every(room => room.unread === undefined));
});

test('a verified different account never inherits persisted or pre-verification in-memory unread state', async t => {
  const f = await fixture(t); await f.seed(); f.setInitial([confirmed('known-unread', true)]); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const internal = f.engine as unknown as { failed(message: string): void };
  internal.failed('Synthetic session failure.'); f.setAccount('owner-b'); f.setInitial([]);
  const identity = gate(); f.holdIdentity(identity.promise); await f.start();
  assert.equal(f.row('known-unread')?.unread, undefined, 'new auth cannot expose old memory while account verification is pending');
  identity.resolve(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.equal(f.row('known-unread')?.unread, undefined); assert.equal(f.row('known-read')?.unread, undefined);
  assert.equal(f.counts().receipts, 0);
});

test('ordinary RPC account/session replacement keeps retained observations empty while verified disk identity is pending', async t => {
  const f = await fixture(t); await f.seed(); f.setInitial([confirmed('known-unread', true)]);
  const packets: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => packets.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(value => value.id === request); assert.ok(reply && !reply.error, method); return reply.result;
  };
  const start = () => send('session.start', { mode: 'live', config: f.config, readStatus: true, spacesCache: true });
  await send('hello', { version: 1 }); await start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.equal(f.row('known-unread')?.unreadStale, false);
  const firstSession = f.engine.snapshot().localContext!.sessionId, old = f.source();
  await send('session.stop');
  f.setAccount('owner-b'); f.setInitial([]); const identity = gate(); f.holdIdentity(identity.promise);
  await start();
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, firstSession);
  assert.equal(f.engine.snapshot().spacesCache.state, 'loading');
  assert.equal(f.row('known-unread')?.unread, undefined, 'old SDK ledger and old account disk flags are not shown while verifying');
  const revision = f.engine.snapshot().revision;
  old.onRooms([confirmed('known-read', true)]);
  assert.equal(f.engine.snapshot().revision, revision);
  identity.resolve(); await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  assert.equal(f.row('known-unread')?.unread, undefined);
  f.source().onRooms([confirmed('known-read', false)]);
  await send('rooms.select', { roomId: 'known-read' });
  const state = await send('state.get');
  assert.equal(state.ready, true); assert.equal(state.room.unread, false); assert.equal(state.room.unreadStale, false);
  assert.equal(state.messages[0].id, 'message-known-read');
  assert.equal(f.counts().receipts, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC retained-unread account/session replacement',
    preVerificationFlags: 0, oldSourcePublications: 0, newAccountHistoryReady: state.ready, implicitReceipts: 0 }));
});

test('flag expiry updates an otherwise idle list independently of fresh metadata age', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const f = await fixture(t); await f.seed(flags(now - SPACES_CACHE_LIMITS.ageMs + 100));
  const rest = gate(), sdk = gate(); f.holdRest(rest.promise); f.holdSDK(sdk.promise);
  const starting = f.start(); await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'stale');
  assert.equal(f.row('known-read')?.unread, false); const revision = f.engine.snapshot().revision;
  t.mock.timers.tick(100);
  assert.ok(f.engine.snapshot().revision > revision, 'expiry publishes without waiting for another poll or command');
  assert.equal(f.row('known-read')?.unread, undefined); assert.equal(f.row('known-unread')?.unread, undefined);
  assert.equal(f.row('known-read')?.cached, true, 'fresh-enough cached metadata can outlive an older flag');
  rest.resolve(); sdk.resolve(); await starting;
});

test('metadata activity and receipt ACK/failure cannot invent, clear or renew a persisted observation', async t => {
  const f = await fixture(t); f.setInitial([confirmed('known-unread', true)]); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  // Deliberate owner-local inspection retains the exact stored time/value check.
  const internal = f.engine as unknown as { disk: { flags: Map<string, CachedUnread> } };
  const beforeFlag = { ...internal.disk.flags.get('known-unread')! };
  await f.engine.select('known-unread'); await f.engine.markRead('known-unread', 'message-known-unread');
  assert.deepEqual(internal.disk.flags.get('known-unread'), beforeFlag); assert.equal(f.row('known-unread')?.unread, true);
  f.failReceipt(); await assert.rejects(f.engine.markRead('known-unread', 'message-known-unread'), /Nothing was retried/);
  assert.deepEqual(internal.disk.flags.get('known-unread'), beforeFlag);
  f.setRest(rooms.map(room => ({ ...room, lastActivity: '2026-11-10T13:00:00.000Z' }))); await f.engine.rooms();
  assert.equal(internal.disk.flags.get('unknown'), undefined); assert.deepEqual(internal.disk.flags.get('known-unread'), beforeFlag);
});

test('clear drops disk-only flags immediately without replaying writes or disturbing fresh live read status', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  f.source().onRooms([confirmed('known-unread', false)]);
  await f.engine.clearCachedSpaces();
  assert.equal(f.row('known-read')?.unread, undefined); assert.equal(f.row('known-unread')?.unread, false);
  assert.equal(f.row('known-unread')?.unreadStale, false);
  f.source().onRooms([confirmed('known-read', true)]); await f.engine.rooms();
  assert.equal(f.row('known-read')?.unread, true);
  assert.deepEqual((await readdir(join(f.base, 'wbx-tui-spaces'))).filter(name => name.endsWith('.json')), []);
  assert.equal(f.counts().receipts, 0);
});

test('old SDK callbacks cannot repopulate or publish persisted flags after stop', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const source = f.source(); f.engine.stop(); const revision = f.engine.snapshot().revision;
  source.onRooms([confirmed('known-read', true)]); source.onHealth!('live');
  assert.equal(f.engine.snapshot().revision, revision);
  assert.equal((f.engine as unknown as { disk: { flags: Map<string, unknown> } }).disk.flags.size, 0);
});

test('persistent observation memory stays bounded under changing SDK memberships and never guesses evicted/unknown flags', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  await until(f.engine, () => !!f.engine.snapshot().spacesCache.observedAt);
  const internal = f.engine as unknown as { disk: { flags: Map<string, unknown> } };
  for (let batch = 0; batch < 4; batch++) {
    f.source().onRooms(Array.from({ length: 500 }, (_, i) => ({ id: `batch-${batch}-${i}`, title: 'Synthetic', type: 'group', lastActivity: at, lastSeen: before })));
    assert.ok(internal.disk.flags.size <= 1000);
  }
  assert.equal(f.row('unknown')?.unread, undefined); assert.equal(f.row('known-read')?.unread, undefined, 'eviction is unknown, not a fabricated read value');
});
