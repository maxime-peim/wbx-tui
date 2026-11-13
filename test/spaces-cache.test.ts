import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpacesCache, SPACES_CACHE_LIMITS, cachedSpaceMetadata, cachedUnreadFlags, spacesCacheAccount, spacesCacheKey } from '../src/spaces-cache.js';
import type { MessageRoom } from '../src/messaging-api.js';

const profile = { clientId: 'local-profile', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
const rooms: MessageRoom[] = [{ id: 'space-a', title: 'Private project name', type: 'group', lastActivity: '2026-11-10T12:00:00.000Z' }];
const key = spacesCacheKey('/synthetic/config.json', profile, 'account-a');
const path = (cache: SpacesCache, value = key) => join(cache.directory, `${parseInt(value.slice(0, 2), 16) % SPACES_CACHE_LIMITS.slots}.json`);
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-spaces-cache-'), base = join(directory, 'cache');
  let now = Date.now(); const cache = new SpacesCache(base, () => now);
  t.after(async () => { cache.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, base, cache, advance: (ms: number) => { now += ms; } };
}

test('spaces persistence projects only bounded inert metadata and never mutates/retains sensitive fields', () => {
  const raw = { ...rooms[0]!, title: 'Project\n\x1b\u202e名前 😀', unread: true, lastSeen: 'PRIVATE', token: 'TOKEN', messages: ['BODY'] };
  const before = structuredClone(raw), projected = cachedSpaceMetadata([raw, raw]);
  assert.deepEqual(raw, before); assert.equal(projected.length, 1);
  assert.deepEqual(Object.keys(projected[0]!).sort(), ['id', 'lastActivity', 'title', 'type']);
  assert.ok(!/[\n\x1b\u202e]/u.test(projected[0]!.title)); assert.match(projected[0]!.title, /名前 😀/u);
  assert.equal(cachedSpaceMetadata(Array.from({ length: 600 }, (_, i) => ({ ...rooms[0]!, id: `room-${i}` }))).length, 500);
  const fallback = cachedSpaceMetadata([{ ...rooms[0]!, id: 'bad.id' }, { ...rooms[0]!, title: '', lastActivity: 'invalid' }]);
  assert.deepEqual(fallback, [{ ...rooms[0]!, title: 'Untitled space', lastActivity: '' }]);
});

test('owner-only atomic cache survives a new instance, expires at six hours and ignores clock rollback', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  assert.equal((await lstat(f.cache.directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(path(f.cache))).mode & 0o777, 0o600);
  const raw = await readFile(path(f.cache), 'utf8'), value = JSON.parse(raw);
  assert.deepEqual(Object.keys(value).sort(), ['observedAt', 'profile', 'rooms', 'unread', 'version']);
  assert.equal(value.version, 2); assert.deepEqual(value.unread, []);
  for (const privateValue of ['account-a', 'local-profile', '/synthetic/config.json', 'TOKEN', 'BODY', 'lastSeen']) assert.ok(!raw.includes(privateValue));
  const second = new SpacesCache(f.base); assert.deepEqual((await second.load(key))?.rooms, rooms); second.close();
  f.advance(-1); assert.equal(await f.cache.load(key), undefined, 'future timestamp cannot be made current');
  f.advance(SPACES_CACHE_LIMITS.ageMs); assert.deepEqual((await f.cache.load(key))?.rooms, rooms);
  f.advance(1); assert.equal(await f.cache.load(key), undefined);
});

test('account/profile paths and scopes isolate keys; fixed slots bound disk use and collisions never expose another account', async t => {
  const f = await fixture(t);
  const variants = [spacesCacheKey('/synthetic/other.json', profile, 'account-a'), spacesCacheKey('/synthetic/config.json', profile, 'account-b'),
    spacesCacheKey('/synthetic/config.json', { ...profile, clientId: 'other' }, 'account-a'),
    spacesCacheKey('/synthetic/config.json', { ...profile, scopes: ['spark:people_read'] }, 'account-a')];
  assert.equal(new Set([key, ...variants]).size, 5);
  assert.equal(spacesCacheKey('/synthetic/config.json', { ...profile, scopes: [...profile.scopes].reverse() }, 'account-a'), key);
  assert.throws(() => spacesCacheKey('/synthetic/config.json', profile, 'me'));
  const collision = `${key.slice(0, 2)}${'1'.repeat(62)}`;
  await f.cache.save(key, rooms); assert.equal(await f.cache.load(collision), undefined);
  await f.cache.clear(collision); // Clearing a colliding key must not remove the other profile.
  const second = new SpacesCache(f.base); assert.deepEqual((await second.load(key))?.rooms, rooms);
  for (let i = 0; i < 40; i++) await second.save(spacesCacheKey('/synthetic/config.json', profile, `account-${i}`), rooms);
  assert.ok((await readdir(second.directory)).length <= 8); second.close();
});

test('identity lookup is opt-in/grant-admitted, exact, read-only, bounded and never accepts an invented account', async () => {
  const access = { token: 'SYNTHETIC-ACCESS', scope: 'spark:people_read', expiresAt: Date.now() + 60_000 }, parent = new AbortController();
  let calls = 0;
  const fetcher = (async (url, options) => {
    calls++; assert.equal(url, 'https://webexapis.com/v1/people/me'); assert.equal(options?.method, 'GET');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer SYNTHETIC-ACCESS');
    return new Response(JSON.stringify({ id: 'account-a', type: 'person', emails: ['ignored@example.invalid'], displayName: 'IGNORED PRIVATE NAME' }));
  }) as typeof fetch;
  await assert.rejects(spacesCacheAccount({ ...access, scope: 'spark:rooms_read' }, parent.signal, fetcher)); assert.equal(calls, 0);
  assert.equal(await spacesCacheAccount(access, parent.signal, fetcher), 'account-a'); assert.equal(calls, 1);
  for (const value of [{ id: 'me' }, { id: 'account-a', errors: [] }, { id: 'account-a', type: 'bot' }, {}, null]) {
    await assert.rejects(spacesCacheAccount(access, parent.signal, (async () => new Response(JSON.stringify(value))) as typeof fetch));
  }
  const abort = new AbortController();
  const pending = spacesCacheAccount(access, abort.signal, (async () => new Promise<Response>(() => {})) as typeof fetch);
  abort.abort(); await assert.rejects(pending);
});

test('an ignored identity transport is released by the cache deadline without retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const access = { token: 'LOCAL', scope: 'spark:all', expiresAt: Date.now() + 60_000 };
  const pending = spacesCacheAccount(access, new AbortController().signal, (async () => {
    calls++; return new Promise<Response>(() => {});
  }) as typeof fetch);
  const rejected = assert.rejects(pending);
  t.mock.timers.tick(SPACES_CACHE_LIMITS.identityMs); await rejected; assert.equal(calls, 1);
});

