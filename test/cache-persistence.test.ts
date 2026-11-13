import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { transform } from 'esbuild';
import { SpacesCache, spacesCacheKey, SPACES_CACHE_LIMITS, type CachedUnread } from '../src/spaces-cache.js';
import { chatId } from '../src/chat-protocol.js';
import { peopleId, readPeopleJSON } from '../src/people-status.js';
import { deadline } from '../src/lifecycle.js';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import type { ReadStatusSource } from '../src/read-status.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';

const profile = { clientId: 'cache-pressure', clientSecret: 'PRIVATE-SECRET', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
const room: MessageRoom = { id: 'room', title: 'Initial', type: 'group', lastActivity: '2026-11-10T12:00:00.000Z' };
const key = spacesCacheKey('/synthetic/config.json', profile, 'owner-a');
const deferred = () => {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(check(), 'bounded local persistence operation reached its controlled boundary');
}
const source = fs.readFile(new URL('../src/spaces-cache.ts', import.meta.url), 'utf8')
  .then(contents => transform(contents, { loader: 'ts', format: 'cjs', target: 'node22' }));
const privateSource = fs.readFile(new URL('../src/private-cache.ts', import.meta.url), 'utf8')
  .then(contents => transform(contents, { loader: 'ts', format: 'cjs', target: 'node22' }));

/** Execute the actual cache with only filesystem operation boundaries wrapped.
 * Every permission/link/atomic-write check still uses real private files. */
async function storageFixture(t: TestContext) {
  const directory = await fs.mkdtemp('/tmp/opencode/wbx-cache-pressure-'), base = join(directory, 'cache');
  let now = Date.now(), blocked = true, pauseRename = false, pauseStat = false, active = 0, maxActive = 0;
  const syncs: { value: any; gate: ReturnType<typeof deferred> }[] = [], renames: ReturnType<typeof deferred>[] = [], stats: ReturnType<typeof deferred>[] = [];
  const works = new Set<Promise<unknown>>();
  const io = { ...fs,
    async open(path: Parameters<typeof fs.open>[0], flags: Parameters<typeof fs.open>[1], mode?: Parameters<typeof fs.open>[2]) {
      const file = await fs.open(path, flags, mode);
      if (typeof flags === 'number' && flags & constants.O_WRONLY) {
        const sync = file.sync.bind(file);
        file.sync = async () => {
          const entry = { value: JSON.parse(await fs.readFile(path, 'utf8')), gate: deferred() }; syncs.push(entry);
          active++; maxActive = Math.max(maxActive, active);
          try { if (blocked) await entry.gate.promise; await sync(); } finally { active--; }
        };
      }
      return file;
    },
    async rename(from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) {
      if (pauseRename) { pauseRename = false; const gate = deferred(); renames.push(gate); await gate.promise; }
      await fs.rename(from, to);
    },
    async lstat(path: Parameters<typeof fs.lstat>[0]) {
      if (pauseStat) { pauseStat = false; const gate = deferred(); stats.push(gate); await gate.promise; }
      return fs.lstat(path);
    },
  };
  const nativeRequire = createRequire(import.meta.url), module = { exports: {} as { SpacesCache: typeof SpacesCache } };
  const modules: Record<string, unknown> = { 'node:fs/promises': io, './chat-protocol.js': { chatId },
    './people-status.js': { peopleId, readPeopleJSON }, './lifecycle.js': { deadline } };
  const environment = { process, Buffer, TextDecoder,
    require(name: string): unknown {
      if (name in modules) return modules[name];
      assert.ok(['node:fs', 'node:crypto', 'node:os', 'node:path'].includes(name)); return nativeRequire(name);
    } };
  const privateModule = { exports: {} };
  runInNewContext((await privateSource).code, { ...environment, module: privateModule, exports: privateModule.exports });
  modules['./private-cache.js'] = privateModule.exports;
  runInNewContext((await source).code, { ...environment, module, exports: module.exports });
  const cache = new module.exports.SpacesCache(base, () => now);
  const track = <T>(work: Promise<T>): Promise<T> => { works.add(work); void work.catch(() => {}); return work; };
  const releaseAll = () => { blocked = false; for (const entry of syncs) entry.gate.resolve(); for (const gate of [...renames, ...stats]) gate.resolve(); };
  t.after(async () => { cache.close(); releaseAll(); await Promise.allSettled(works); await fs.rm(directory, { recursive: true, force: true }); });
  const path = (value = key) => join(cache.directory, `${parseInt(value.slice(0, 2), 16) % SPACES_CACHE_LIMITS.slots}.json`);
  return { cache, directory, base, syncs, renames, stats, works, track, path, now: () => now, advance(ms: number) { now += ms; },
    save(rooms: MessageRoom[], unread: CachedUnread[] = [], value = key) { return track(cache.save(value, rooms, unread)); },
    releaseAll, pauseRename() { pauseRename = true; }, pauseStat() { pauseStat = true; }, maxActive: () => maxActive,
    async document(value = key) { return JSON.parse(await fs.readFile(path(value), 'utf8')); } };
}

class ControlledCache extends SpacesCache {
  jobs: { key: string; rooms: MessageRoom[]; unread: CachedUnread[]; observedAt: number; gate: ReturnType<typeof deferred>; work: Promise<void> }[] = [];
  active = 0; maxActive = 0; revoked = false; failClear = false;
  override async load() { return undefined; }
  override save(key: string, rooms: MessageRoom[], unread: CachedUnread[] = [], observedAt = Date.now()): Promise<void> {
    assert.equal(this.revoked, false, 'a revoked owner cannot admit another storage operation');
    const gate = deferred(); this.active++; this.maxActive = Math.max(this.maxActive, this.active);
    const work = gate.promise.finally(() => { this.active--; });
    this.jobs.push({ key, rooms: structuredClone(rooms), unread: structuredClone(unread), observedAt, gate, work });
    return work;
  }
  override close() { this.revoked = true; }
  override async clear() {
    this.close(); await Promise.allSettled(this.jobs.map(job => job.work));
    if (this.failClear) throw new Error('Synthetic clear failure');
  }
  releaseAll() { for (const job of this.jobs) job.gate.resolve(); }
}
async function engineFixture(t: TestContext) {
  const directory = await fs.mkdtemp('/tmp/opencode/wbx-cache-owner-'), config = join(directory, 'config.json');
  await fs.writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  const start = Date.now(); let monotonic = 0, account = 'owner-a', rest = [{ ...room }];
  let scope = 'spark:all spark:kms';
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: start });
  t.mock.method(performance, 'now', () => monotonic);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network forbidden'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'PRIVATE-TOKEN', expiresAt: Date.now() + 3600_000, scope }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => ({ token: 'PRIVATE-TOKEN', expiresAt: Date.now() + 3600_000, scope }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rest }));
  const caches: ControlledCache[] = [], sources: ReadStatusSource[] = [];
  const engine = new EditorEngine(async () => assert.fail('Browser forbidden'), () => {
    const source: ReadStatusSource = { onRooms() {}, onFailure() {}, async start() {}, async markRead() { assert.fail('Receipts forbidden'); }, close() {} };
    sources.push(source); return source;
  }, undefined, undefined, undefined, { create() { const cache = new ControlledCache(join(directory, 'unused-cache')); caches.push(cache); return cache; }, account: async () => account });
  t.after(async () => {
    engine.stop(); for (const cache of caches) cache.releaseAll();
    await Promise.allSettled(caches.flatMap(cache => cache.jobs.map(job => job.work)));
    await fs.rm(directory, { recursive: true, force: true });
  });
  await engine.start('live', config, true, false, false, true);
  for (let i = 0; i < 32 && !caches[0]?.jobs.length; i++) await Promise.resolve();
  assert.equal(caches[0]?.jobs.length, 1);
  return { engine, caches, sources, config, start,
    step(ms: number) { monotonic += ms; t.mock.timers.tick(ms); },
    setRooms(title: string) { rest = [{ ...room, title }]; }, setAccount(value: string) { account = value; }, setScope(value: string) { scope = value; } };
}

