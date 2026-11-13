import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { LocalDrafts, type LocalDraft } from '../src/local-drafts.js';
import { SectionPreferences } from '../src/local-sections.js';
import { SpacesCache, spacesCacheKey } from '../src/spaces-cache.js';

const profile = { clientId: 'draft-lifecycle-workflow', clientSecret: 'PRIVATE-SECRET',
  redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] };
const root: LocalDraft = { roomId: 'r', text: '**Private 😀 draft**\nLiteral second line', format: 'markdown', uncertain: false };
const reply: LocalDraft = { ...root, parentId: 'root', text: 'Private reply', uncertain: true };
const unopened: LocalDraft = { roomId: 'unopened', text: 'Private unopened room draft', format: 'plain', uncertain: false };
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
    const timer = setTimeout(() => { engine.off('state', done); reject(Error('Synthetic draft workflow timeout')); }, 3000);
    engine.on('state', done); done();
  });
}
async function fixture(t: TestContext) {
  const base = await mkdtemp('/tmp/opencode/wbx-draft-lifecycle-'), config = join(base, 'config.json'),
    state = join(base, 'state'), cache = join(base, 'cache');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  let account = 'account-a', identities = 0, failIdentity = false, forbidden = 0, sends = 0, active = 0, maxActive = 0;
  let scope = 'spark:all', failSave = false;
  const plans: { action: 'load' | 'save'; gate: ReturnType<typeof deferred>; done: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> }[] = [],
    held: typeof plans = [], calls: { action: 'load' | 'save'; profile: string }[] = [];
  const trace = async <T>(action: 'load' | 'save', profile: string, work: () => Promise<T>) => {
    calls.push({ action, profile }); active++; maxActive = Math.max(maxActive, active);
    const index = plans.findIndex(plan => plan.action === action), plan = index >= 0 ? plans.splice(index, 1)[0] : undefined;
    try {
      if (plan) { plan.started.resolve(); await plan.gate.promise; }
      if (action === 'save' && failSave) { failSave = false; throw Error('PRIVATE transient storage failure'); }
      return await work();
    } finally { active--; plan?.done.resolve(); }
  };
  class Drafts extends LocalDrafts {
    override load(profile: string) { return trace('load', profile, () => super.load(profile)); }
    override save(profile: string, revision: string, items: LocalDraft[], valid = () => true) {
      return trace('save', profile, () => super.save(profile, revision, items, valid));
    }
  }
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'PRIVATE-ACCESS', scope, expiresAt: Date.now() + 3600_000 }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => ({ token: 'PRIVATE-RENEWED', scope, expiresAt: Date.now() + 3600_000 }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'r', title: 'Synthetic draft room', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{ id: 'm-r', author: 'Synthetic', text: 'History independent of draft I/O', created: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw Error('SEND FORBIDDEN'); });
  const disk = new LocalDrafts(state), key = (value = account) => spacesCacheKey(config, profile, value);
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), undefined, undefined, undefined, undefined,
    { create: () => new SpacesCache(cache), account: async () => { identities++; if (failIdentity) { failIdentity = false; throw Error('PRIVATE identity failure'); } return account; } },
    { localDrafts: new Drafts(state), sectionPreferences: new SectionPreferences(state) });
  const packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  let id = 0;
  const call = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(packet => packet.id === request); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  t.after(async () => {
    engine.stop(); rpc.close(); for (const plan of held) plan.gate.resolve();
    await turn(); await rm(base, { recursive: true, force: true });
  });
  await send('hello', { version: 1 });
  return { engine, disk, key, call, send, calls,
    start: (enabled = false) => send('session.start', { mode: 'live', config, spacesCache: enabled }),
    account(value: string) { account = value; }, scope(value: string) { scope = value; },
    failIdentity() { failIdentity = true; }, failSave() { failSave = true; },
    async seed(value = account, items = [root, reply, unopened]) { const empty = await disk.load(key(value)); await disk.save(key(value), empty.revision, items); },
    bytes: (value = account) => readFile(join(disk.directory, key(value) + '.json'), 'utf8'),
    hold(action: 'load' | 'save') {
      const plan = { action, gate: deferred(), done: deferred(), started: deferred() }; plans.push(plan); held.push(plan);
      return { started: plan.started.promise, async release() { plan.gate.resolve(); await plan.done.promise; await turn(); } };
    },
    counts: () => ({ identities, forbidden, sends, maxActive, active, loads: calls.filter(c => c.action === 'load').length,
      saves: calls.filter(c => c.action === 'save').length }),
  };
}

