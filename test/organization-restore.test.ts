import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { SectionPreferences, type LocalSection } from '../src/local-sections.js';
import { SpacesCache } from '../src/spaces-cache.js';

const saved: LocalSection[] = [{ id: 'a'.repeat(24), name: 'Explicitly saved grouping', rooms: ['r'], collapsed: true }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settled = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(t: TestContext, options: { cache?: boolean; holdIdentity?: boolean } = {}) {
  let accounts = 0, loads = 0, clears = 0;
  const identity = deferred<string>(), data = deferred<LocalSection[] | undefined>();
  class MemoryCache extends SpacesCache {
    override async load() { return undefined; }
    override async save() {}
    override async clear() {}
  }
  class Preferences extends SectionPreferences {
    override async load() { loads++; return data.promise; }
    override async save() { assert.fail('Automatic preference writes are forbidden'); }
    override async clear() { clears++; }
  }
  const directory = await mkdtemp('/tmp/opencode/wbx-organization-restore-'), path = join(directory, 'config.json');
  await writeFile(path, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } }), { mode: 0o600 });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'r', title: 'Synthetic', type: 'group' as const, lastActivity: '' }] }));
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, {
    create: () => new MemoryCache(), account: async () => { accounts++; return options.holdIdentity ? identity.promise : 'synthetic-account'; },
  }, { sectionPreferences: new Preferences() });
  t.after(async () => { data.resolve(undefined); engine.stop(); await rm(directory, { recursive: true, force: true }); });
  await engine.start('live', path, false, false, false, options.cache !== false);
  await settled();
  return { engine, identity, data, counts: () => ({ accounts, loads, clears }) };
}
test('verified cache identity restores only previously saved local grouping, with no extra account probe/write or destination change', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.counts(), { accounts: 1, loads: 1, clears: 0 });
  const rooms = f.engine.snapshot().rooms, before = f.engine.snapshot().room;
  f.data.resolve(saved); await settled();
  assert.deepEqual(f.engine.snapshot().sections?.items, saved);
  assert.equal(f.engine.snapshot().sections?.persistence, 'saved');
  assert.deepEqual(f.engine.snapshot().rooms, rooms); assert.equal(f.engine.snapshot().room, before);
});
test('a session edit before identity verification cancels automatic preference reading entirely', async t => {
  const f = await fixture(t, { holdIdentity: true });
  f.engine.editSections({ action: 'create', name: 'Current work' }, 0);
  f.identity.resolve('synthetic-account'); await settled();
  assert.equal(f.counts().loads, 0); assert.equal(f.engine.snapshot().sections?.items[0]?.name, 'Current work');
});
test('local editing remains available during an automatic file read and a late saved result cannot overwrite it', async t => {
  const f = await fixture(t);
  assert.equal(f.counts().loads, 1);
  f.engine.editSections({ action: 'create', name: 'New session work' }, 0);
  f.data.resolve(saved); await settled();
  assert.equal(f.engine.snapshot().sections?.items[0]?.name, 'New session work');
  assert.equal(f.engine.snapshot().sections?.persistence, 'session');
});
test('explicit clear cancels a late auto-restore even while physical file admission remains occupied', async t => {
  const f = await fixture(t);
  await assert.rejects(f.engine.sectionPreferences('clear', 0), /active/);
  f.data.resolve(saved); await settled();
  assert.equal(f.engine.snapshot().sections, undefined);
  await f.engine.sectionPreferences('clear', 0);
  assert.deepEqual(f.engine.snapshot().sections?.items, []);
  assert.equal(f.counts().clears, 1);
});
test('cache opt-out adds no identity/file read and a replaced session cannot receive an old grouping', async t => {
  const f = await fixture(t, { cache: false });
  assert.deepEqual(f.counts(), { accounts: 0, loads: 0, clears: 0 });
  f.engine.stop(); assert.equal(f.engine.snapshot().sections, undefined);
});
test('account/session replacement fences an already pending automatic preference read', async t => {
  const f = await fixture(t);
  f.engine.stop(); await f.engine.start('demo');
  f.data.resolve(saved); await settled();
  assert.equal(f.engine.snapshot().sections, undefined);
  assert.equal(f.engine.snapshot().mode, 'demo');
});
test('clearing the verified cache identity cancels a pending grouping restore without changing current data', async t => {
  const f = await fixture(t);
  await f.engine.clearCachedSpaces();
  f.data.resolve(saved); await settled();
  assert.equal(f.engine.snapshot().sections, undefined);
  assert.equal(f.engine.snapshot().spacesCache.state, 'off');
});
test('malformed preferences cannot overwrite grouping or trigger a write', async t => {
  const f = await fixture(t);
  f.data.reject(new Error('PRIVATE invalid file')); await settled();
  assert.equal(f.engine.snapshot().sections?.persistence, 'unavailable');
  assert.deepEqual(f.engine.snapshot().sections?.items, []);
  assert.ok(!JSON.stringify(f.engine.snapshot()).includes('PRIVATE'));
  assert.deepEqual(f.counts(), { accounts: 1, loads: 1, clears: 0 });
});
test('a missing saved document keeps empty grouping session-only without autosave or more identity reads', async t => {
  const f = await fixture(t);
  f.data.resolve(undefined); await settled();
  assert.equal(f.engine.snapshot().sections?.persistence, 'session');
  assert.deepEqual(f.engine.snapshot().sections?.items, []);
  assert.deepEqual(f.counts(), { accounts: 1, loads: 1, clears: 0 });
});