test('slow storage retains one active commit and one shared latest pending document, not every fsync', async t => {
  const f = await storageFixture(t), first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  const writes: Promise<void>[] = [];
  for (let i = 0; i < 200; i++) { f.advance(1); writes.push(f.save([{ ...room, title: `Latest ${i}` }])); }
  assert.equal(f.syncs.length, 1);
  f.releaseAll(); await Promise.all([first, ...writes]);
  assert.equal(f.syncs.length, 2, 'only active and latest pending documents reach fsync');
  assert.equal(new Set(writes).size, 1, 'replacements share one completion promise, not an unbounded waiter list');
  assert.equal(f.maxActive(), 1); assert.equal((await f.document()).rooms[0].title, 'Latest 199');
});

test('coalesced documents detach caller data and preserve capture/flag times across delayed commit', async t => {
  const f = await storageFixture(t), first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  f.advance(1000); const observedAt = f.now(), metadata = [{ ...room, title: 'Captured' }], flags = [{ id: room.id, unread: true, observedAt: observedAt - 100 }];
  const latest = f.save(metadata, flags); metadata[0]!.title = 'Foreign mutation'; flags[0]!.observedAt = observedAt + 5000;
  f.advance(100_000); f.releaseAll(); await Promise.all([first, latest]);
  const document = await f.document(); assert.equal(document.observedAt, observedAt);
  assert.equal(document.rooms[0].title, 'Captured'); assert.equal(document.unread[0].observedAt, observedAt - 100);
});

