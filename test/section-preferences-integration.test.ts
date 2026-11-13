import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { SpacesCache, spacesCacheKey } from '../src/spaces-cache.js';
import { SectionPreferences, type LocalSection } from '../src/local-sections.js';

const profile = { clientId: 'preference-workflow', clientSecret: 'PRIVATE-SECRET',
  redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] };
const room = { id: 'r', title: 'Synthetic preference room', type: 'group' as const, lastActivity: '' };
const grouping = (name: string): LocalSection[] => [{ id: 'a'.repeat(24), name, rooms: ['r'], collapsed: false }];
type Action = 'load' | 'save' | 'clear';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(engine: EditorEngine, check: () => boolean) {
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { if (check()) { clearTimeout(timer); engine.off('state', done); resolve(); } };
    const timer = setTimeout(() => { engine.off('state', done); reject(Error('Synthetic preference workflow timeout')); }, 3000);
    engine.on('state', done); done();
  });
}
async function fixture(t: TestContext) {
  const base = await mkdtemp('/tmp/opencode/wbx-preference-workflow-'), config = join(base, 'config.json'),
    state = join(base, 'state'), cache = join(base, 'cache');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  let account = 'account-a', identities = 0, forbidden = 0, sends = 0, active = 0, maxActive = 0;
  const plans: { action: Action; gate: ReturnType<typeof deferred>; done: ReturnType<typeof deferred> }[] = [];
  const calls: { action: Action; key: string }[] = [];
  const trace = async <T>(action: Action, key: string, work: () => Promise<T>) => {
    calls.push({ action, key }); active++; maxActive = Math.max(maxActive, active);
    const index = plans.findIndex(plan => plan.action === action);
    const plan = index >= 0 ? plans.splice(index, 1)[0] : undefined;
    try { if (plan) await plan.gate.promise; return await work(); }
    finally { active--; plan?.done.resolve(); }
  };
  class Preferences extends SectionPreferences {
    override load(key: string) { return trace('load', key, () => super.load(key)); }
    override save(key: string, items: LocalSection[], valid = () => true) { return trace('save', key, () => super.save(key, items, valid)); }
    override clear(key: string, valid = () => true) { return trace('clear', key, () => super.clear(key, valid)); }
  }
  const disk = new SectionPreferences(state);
  const key = (value = account) => spacesCacheKey(config, profile, value);
  const otherAccount = Array.from({ length: 256 }, (_, i) => 'account-b-' + i).find(value => disk.path(key(value)) !== disk.path(key('account-a')))!;
  assert.ok(otherAccount, 'use independent private slots, not accidental profile collision');
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'PRIVATE-ACCESS', expiresAt: Date.now() + 3600_000, scope: 'spark:all' }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [room] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{ id: 'm-r', author: 'Synthetic', text: 'History independent of preference I/O', created: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw Error('SEND FORBIDDEN'); });
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), undefined, undefined, undefined, undefined,
    { create: () => new SpacesCache(cache), account: async () => { identities++; return account; } }, { sectionPreferences: new Preferences(state) });
  const packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  let id = 0;
  const call = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(packet => packet.id === request); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  const held: typeof plans = [];
  t.after(async () => {
    engine.stop(); rpc.close(); for (const plan of held) plan.gate.resolve();
    await turn(); await rm(base, { recursive: true, force: true });
  });
  await send('hello', { version: 1 });
  return { engine, calls, call, send, key, disk, otherAccount,
    start: () => send('session.start', { mode: 'live', config, spacesCache: true }),
    account(value: string) { account = value; },
    hold(action: Action) {
      const plan = { action, gate: deferred(), done: deferred() }; plans.push(plan); held.push(plan);
      return { async release() { plan.gate.resolve(); await plan.done.promise; await turn(); } };
    },
    async seed(value = account) { await disk.save(key(value), grouping(value)); },
    async bytes(value = account) { return readFile(disk.path(key(value)), 'utf8'); },
    async restored() { await until(engine, () => engine.snapshot().sections?.persistence === 'saved'); },
    counts: () => ({ identities, forbidden, sends, active, maxActive, loads: calls.filter(c => c.action === 'load').length,
      saves: calls.filter(c => c.action === 'save').length, clears: calls.filter(c => c.action === 'clear').length }),
  };
}