test('cache directory entry admission is bounded and never removes unfamiliar local files', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  for (let i = 0; i < SPACES_CACHE_LIMITS.entries; i++) await writeFile(join(f.cache.directory, `user-note-${i}`), 'Keep this work', { mode: 0o600 });
  await assert.rejects(f.cache.save(key, rooms));
  assert.equal(await readFile(join(f.cache.directory, 'user-note-0'), 'utf8'), 'Keep this work');
  assert.deepEqual((await f.cache.load(key))?.rooms, rooms, 'capacity failure does not damage the previous complete cache');
});

test('symlinks, hardlinks, shared modes and special targets are rejected without reading/writing their victims', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  const victim = join(f.directory, 'victim.json'); await writeFile(victim, 'PRIVATE VICTIM', { mode: 0o600 });
  await rm(path(f.cache)); await symlink(victim, path(f.cache));
  await assert.rejects(f.cache.load(key)); await assert.rejects(f.cache.save(key, rooms));
  assert.equal(await readFile(victim, 'utf8'), 'PRIVATE VICTIM');
  await rm(path(f.cache)); await link(victim, path(f.cache));
  await assert.rejects(f.cache.load(key)); await assert.rejects(f.cache.save(key, rooms));
  await rm(path(f.cache)); await mkdir(path(f.cache), { mode: 0o700 }); await assert.rejects(f.cache.load(key));
  await rm(path(f.cache), { recursive: true }); await f.cache.save(key, rooms);
  await chmod(path(f.cache), 0o644); await assert.rejects(f.cache.load(key)); await assert.rejects(f.cache.save(key, rooms));
});

test('unsafe cache directories are never chmodded, followed or used as a fallback', async t => {
  const f = await fixture(t); await mkdir(f.base, { mode: 0o777 }); await chmod(f.base, 0o777);
  await assert.rejects(f.cache.save(key, rooms)); assert.equal((await lstat(f.base)).mode & 0o777, 0o777);
  await chmod(f.base, 0o700);
  const victim = join(f.directory, 'other'); await mkdir(victim, { mode: 0o700 }); await symlink(victim, f.cache.directory);
  await assert.rejects(f.cache.load(key)); await assert.rejects(f.cache.save(key, rooms)); assert.deepEqual(await readdir(victim), []);
  await rm(f.cache.directory); await mkdir(f.cache.directory, { mode: 0o755 });
  await assert.rejects(f.cache.save(key, rooms)); assert.equal((await lstat(f.cache.directory)).mode & 0o777, 0o755);
});

test('oversized, malformed, secret-bearing and duplicate-ID cache documents fail closed without accepting partial rows', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  const original = JSON.parse(await readFile(path(f.cache), 'utf8'));
  const invalid = [{ ...original, token: 'PRIVATE' }, { ...original, version: 3 }, { ...original, rooms: [...rooms, ...rooms] },
    { ...original, rooms: [{ ...rooms[0], unread: true }] }, { ...original, rooms: [{ ...rooms[0], title: 'Title\ncommand' }] },
    { ...original, rooms: [{ ...rooms[0], lastActivity: 'tomorrow' }] }, { ...original, rooms: Array(501).fill(rooms[0]) }];
  for (const value of invalid) { await writeFile(path(f.cache), JSON.stringify(value)); await assert.rejects(f.cache.load(key)); }
  await writeFile(path(f.cache), '{'); await assert.rejects(f.cache.load(key));
  await writeFile(path(f.cache), Buffer.alloc(SPACES_CACHE_LIMITS.bytes + 1)); await assert.rejects(f.cache.load(key));
});

