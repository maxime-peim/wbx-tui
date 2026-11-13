import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReceivedCache, ReceivedCacheStorage, RECEIVED_CACHE_LIMITS as limits } from '../src/received-cache.js';
import { SenderNames, SENDER_NAME_LIMITS } from '../src/sender-names.js';
import type { ChatMessage } from '../src/chat-protocol.js';
import type { ReactionSnapshot } from '../src/reaction-contracts.js';

const key = '1'.repeat(64), collision = '11' + '2'.repeat(62);
const message = (id = 'message'): ChatMessage => ({ id, author: 'fallback', authorId: 'person', text: 'Decrypted private text',
  created: '2026-11-18T12:00:00.000Z' });
const snapshot = (now: number, messageId = 'message'): ReactionSnapshot => ({ roomId: 'room', messageId, observedAt: now,
  partial: true, unknown: false, groups: [{ reaction: 'heart', label: 'Heart', count: 3, own: 'a'.repeat(32) }] });
const tick = () => new Promise<void>(r => setImmediate(r));
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-received-'), base = join(directory, 'cache');
  let now = Date.now();
  const storage = new ReceivedCacheStorage(base), cache = new ReceivedCache(storage, () => now), owners = [cache];
  t.after(async () => { owners.forEach(c => c.close()); await rm(directory, { recursive: true, force: true }); });
  return { directory, base, storage, cache, now: () => now, advance: (ms: number) => { now += ms; },
    create() { const c = new ReceivedCache(new ReceivedCacheStorage(base), () => now); owners.push(c); return c; },
    path: join(storage.directory, '1.json') };
}

test('decrypted snapshots survive restart under a verified partition without credentials, attachment URLs or own handles', async t => {
  const f = await fixture(t);
  await f.cache.bind(key, () => true);
  const raw = { ...message(), images: [{ id: 'PRIVATE-IMAGE', state: 'pending' }], token: 'PRIVATE-TOKEN',
    attachments: [{ id: 'PRIVATE-URL' }], senderName: 'rendered name' } as unknown as ChatMessage;
  f.cache.observeMessages('room', [raw]);
  f.cache.observeNames([{ id: 'person', name: 'Known name', observedAt: f.now() }]);
  f.cache.observeReaction(snapshot(f.now()), raw);
  await f.cache.flush(); f.cache.close();
  const file = await readFile(f.path, 'utf8');
  assert.match(file, /Decrypted private text/);
  for (const secret of ['PRIVATE-TOKEN', 'PRIVATE-URL', 'PRIVATE-IMAGE', 'rendered name', '"own":', 'contextId'])
    assert.ok(!file.includes(secret), secret);
  assert.equal((await lstat(f.storage.directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(f.path)).mode & 0o777, 0o600);
  const second = f.create(); await second.bind(key, () => true);
  await assert.rejects(second.bind(collision, () => true), 'one account owner cannot be rebound with retained plaintext');
  assert.deepEqual(second.messages('room'), [message()]);
  const restored = second.reactions('room', [message()])[0]!;
  assert.equal(restored.groups[0]!.mine, true); assert.equal(restored.groups[0]!.own, undefined);
  assert.equal(restored.groups[0]!.count, 3); assert.equal(restored.observedAt, f.now());
  restored.groups.length = 0; assert.equal(second.reactions('room', [message()])[0]!.groups.length, 1, 'detached projection');
  const foreign = f.create(); await foreign.bind(collision, () => true);
  assert.deepEqual(foreign.messages('room'), []); assert.deepEqual(foreign.restoredNames(), []);
  await foreign.clear();
  assert.ok(await readFile(f.path), 'a colliding foreign clear never removes this account');
});

test('names, text and reaction observations retain independent times, keys and expiry', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  f.cache.observeMessages('room', [message()]); f.cache.observeReaction(snapshot(f.now()), message());
  const observedAt = f.now();
  f.advance(1000);
  f.cache.observeNames([{ id: 'person', name: 'Renamed', observedAt: f.now() }]);
  f.cache.observeMessages('room', [{ ...message(), author: 'Rendered author changed', images: [] }]);
  assert.equal(f.cache.reactions('room', [message()])[0]!.observedAt, observedAt, 'enrichment never renews reaction observations');
  assert.deepEqual(f.cache.reactions('room', [{ ...message(), text: 'Edited body' }]), []);
  f.cache.observeMessages('room', [{ ...message(), text: 'Edited body' }]);
  f.cache.observeMessages('room', [message()]);
  assert.deepEqual(f.cache.reactions('room', [message()]), [], 'returning to old text cannot resurrect an evicted reaction');
  f.advance(limits.ageMs);
  assert.deepEqual(f.cache.messages('room'), []); assert.equal(f.cache.restoredNames().length, 1);
  f.advance(limits.nameAgeMs);
  assert.deepEqual(f.cache.restoredNames(), []);
});
test('explicit actor relationships are rejected by both the cache owner and disk loader',async t=>{
  const f=await fixture(t);await f.cache.bind(key,()=>true);
  const actors=[{reaction:'heart',personId:'PRIVATE-ACTOR',name:'PRIVATE actor name'}];
  f.cache.observeMessages('room',[message()]);
  f.cache.observeReaction({...snapshot(f.now()),actors} as ReactionSnapshot,message());
  assert.deepEqual(f.cache.reactions('room',[message()]),[]);
  await f.cache.flush();
  assert.equal((await readFile(f.path,'utf8')).includes('PRIVATE-ACTOR'),false);
  f.cache.observeReaction(snapshot(f.now()),message());await f.cache.flush();
  const doc=JSON.parse(await readFile(f.path,'utf8'));
  doc.histories[0].reactions[0].snapshot.actors=actors;
  await writeFile(f.path,JSON.stringify(doc));
  const second=f.create();await second.bind(key,()=>true);
  assert.deepEqual(second.reactions('room',[message()]),[]);
});

