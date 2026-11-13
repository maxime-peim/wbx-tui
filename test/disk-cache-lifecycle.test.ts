import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DiskCacheLifecycle, DiskCacheError, type DiskCacheSession, type DiskCacheStorage } from '../src/disk-cache-lifecycle.js';
import { SPACES_CACHE_LIMITS, type CachedSpaces, type CachedUnread } from '../src/spaces-cache.js';
import type { MessageRoom } from '../src/messaging-api.js';

const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const room: MessageRoom = { id: 'room', title: 'Synthetic', type: 'group', lastActivity: '2026-11-18T11:00:00.000Z' };
const deferred = <T = void>() => {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(t: TestContext, entry?: CachedSpaces) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  let monotonic = 0, current = true, allowed = true, key = 'verified-a', keys = 0, bound = 0;
  let identity: Promise<string> | undefined, loading: Promise<CachedSpaces | undefined> | undefined;
  let metadata = [{ ...room }], metadataReads = 0, hold = false, clearFailure = false;
  t.mock.method(performance, 'now', () => monotonic);
  const caches: ReturnType<typeof create>[] = [], states: ReturnType<DiskCacheLifecycle['snapshot']>[] = [];
  function create(): DiskCacheStorage & {
    closed: boolean; clears: string[];
    jobs: { key: string; rooms: MessageRoom[]; flags: CachedUnread[]; observedAt: number; gate: ReturnType<typeof deferred<void>> }[];
  } {
    const cache = { closed: false, clears: [] as string[],
      jobs: [] as { key: string; rooms: MessageRoom[]; flags: CachedUnread[]; observedAt: number; gate: ReturnType<typeof deferred<void>> }[],
      async load() { return loading ? await loading : structuredClone(entry); },
      save(key: string, rooms: MessageRoom[], flags: CachedUnread[] = [], observedAt = Date.now()) {
        assert.equal(cache.closed, false);
        const gate = deferred(); cache.jobs.push({ key, rooms: structuredClone(rooms), flags: structuredClone(flags), observedAt, gate });
        if (!hold) gate.resolve(); return gate.promise;
      },
      close() { cache.closed = true; },
      async clear(key: string) {
        cache.closed = true; cache.clears.push(key);
        await Promise.allSettled(cache.jobs.map(work => work.gate.promise));
        if (clearFailure) throw new Error('Synthetic clear failure');
      },
    };
    caches.push(cache); return cache;
  }
  const disk = new DiskCacheLifecycle({ create, metadata: () => { metadataReads++; return structuredClone(metadata); },
    changed: () => states.push(disk.snapshot()) });
  const session: DiskCacheSession = { current: () => current, allowed: () => allowed,
    key: async () => { keys++; return identity ? await identity : key; }, verified: () => { bound++; } };
  t.after(async () => {
    disk.stop(); for (const cache of caches) for (const work of cache.jobs) work.gate.resolve();
    await tick();
  });
  return { disk, caches, session, states, counts: () => ({ keys, bound, metadataReads }),
    step(ms: number) { monotonic += ms; t.mock.timers.tick(ms); },
    holdWrites(value = true) { hold = value; }, setMetadata(title: string) { metadata = [{ ...room, title }]; },
    setKey(value: string) { key = value; }, setAllowed(value: boolean) { allowed = value; }, setCurrent(value: boolean) { current = value; },
    identity(value: Promise<string>) { identity = value; }, loading(value: Promise<CachedSpaces | undefined>) { loading = value; },
    failClear() { clearFailure = true; } };
}

test('disk owner binds only a verified current account and never delays fresh metadata behind identity', async t => {
  const f = fixture(t), identity = deferred<string>();
  await f.disk.bind(f.session); assert.equal(f.counts().keys, 0);
  f.disk.reset(true, true); f.identity(identity.promise);
  const binding = f.disk.bind(f.session);
  assert.equal(f.caches.length, 0);
  f.disk.roomsLoaded(true); f.setMetadata('Fresh while identity held');
  assert.equal(f.disk.browseOnly, false); assert.equal(f.caches.length, 0);
  identity.resolve('verified-b'); await binding; await tick();
  assert.equal(f.caches[0]!.jobs[0]!.key, 'verified-b');
  assert.equal(f.caches[0]!.jobs[0]!.rooms[0]!.title, 'Fresh while identity held');
  assert.deepEqual(f.counts(), { keys: 1, bound: 1, metadataReads: 1 });
});