test('ordinary RPC draft restore edit save and reconnect preserve exact root/reply text and reuse shared cache identity', async t => {
  const f = await fixture(t); await f.seed(); await f.start(true);
  await until(f.engine, () => f.engine.snapshot().sections !== undefined);
  const opened = await f.send('drafts.open'); assert.equal(opened.profile, f.key()); assert.deepEqual(opened.items, [root, reply, unopened]);
  await f.send('rooms.select', { roomId: 'r' }); const before = f.engine.snapshot();
  const changed = { ...root, text: '**Edited 😀 locally**\nNo automatic send' };
  const first = await f.send('drafts.save', { profile: opened.profile, revision: opened.revision, items: [changed] });
  const restored = await f.send('drafts.open'); assert.deepEqual(restored.items, [changed, reply, unopened]);
  assert.equal(restored.revision, first.revision);
  const uncertain = { ...reply, text: '', uncertain: true };
  await f.send('drafts.save', { profile: first.profile, revision: first.revision, items: [{ ...root, text: '' }, uncertain] });
  const saved = await f.send('drafts.open'); assert.deepEqual(saved.items, [uncertain, unopened]);
  assert.deepEqual(f.engine.snapshot().messages, before.messages); assert.equal(f.engine.snapshot().room!.id, 'r');
  assert.doesNotMatch(JSON.stringify(f.engine.snapshot()), /Private|Edited 😀|No automatic send/);
  assert.equal(f.counts().identities, 1, 'cache binding and repeated draft operations share the verified identity');
  await f.send('session.stop'); await f.start(true);
  const reopened = await f.send('drafts.open');
  assert.notEqual(reopened.sessionId, opened.sessionId); assert.equal(reopened.profile, opened.profile);
  assert.deepEqual(reopened.items, saved.items); assert.equal(reopened.revision, saved.revision);
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC draft ordinary restore edit save reconnect', identityReads: f.counts().identities,
    sameSessionIdentityReads: 1, maxPhysicalIO: f.counts().maxActive, unopenedDestinationsRetained: true, exactReplyUncertaintyRetained: true, serverMutations: 0 }));
});

test('ordinary RPC draft revision conflict and transient storage failure retain bytes until explicit reopen and save recovery', async t => {
  const f = await fixture(t); await f.seed(); await f.start();
  const opened = await f.send('drafts.open'), concurrent = [{ ...root, text: 'Other editor newest text' }];
  const latestRevision = await f.disk.save(f.key(), opened.revision, concurrent), before = await f.bytes();
  const stale = await f.call('drafts.save', { profile: opened.profile, revision: opened.revision, items: [root] });
  assert.equal(stale.error.code, -32003); assert.equal(await f.bytes(), before); assert.equal(f.counts().saves, 0);
  const reopened = await f.send('drafts.open'); assert.equal(reopened.revision, latestRevision); assert.deepEqual(reopened.items, concurrent);
  f.failSave();
  const patch = [{ ...root, text: 'Explicitly recovered local edit' }];
  const failed = await f.call('drafts.save', { profile: reopened.profile, revision: reopened.revision, items: patch });
  assert.equal(failed.error.code, -32003); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE/);
  assert.equal(await f.bytes(), before); await turn(); assert.equal(f.counts().saves, 1, 'no automatic replay');
  await f.send('drafts.save', { profile: reopened.profile, revision: reopened.revision, items: patch });
  assert.deepEqual((await f.send('drafts.open')).items, patch);
  assert.equal(f.counts().identities, 1); assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC draft revision conflict and explicit recovery', staleCommits: 0,
    automaticRetries: 0, explicitSaveAttempts: f.counts().saves, maxPhysicalIO: f.counts().maxActive }));
});