test('ordinary RPC preference restore/edit/save/load/clear uses verified binding and preserves live history through reconnect', async t => {
  const f = await fixture(t); await f.seed(); await f.start(); await f.restored();
  await f.send('rooms.select', { roomId: 'r' });
  const before = f.engine.snapshot(), restored = before.sections!;
  const edited = await f.send('sections.edit', { revision: restored.revision,
    edit: { action: 'rename', id: restored.items[0]!.id, name: 'Ordinary saved work' } });
  const saved = await f.send('sections.preferences', { action: 'save', revision: edited.revision });
  assert.equal(saved.persistence, 'saved'); assert.equal(saved.revision, edited.revision);
  await f.send('sections.edit', { revision: saved.revision, edit: { action: 'rename', id: saved.items[0].id, name: 'Unsaved only' } });
  const loaded = await f.send('sections.preferences', { action: 'load', revision: saved.revision + 1 });
  assert.equal(loaded.items[0].name, 'Ordinary saved work');
  const cleared = await f.send('sections.preferences', { action: 'clear', revision: loaded.revision });
  assert.deepEqual(cleared.items, []); assert.equal(cleared.revision, loaded.revision + 1);
  assert.equal(await f.disk.load(f.key()), undefined);
  assert.deepEqual(f.engine.snapshot().messages, before.messages); assert.deepEqual(f.engine.snapshot().rooms, before.rooms);
  assert.equal(f.engine.snapshot().room!.id, 'r');
  await f.send('session.stop'); await f.start();
  await until(f.engine, () => f.engine.snapshot().sections !== undefined);
  assert.deepEqual(f.engine.snapshot().sections, { revision: 0, persistence: 'session', items: [] });
  assert.ok(f.calls.every(call => call.key === f.key())); assert.equal(f.counts().maxActive, 1);
  assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC preference ordinary restore edit save load clear', identityReads: f.counts().identities,
    maxPhysicalIO: f.counts().maxActive, explicitSaves: f.counts().saves, explicitClears: f.counts().clears, serverMutations: 0 }));
});

test('ordinary RPC editing supersedes held automatic preference restore while history remains usable and explicit save recovers', async t => {
  const f = await fixture(t); await f.seed(); const held = f.hold('load'); await f.start();
  await until(f.engine, () => f.counts().active === 1);
  await f.send('rooms.select', { roomId: 'r' }); assert.equal(f.engine.snapshot().ready, true);
  const edited = await f.send('sections.edit', { revision: 0, edit: { action: 'create', name: 'New local work' } });
  assert.equal((await f.call('sections.preferences', { action: 'clear', revision: edited.revision })).error.code, -32002);
  await held.release();
  assert.equal(f.engine.snapshot().sections!.items[0]!.name, 'New local work');
  assert.equal(f.engine.snapshot().sections!.persistence, 'session'); assert.equal(f.counts().loads, 1);
  await f.send('sections.preferences', { action: 'save', revision: edited.revision });
  await f.send('session.stop'); await f.start(); await f.restored();
  assert.equal(f.engine.snapshot().sections!.items[0]!.name, 'New local work');
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC preference held restore edit and recovery', historyWhileReadHeld: true,
    lateRestoreOverwrites: 0, queuedClearOperations: f.counts().clears, explicitSaves: f.counts().saves, maxPhysicalIO: f.counts().maxActive }));
});