test('clear waits for an admitted rename, cancels pending documents and never restores the old cache afterwards', async t => {
  const f = await storageFixture(t); f.pauseRename();
  const first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  const pending = f.save([{ ...room, title: 'Must never commit' }]);
  f.syncs[0]!.gate.resolve(); await until(() => f.renames.length === 1);
  const clearing = f.track(f.cache.clear(key));
  let cleared = false; void clearing.then(() => { cleared = true; }); await Promise.resolve(); assert.equal(cleared, false);
  f.renames[0]!.resolve(); f.releaseAll(); await clearing; await Promise.allSettled([first, pending]);
  assert.equal(f.syncs.length, 1); await assert.rejects(fs.lstat(f.path()));
  assert.ok((await fs.readdir(f.cache.directory)).every(name => !name.endsWith('.tmp')));
});

test('clear never reopens save admission after close, including while its own file check is pending', async t => {
  const f = await storageFixture(t); f.releaseAll(); await f.save([{ ...room }]);
  f.pauseStat(); const clearing = f.track(f.cache.clear(key)); f.cache.close();
  await until(() => f.stats.length === 1);
  assert.throws(() => f.save([{ ...room, title: 'Resurrected' }]), /unavailable/);
  f.releaseAll(); await clearing; await assert.rejects(fs.lstat(f.path()));
});

test('close cancels shared pending saves immediately but does not release a blocked native commit', async t => {
  const f = await storageFixture(t), first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  const pending = f.save([{ ...room, title: 'Canceled pending' }]); let rejected = false, settled = false;
  void pending.catch(() => { rejected = true; }); void first.finally(() => { settled = true; }).catch(() => {});
  f.cache.close(); await Promise.resolve(); await Promise.resolve();
  assert.equal(rejected, true); assert.equal(settled, false, 'a noncooperative fsync retains the active operation until it settles');
  f.releaseAll(); await Promise.allSettled([first, pending]);
  assert.equal(f.syncs.length, 1); await assert.rejects(fs.lstat(f.path()));
  assert.ok((await fs.readdir(f.cache.directory)).every(name => !name.endsWith('.tmp')));
});

test('coalescing never substitutes a different profile for a pending save, including a slot collision', async t => {
  const f = await storageFixture(t), first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  const other = `${key.slice(0, 2)}${'1'.repeat(62)}`, third = `${key.slice(0, 2)}${'2'.repeat(62)}`;
  const pending = f.save([{ ...room, id: 'other-room', title: 'Other profile' }], [], other);
  assert.throws(() => f.save([{ ...room, title: 'Must not replace another profile' }], [], third), /unavailable/);
  f.releaseAll(); await Promise.all([first, pending]);
  assert.equal((await f.document(other)).profile, other);
  assert.equal(await f.cache.load(key), undefined);
  assert.equal((await f.cache.load(other))?.rooms[0]?.id, 'other-room');
});

test('failed active commits do not replay, but a latest pending document can still commit once', async t => {
  const f = await storageFixture(t), first = f.save([{ ...room }]); await until(() => f.syncs.length === 1);
  const latest = f.save([{ ...room, title: 'Latest after failure' }]);
  f.syncs[0]!.gate.reject(new Error('Synthetic fsync failure')); f.releaseAll();
  await assert.rejects(first); await latest;
  assert.equal(f.syncs.length, 2); assert.equal((await f.document()).rooms[0].title, 'Latest after failure');
});