test('ordinary RPC draft identity failure and grant loss recover explicitly without coupling to cache or reprobing verified identity', async t => {
  const f = await fixture(t); await f.seed(); f.failIdentity(); await f.start();
  assert.equal(f.counts().identities, 0, 'cache opt-out does not request optional draft identity on start');
  const failed = await f.call('drafts.open'); assert.equal(failed.error.code, -32003);
  assert.equal(f.counts().loads, 0); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE/);
  const opened = await f.send('drafts.open'); assert.deepEqual(opened.items, [root, reply, unopened]);
  f.scope('spark:rooms_read'); await f.send('auth.refresh');
  assert.equal((await f.call('drafts.open')).error.code, -32003);
  assert.equal((await f.call('drafts.save', { profile: opened.profile, revision: opened.revision, items: [root] })).error.code, -32003);
  assert.equal(f.counts().saves, 0);
  f.scope('spark:all'); await f.send('auth.refresh');
  const restored = await f.send('drafts.open'); assert.equal(restored.profile, opened.profile);
  await f.send('drafts.save', { profile: restored.profile, revision: restored.revision, items: [{ ...root, text: 'After renewed grant' }] });
  assert.equal(f.counts().identities, 2, 'one failed and one successful explicit lookup, no renewal probes');
  assert.equal(f.engine.snapshot().spacesCache.state, 'off');
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC draft identity grant failure and recovery', identityReads: f.counts().identities,
    failedIdentityFileReads: 0, grantLostCommits: 0, renewalIdentityReads: 0, cacheEnabled: false }));
});

for (const stage of ['open-load', 'save-load', 'save-commit'] as const) test(`ordinary RPC draft replacement during ${stage} retains physical admission and permits explicit new-account recovery`, async t => {
  const f = await fixture(t); await f.seed(); await f.seed('account-b', [{ ...root, text: 'Account B saved work' }]);
  await f.start(); const opened = await f.send('drafts.open'), before = await f.bytes();
  const held = f.hold(stage === 'save-commit' ? 'save' : 'load');
  const pending = stage === 'open-load' ? f.call('drafts.open') : f.call('drafts.save',
    { profile: opened.profile, revision: opened.revision, items: [{ ...root, text: 'Retired pending edit' }] });
  await held.started;
  await f.send('session.stop'); f.account('account-b'); await f.start();
  assert.equal((await f.call('drafts.open')).error.code, -32002);
  await f.send('rooms.select', { roomId: 'r' }); assert.equal(f.engine.snapshot().ready, true);
  await held.release(); assert.equal((await pending).error.code, -32003);
  assert.equal(await f.bytes('account-a'), before);
  const next = await f.send('drafts.open');
  assert.notEqual(next.profile, opened.profile); assert.notEqual(next.sessionId, opened.sessionId);
  assert.deepEqual(next.items, [{ ...root, text: 'Account B saved work' }]);
  assert.equal((await f.call('drafts.save', { profile: opened.profile, revision: opened.revision, items: [root] })).error.code, -32002);
  const patch = [{ ...root, text: 'Account B explicitly edited' }];
  await f.send('drafts.save', { profile: next.profile, revision: next.revision, items: patch });
  assert.deepEqual((await f.send('drafts.open')).items, patch);
  await f.send('session.stop'); f.account('account-a'); await f.start();
  assert.deepEqual((await f.send('drafts.open')).items, [root, reply, unopened], 'original account work remains exact on return');
  assert.equal(f.counts().maxActive, 1); assert.equal(f.counts().forbidden + f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC draft replacement ' + stage, maxPhysicalIO: f.counts().maxActive,
    retiredCommits: 0, crossAccountRestores: 0, historyWhileOldIOHeld: true, explicitNewAccountRecovery: true }));
});