test('disk restore and flag expiry remain separate from metadata expiry and pure snapshots', async t => {
  const f = fixture(t, { observedAt: NOW - 1000, rooms: [room], unread: [
    { id: room.id, unread: false, observedAt: NOW - SPACES_CACHE_LIMITS.ageMs + 100 },
  ] });
  f.disk.reset(true, true); await f.disk.bind(f.session);
  assert.equal(f.disk.browseOnly, true); assert.equal(f.disk.unread(room.id), false);
  const snapshot = f.disk.snapshot(); snapshot.rooms![0]!.title = 'Foreign'; snapshot.status.state = 'off';
  const changes = f.states.length, reads = f.counts().metadataReads;
  for (let i = 0; i < 30; i++) assert.equal(f.disk.snapshot().status.state, 'stale');
  assert.equal(f.states.length, changes); assert.equal(f.counts().metadataReads, reads);
  f.step(100);
  assert.equal(f.disk.unread(room.id), undefined); assert.equal(f.disk.snapshot().rooms![0]!.title, room.title);
  assert.equal(f.disk.snapshot().status.state, 'stale'); assert.ok(f.states.length > changes);
  f.step(SPACES_CACHE_LIMITS.ageMs);
  assert.equal(f.disk.snapshot().rooms, undefined); assert.equal(f.disk.snapshot().status.reason, 'expired');
});

test('disk refresh recovery replaces cached rows and only genuine SDK observations renew flag times', async t => {
  const f = fixture(t, { observedAt: NOW - 500, rooms: [room], unread: [{ id: 'room', unread: true, observedAt: NOW - 1000 }] });
  f.disk.reset(true, true); f.disk.roomsLoaded(false); await f.disk.bind(f.session);
  assert.equal(f.disk.snapshot().status.reason, 'refresh-failed');
  f.step(2000); f.setMetadata('Refreshed'); f.disk.roomsLoaded(true); await tick();
  assert.equal(f.disk.snapshot().rooms, undefined); assert.equal(f.disk.snapshot().status.verified, true);
  assert.equal(f.caches[0]!.jobs[0]!.flags[0]!.observedAt, NOW - 1000);
  f.disk.observe([], Date.now()); f.disk.persist();
  assert.equal(f.caches[0]!.jobs.length, 1, 'empty invalidation is not a new observation');
  f.disk.observe([{ ...room, lastSeen: '2026-11-18T10:00:00.000Z' }], Date.now()); f.disk.persist();
  f.step(5000); await tick();
  assert.equal(f.caches[0]!.jobs[1]!.flags[0]!.observedAt, NOW + 2000, 'throttled admission does not renew capture time');
});

test('disk admission coalesces slow storage, publishes failure and drains only latest new work', async t => {
  const f = fixture(t); f.disk.reset(true, true); f.holdWrites(); await f.disk.bind(f.session);
  f.disk.roomsLoaded(true);
  const cache = f.caches[0]!;
  for (let i = 0; i < 30; i++) { f.step(5000); f.setMetadata('Latest ' + i); f.disk.roomsLoaded(true); }
  assert.equal(cache.jobs.length, 1);
  cache.jobs[0]!.gate.reject(new Error('Synthetic fsync failure')); await tick();
  assert.ok(f.states.some(value => value.status.state === 'unavailable'));
  assert.equal(cache.jobs.length, 2); assert.equal(cache.jobs[1]!.rooms[0]!.title, 'Latest 29');
  cache.jobs[1]!.gate.resolve(); await tick();
  assert.equal(f.disk.snapshot().status.state, 'ready');
  f.step(30_000); await tick(); assert.equal(cache.jobs.length, 2, 'no retry without new evidence');
});