test('engine retains one active save and one latest pending snapshot across many rate-limit windows', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!;
  for (let i = 0; i < 40; i++) { f.step(5000); f.setRooms(`Latest ${i}`); await f.engine.rooms(); }
  assert.equal(cache.jobs.length, 1, 'slow storage cannot accumulate save calls every five seconds');
  cache.jobs[0]!.gate.resolve();
  for (let i = 0; i < 32 && cache.jobs.length < 2; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 2); assert.equal(cache.jobs[1]!.rooms[0]!.title, 'Latest 39');
  assert.equal(cache.maxActive, 1); cache.releaseAll();
});

test('engine cache status records observation time rather than slow storage completion time', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!, observedAt = cache.jobs[0]!.observedAt;
  f.step(100_000); cache.jobs[0]!.gate.resolve();
  for (let i = 0; i < 32 && !f.engine.snapshot().spacesCache.observedAt; i++) await Promise.resolve();
  assert.equal(f.engine.snapshot().spacesCache.observedAt, observedAt);
});

test('identical genuine metadata observations remain distinct from no observation, and only SDK observations renew flag ages', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!;
  f.sources[0]!.onRooms([{ ...room, lastSeen: '2026-11-10T11:00:00.000Z' }]);
  f.step(5000); await f.engine.rooms(); cache.jobs[0]!.gate.resolve();
  for (let i = 0; i < 32 && cache.jobs.length < 2; i++) await Promise.resolve();
  assert.equal(cache.jobs[1]!.unread[0]!.observedAt, f.start, 'metadata refresh does not renew an old SDK flag');
  assert.equal(cache.jobs[1]!.observedAt, f.start + 5000);
  cache.jobs[1]!.gate.resolve(); await Promise.resolve(); await Promise.resolve();
  f.step(5000); await f.engine.rooms();
  for (let i = 0; i < 32 && cache.jobs.length < 3; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 3, 'unchanged membership contents still carry a genuine new observation');
  assert.equal(cache.jobs[2]!.unread[0]!.observedAt, f.start); cache.releaseAll();
});

test('identical SDK observations retain their actual ages through admission throttling and never restore read authority on commit', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!, status = { ...room, lastSeen: '2026-11-10T11:00:00.000Z' };
  f.sources[0]!.onRooms([status]); f.step(5000); cache.jobs[0]!.gate.resolve();
  for (let i = 0; i < 32 && cache.jobs.length < 2; i++) await Promise.resolve();
  assert.equal(cache.jobs[1]!.unread[0]!.observedAt, f.start);
  f.sources[0]!.onRooms([{ ...status }]);
  cache.jobs[1]!.gate.resolve(); for (let i = 0; i < 32; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 2, 'next admission still honors the five-second interval');
  f.step(5000);
  assert.equal(cache.jobs.length, 3);
  assert.equal(cache.jobs[2]!.observedAt, f.start + 5000);
  assert.equal(cache.jobs[2]!.unread[0]!.observedAt, f.start + 5000, 'admission at 10 seconds is not a new SDK observation');
  f.sources[0]!.onHealth!('refresh-unavailable'); cache.jobs[2]!.gate.resolve();
  for (let i = 0; i < 32; i++) await Promise.resolve();
  assert.equal(f.engine.snapshot().readStatus, 'failed');
  assert.equal(f.engine.snapshot().rooms[0]!.unreadStale, true);
});

test('empty SDK invalidation and refresh failure cannot renew the cache document observation', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!;
  cache.jobs[0]!.gate.resolve(); for (let i = 0; i < 32; i++) await Promise.resolve();
  f.step(5000); f.sources[0]!.onRooms([]); f.sources[0]!.onHealth!('refresh-unavailable');
  for (let i = 0; i < 32; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 1, 'invalidation is not a genuine new observation to persist');
  assert.equal(f.engine.snapshot().spacesCache.observedAt, f.start);
  assert.equal(f.engine.snapshot().readStatus, 'failed');
});