test('bounded per-room recent history, file size, deletion and room revocation persist without resurrection', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  for (let room = 0; room < limits.rooms + 4; room++) {
    f.cache.observeMessages('room-' + room, Array.from({ length: 40 }, (_, i) => ({
      ...message(`message-${i}`), created: new Date(Date.now() + i * 1000).toISOString(),
    })));
  }
  assert.deepEqual(f.cache.messages('room-0'), []);
  assert.equal(f.cache.messages('room-19').length, limits.messages);
  f.cache.forget('room-19', 'message-39'); f.cache.forget('room-18');
  await f.cache.flush();
  assert.ok((await lstat(f.path)).size <= limits.bytes);
  const second = f.create(); await second.bind(key, () => true);
  assert.equal(second.messages('room-19').some(m => m.id === 'message-39'), false);
  assert.deepEqual(second.messages('room-18'), []);
  await second.clear();
  assert.deepEqual(await readdir(f.storage.directory), []);
  f.cache.close();
});

test('invalidation during a held load discards restored histories, while new live data wins', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  f.cache.observeMessages('room', [message()]); await f.cache.flush(); f.cache.close();
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; }), storage = new ReceivedCacheStorage(f.base);
  const load = storage.load.bind(storage);
  t.mock.method(storage, 'load', async (key: string) => { const result = await load(key); await gate; return result; });
  const c = new ReceivedCache(storage, f.now); t.after(() => c.close());
  const binding = c.bind(key, () => true);
  c.forget('room', 'message'); c.observeMessages('new-room', [message('new')]); release(); await binding;
  assert.deepEqual(c.messages('room'), []); assert.equal(c.messages('new-room')[0]!.id, 'new');
  await c.flush();
  const second = f.create(); await second.bind(key, () => true);
  assert.deepEqual(second.messages('room'), []);
});
test('clear serializes behind an admitted write and retired owners cannot recreate plaintext files', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  f.cache.observeMessages('room', [message()]); await f.cache.flush();
  f.cache.observeMessages('room', [{ ...message(), text: 'New body' }]);
  const saving = f.cache.flush(), clearing = f.cache.clear();
  await saving; await clearing;
  f.cache.observeMessages('room', [message()]); await f.cache.flush();
  const second = f.create(); await second.bind(key, () => true);
  assert.deepEqual(second.messages('room'), []);
  assert.ok((await readdir(f.storage.directory)).every(n => !n.endsWith('.tmp')));
});
test('future timestamps and rolled-back clocks never make saved observations fresh', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  f.cache.observeMessages('room', [message()]); f.cache.observeReaction(snapshot(f.now()), message());
  f.cache.observeNames([{ id: 'person', name: 'Name', observedAt: f.now() }]); await f.cache.flush(); f.cache.close();
  f.advance(-1); const second = f.create(); await second.bind(key, () => true);
  assert.deepEqual(second.messages('room'), []); assert.deepEqual(second.restoredNames(), []);
});
test('clear does not delete an unfamiliar schema even when its slot names this profile', async t => {
  const f = await fixture(t); await f.cache.bind(key, () => true);
  f.cache.observeMessages('room', [message()]); await f.cache.flush(); f.cache.close();
  const raw = JSON.parse(await readFile(f.path, 'utf8')); raw.version = 99;
  await writeFile(f.path, JSON.stringify(raw));
  const second = f.create(); await second.bind(key, () => true); await second.clear();
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).version, 99);
});