test('disk clear retires hints immediately, waits for storage and never reopens admission', async t => {
  const f = fixture(t); f.disk.reset(true, true); f.holdWrites(); await f.disk.bind(f.session);
  f.disk.roomsLoaded(true); const cache = f.caches[0]!;
  f.disk.observe([{ ...room, lastSeen: '2026-11-18T10:00:00.000Z' }], Date.now()); f.disk.persist();
  assert.equal(f.disk.unread('room'), true);
  const clearing = f.disk.clear(); let settled = false; void clearing.then(() => { settled = true; });
  await tick(); assert.equal(settled, false);
  assert.equal(f.disk.boundKey(), undefined); assert.equal(f.disk.unread('room'), undefined);
  assert.equal(f.disk.snapshot().status.reason, 'cleared');
  f.step(10_000); f.disk.roomsLoaded(true); f.disk.observe([{ ...room, lastSeen: '2026-11-18T10:00:00.000Z' }], Date.now()); f.disk.persist();
  assert.equal(cache.jobs.length, 1);
  cache.jobs[0]!.gate.resolve(); await clearing; await tick();
  assert.equal(f.disk.snapshot().status.reason, 'cleared'); assert.equal(cache.clears.length, 1);
  await assert.rejects(f.disk.clear(), error => error instanceof DiskCacheError && error.reason === 'unbound');
});

test('disk session replacement fences late identity/load and old storage completions', async t => {
  const f = fixture(t), loading = deferred<CachedSpaces | undefined>();
  f.disk.reset(true, true); f.loading(loading.promise);
  const oldBinding = f.disk.bind(f.session); await tick();
  const old = f.caches[0]!;
  f.disk.reset(true, true); f.setKey('other-account');
  loading.resolve({ observedAt: NOW, rooms: [room] }); await oldBinding;
  assert.equal(old.closed, true); assert.equal(f.disk.boundKey(), undefined); assert.equal(f.states.length, 0);
  f.disk.reset(); const identity = deferred<string>(); f.identity(identity.promise);
  f.disk.reset(true, true); const late = f.disk.bind(f.session); f.disk.stop();
  identity.resolve('retired-account'); await late;
  assert.equal(f.caches.length, 1); assert.equal(f.disk.snapshot().status.state, 'off');
});

test('disk scope loss and replacement keep old clear failures from publishing into new authority', async t => {
  const f = fixture(t); f.disk.reset(true, true); f.holdWrites(); f.failClear(); await f.disk.bind(f.session);
  f.disk.roomsLoaded(true); const old = f.caches[0]!;
  const clearing = f.disk.clear(), rejected = assert.rejects(clearing, /clear-failed/);
  f.setAllowed(false); f.disk.scopeLost(); const states = f.states.length;
  old.jobs[0]!.gate.resolve(); await rejected;
  assert.equal(f.states.length, states); assert.equal(f.disk.snapshot().status.reason, 'scope-required');
  assert.equal(f.disk.snapshot().status.verified, true, 'cache grant loss does not revoke live room evidence');
  f.disk.reset(true, true); f.setAllowed(true); f.setKey('new-account');
  await f.disk.bind(f.session); f.disk.roomsLoaded(true);
  assert.equal(f.caches[1]!.jobs[0]!.key, 'new-account');
});

test('disk grant, identity and storage failures stay distinct and cannot block fresh room evidence', async t => {
  const f = fixture(t);
  f.disk.reset(true); f.setAllowed(false); await f.disk.bind(f.session);
  assert.equal(f.disk.snapshot().status.reason, 'scope-required');
  assert.equal(f.counts().keys, 0); assert.equal(f.caches.length, 0);
  f.disk.roomsLoaded(true); assert.equal(f.disk.snapshot().status.verified, true);
  f.disk.reset(true); f.setAllowed(true); f.identity(Promise.reject(new Error('Synthetic identity failure')));
  await f.disk.bind(f.session);
  assert.equal(f.disk.snapshot().status.reason, 'identity-unavailable'); assert.equal(f.caches.length, 0);
  f.disk.reset(true); f.identity(Promise.resolve('verified-account'));
  f.loading(Promise.reject(new Error('Synthetic storage failure'))); await f.disk.bind(f.session);
  assert.equal(f.disk.snapshot().status.reason, 'cache-unavailable');
  f.disk.roomsLoaded(true); assert.equal(f.disk.snapshot().status.verified, true);
  f.disk.stop(); f.disk.reset(true); f.setCurrent(false);
  const keys = f.counts().keys; await f.disk.bind(f.session); assert.equal(f.counts().keys, keys);
});