test('ordinary RPC corrupt preference failure preserves user work and private bytes until explicit clear and save recovery', async t => {
  const f = await fixture(t); await f.seed();
  const corrupt = JSON.stringify({ version: 999, profile: f.key(), items: grouping('PRIVATE invalid saved version') });
  await writeFile(f.disk.path(f.key()), corrupt, { mode: 0o600 });
  await f.start(); await until(f.engine, () => f.engine.snapshot().sections?.persistence === 'unavailable');
  await turn(); assert.equal(f.counts().loads, 1, 'failed automatic load is not retried');
  const edited = await f.send('sections.edit', { revision: 0, edit: { action: 'create', name: 'Retained user grouping' } });
  const failed = await f.call('sections.preferences', { action: 'save', revision: edited.revision });
  assert.equal(failed.error.code, -32032); assert.equal(await f.bytes(), corrupt, 'save cannot replace corrupt user preferences');
  assert.equal(f.engine.snapshot().sections!.items[0]!.name, 'Retained user grouping');
  assert.doesNotMatch(JSON.stringify(f.engine.snapshot()) + JSON.stringify(failed), /PRIVATE/);
  const cleared = await f.send('sections.preferences', { action: 'clear', revision: edited.revision });
  const recovered = await f.send('sections.edit', { revision: cleared.revision, edit: { action: 'create', name: 'Recovered explicitly' } });
  await f.send('sections.preferences', { action: 'save', revision: recovered.revision });
  await f.send('session.stop'); await f.start(); await f.restored();
  assert.equal(f.engine.snapshot().sections!.items[0]!.name, 'Recovered explicitly');
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC preference failure and explicit recovery', automaticRetries: 0,
    corruptFileOverwrites: 0, explicitClears: f.counts().clears, saveAttempts: f.counts().saves, maxPhysicalIO: f.counts().maxActive }));
});

for (const action of ['load', 'save', 'clear'] as const) test(`ordinary RPC preference replacement retains physical ${action} admission and permits explicit new-account recovery`, async t => {
  const f = await fixture(t); await f.seed(); await f.seed(f.otherAccount);
  await f.start(); await f.restored();
  const initial = f.engine.snapshot().sections!, oldBytes = await f.bytes();
  const edited = await f.send('sections.edit', { revision: initial.revision,
    edit: { action: 'rename', id: initial.items[0]!.id, name: 'Retired pending work' } });
  const held = f.hold(action), pending = f.call('sections.preferences', { action, revision: edited.revision });
  await f.send('session.stop'); f.account(f.otherAccount); await f.start();
  await until(f.engine, () => f.engine.snapshot().spacesCache.state === 'ready');
  assert.equal(f.engine.snapshot().sections, undefined);
  assert.equal((await f.call('sections.preferences', { action: 'load', revision: 0 })).error.code, -32002);
  assert.equal((await f.call('sections.edit', { revision: 0, edit: { action: 'create', name: 'Unqueued' } })).error.code, -32002);
  await f.send('rooms.select', { roomId: 'r' }); assert.equal(f.engine.snapshot().ready, true);
  await held.release(); assert.equal((await pending).error.code, -32032);
  assert.equal(await f.bytes('account-a'), oldBytes, 'retired load/save/clear cannot change the old private document');
  assert.equal(f.engine.snapshot().sections, undefined, 'late completion cannot populate or fail the new grouping');
  const loaded = await f.send('sections.preferences', { action: 'load', revision: 0 });
  assert.deepEqual(loaded.items, grouping(f.otherAccount));
  const next = await f.send('sections.edit', { revision: loaded.revision,
    edit: { action: 'rename', id: loaded.items[0].id, name: 'Replacement saved work' } });
  await f.send('sections.preferences', { action: 'save', revision: next.revision });
  await f.send('session.stop'); await f.start(); await f.restored();
  assert.equal(f.engine.snapshot().sections!.items[0]!.name, 'Replacement saved work');
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC preference replacement ' + action, maxPhysicalIO: f.counts().maxActive,
    retiredCommits: 0, lateProjectionChanges: 0, historyWhileOldIOHeld: true, explicitNewAccountRecovery: true }));
});