test('failed name refreshes do not renew persisted evidence; restart reuses names without a person GET', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  let calls = 0, failed = false;
  const names = new SenderNames({ fetcher: async () => { calls++; return failed ? new Response('', { status: 503 })
    : Response.json({ id: 'person', displayName: 'Known name' }); } });
  const session = { enabled: true, grantedScopes: ['spark:people_read'], token: () => 'SYNTHETIC' };
  names.setSession(session); names.observe(['person']); await tick();
  const entries = names.persisted(), at = entries[0]!.observedAt;
  failed = true; t.mock.timers.tick(SENDER_NAME_LIMITS.freshMs); names.observe(['person']); await tick();
  assert.equal(names.persisted()[0]!.observedAt, at);
  names.setSession(session); names.restore(entries); names.observe(['person']); await tick();
  assert.equal(names.peek('person'), 'Known name');
  names.setSession(session);
  const fresh = [{ id: 'person', name: 'Fresh restored', observedAt: Date.now() }];
  names.restore(fresh); const before = calls; names.observe(['person']); await tick();
  assert.equal(calls, before); assert.equal(names.peek('person'), 'Fresh restored');
  names.setSession({ ...session, grantedScopes: [] }); names.restore(fresh); names.observe(['person']);
  assert.equal(names.peek('person'), undefined); assert.deepEqual(names.persisted(), []);
});

for (const bad of ['json', 'schema', 'own', 'mode', 'symlink'] as const)
  test(`received cache rejects ${bad} before displaying restored data`, async t => {
    const f = await fixture(t); await f.cache.bind(key, () => true);
    f.cache.observeMessages('room', [message()]); f.cache.observeReaction(snapshot(f.now()), message()); await f.cache.flush(); f.cache.close();
    const raw = JSON.parse(await readFile(f.path, 'utf8'));
    if (bad === 'json') await writeFile(f.path, '{');
    if (bad === 'schema') { raw.histories[0].messages[0].message.token = 'SECRET'; await writeFile(f.path, JSON.stringify(raw)); }
    if (bad === 'own') { raw.histories[0].reactions[0].snapshot.groups[0].own = 'a'.repeat(32); await writeFile(f.path, JSON.stringify(raw)); }
    if (bad === 'mode') await chmod(f.path, 0o644);
    if (bad === 'symlink') {
      const foreign = join(f.directory, 'foreign'); await mkdir(foreign);
      await symlink(foreign, join(f.directory, 'linked'));
      const storage = new ReceivedCacheStorage(join(f.directory, 'linked'));
      await assert.rejects(storage.load(key)); storage.close(); return;
    }
    const second = f.create(); await second.bind(key, () => true);
    assert.equal(second.state, 'unavailable'); assert.deepEqual(second.messages('room'), []);
  });