test('v1 metadata remains readable and migrates to v2 without inventing unread flags', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  const value = JSON.parse(await readFile(path(f.cache), 'utf8')); delete value.unread; value.version = 1;
  await writeFile(path(f.cache), JSON.stringify(value));
  const entry = await f.cache.load(key); assert.deepEqual(entry?.rooms, rooms); assert.equal(entry?.unread, undefined);
  await f.cache.save(key, rooms);
  const migrated = JSON.parse(await readFile(path(f.cache), 'utf8'));
  assert.equal(migrated.version, 2); assert.deepEqual(migrated.unread, []);
});

test('persisted read/unread booleans keep independent observation ages and never renew on metadata writes', async t => {
  const f = await fixture(t), observedAt = Date.now() - 1000;
  const members = [...rooms, { ...rooms[0]!, id: 'read-space' }, { ...rooms[0]!, id: 'unknown-space' }];
  const flags = [{ id: 'space-a', unread: true, observedAt }, { id: 'read-space', unread: false, observedAt }];
  await f.cache.save(key, members, flags);
  const document = JSON.parse(await readFile(path(f.cache), 'utf8'));
  assert.deepEqual(document.unread, flags);
  for (const flag of document.unread) assert.deepEqual(Object.keys(flag).sort(), ['id', 'observedAt', 'unread']);
  assert.deepEqual((await f.cache.load(key))?.unread, flags);
  f.advance(SPACES_CACHE_LIMITS.ageMs - 500);
  await f.cache.save(key, members, flags);
  const after = await f.cache.load(key);
  assert.deepEqual(after?.rooms, members); assert.deepEqual(after?.unread, [], 'fresh metadata cannot make six-hour-old flags current');
});

test('unread normalization strips unknown payloads, nonmembers, coercions, expired/future observations and duplicate older values', () => {
  const now = Date.now(), flag = { id: rooms[0]!.id, unread: true, observedAt: now - 1000, secret: 'DO NOT STORE' };
  const before = structuredClone(flag);
  assert.deepEqual(cachedUnreadFlags([flag, { ...flag, unread: false, observedAt: now - 2000 }, { ...flag, id: 'not-in-metadata' },
    { ...flag, unread: 'false' as unknown as boolean }, { ...flag, observedAt: now + 1 }], rooms, now),
  [{ id: flag.id, unread: true, observedAt: flag.observedAt }]);
  assert.deepEqual(flag, before);
});

test('malformed unread payloads fail closed; expired/future flags become unknown without discarding safe metadata', async t => {
  const f = await fixture(t); await f.cache.save(key, rooms);
  const base = JSON.parse(await readFile(path(f.cache), 'utf8')), flag = { id: rooms[0]!.id, unread: true, observedAt: base.observedAt };
  for (const unread of [null, {}, [flag, flag], [{ ...flag, id: 'other' }], [{ ...flag, unread: 1 }], [{ ...flag, unread: 'false' }],
    [{ ...flag, observedAt: -1 }], [{ ...flag, observedAt: 'now' }], [{ ...flag, lastSeen: 'PRIVATE' }], Array(501).fill(flag)]) {
    await writeFile(path(f.cache), JSON.stringify({ ...base, unread })); await assert.rejects(f.cache.load(key));
  }
  await writeFile(path(f.cache), JSON.stringify({ ...base, version: 1, unread: [flag] })); await assert.rejects(f.cache.load(key));
  for (const observedAt of [base.observedAt + 1, base.observedAt - SPACES_CACHE_LIMITS.ageMs]) {
    await writeFile(path(f.cache), JSON.stringify({ ...base, unread: [{ ...flag, observedAt }] }));
    assert.deepEqual((await f.cache.load(key))?.unread, []);
  }
});

test('concurrent commits remain whole documents; close cancels queued writes and clear cannot be undone by an admitted writer', async t => {
  const f = await fixture(t), second = new SpacesCache(f.base);
  await Promise.all([f.cache.save(key, rooms), second.save(key, [{ ...rooms[0]!, title: 'Other complete title' }])]);
  assert.equal((await second.load(key))?.rooms.length, 1);
  const pending = f.cache.save(key, rooms); const cleared = f.cache.clear(key);
  await pending.catch(() => {}); await cleared; assert.equal(await second.load(key), undefined);
  assert.ok((await readdir(second.directory)).every(name => !name.endsWith('.tmp')));
  const late = second.save(key, rooms); second.close(); await assert.rejects(late);
  const reader = new SpacesCache(f.base); assert.equal(await reader.load(key), undefined); reader.close();
});