test('engine preserves a failed write transition, drains only latest new work and never retries without a new observation', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!, states: string[] = [];
  f.engine.on('state', state => states.push(state.spacesCache.state));
  f.step(5000); f.setRooms('New after failure'); await f.engine.rooms();
  cache.jobs[0]!.gate.reject(new Error('Synthetic storage failure'));
  for (let i = 0; i < 32 && cache.jobs.length < 2; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 2); assert.equal(cache.jobs[1]!.rooms[0]!.title, 'New after failure');
  assert.ok(states.includes('unavailable')); cache.jobs[1]!.gate.resolve();
  for (let i = 0; i < 32; i++) await Promise.resolve();
  assert.equal(f.engine.snapshot().spacesCache.state, 'ready');
  f.step(10_000); assert.equal(cache.jobs.length, 2);
});

test('ordinary RPC navigation stays ready while disk write failure drains one latest recovery snapshot', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!;
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({
    items: [{ id: 'message-room', author: 'Synthetic', text: 'Not persisted', created: room.lastActivity }],
  }));
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = output.find(value => value.id === request); assert.ok(reply && !reply.error, method); return reply.result;
  };
  await send('hello', { version: 1 });
  await send('rooms.select', { roomId: 'room' });
  const held = await send('state.get');
  assert.equal(held.ready, true); assert.equal(held.messages[0].id, 'message-room');
  f.step(5000); f.setRooms('Latest recovery'); await send('rooms.list');
  assert.equal(cache.jobs.length, 1, 'the held physical write is not bypassed');
  cache.jobs[0]!.gate.reject(new Error('Synthetic disk failure'));
  for (let i = 0; i < 32 && cache.jobs.length < 2; i++) await Promise.resolve();
  assert.equal(cache.jobs.length, 2); assert.equal(cache.jobs[1]!.rooms[0]!.title, 'Latest recovery');
  cache.jobs[1]!.gate.resolve();
  for (let i = 0; i < 32; i++) await Promise.resolve();
  const recovered = await send('state.get');
  assert.equal(recovered.spacesCache.state, 'ready'); assert.equal(recovered.ready, true);
  assert.deepEqual(recovered.messages, held.messages); assert.equal(cache.maxActive, 1);
  f.step(10_000); assert.equal(cache.jobs.length, 2);
  t.diagnostic(JSON.stringify({ workflow: 'RPC disk write failure and recovery',
    physicalSaves: cache.jobs.length, maxPhysicalSaves: cache.maxActive, historyWhileWriteHeld: held.ready, idleRetries: 0 }));
});

test('a late clear failure cannot overwrite a newer scope-loss state in the same session', async t => {
  const f = await engineFixture(t), cache = f.caches[0]!; cache.failClear = true;
  const clearing = f.engine.clearCachedSpaces(), rejected = assert.rejects(clearing, /could not be cleared safely/);
  f.setScope('spark:rooms_read'); await f.engine.refreshAuth();
  assert.equal(f.engine.snapshot().spacesCache.reason, 'scope-required');
  const revision = f.engine.snapshot().revision; cache.releaseAll(); await rejected;
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.engine.snapshot().spacesCache.reason, 'scope-required');
});

for (const action of ['stop', 'clear', 'scope-loss', 'account-switch'] as const) test(`cache ${action} revokes pending work and ignores old save completions`, async t => {
  const f = await engineFixture(t), old = f.caches[0]!;
  f.step(5000); f.setRooms('Pending old owner'); await f.engine.rooms();
  let clearing: Promise<void> | undefined;
  if (action === 'clear') clearing = f.engine.clearCachedSpaces();
  else if (action === 'scope-loss') { f.setScope('spark:rooms_read'); await f.engine.refreshAuth(); }
  else f.engine.stop();
  if (action === 'account-switch') { f.setAccount('owner-b'); await f.engine.start('live', f.config, true, false, false, true); }
  const revision = f.engine.snapshot().revision;
  old.releaseAll(); await clearing;
  for (let i = 0; i < 32; i++) await Promise.resolve();
  assert.equal(f.engine.snapshot().revision, revision);
  assert.equal(old.jobs.length, 1, 'revoked latest work was not submitted');
  if (action === 'account-switch') assert.notEqual(old.jobs[0]!.key, f.caches[1]!.jobs[0]!.key);
});
