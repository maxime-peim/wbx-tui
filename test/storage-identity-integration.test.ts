import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { SpacesCache, spacesCacheKey } from '../src/spaces-cache.js';
import { LocalDrafts, type LocalDraft } from '../src/local-drafts.js';
import { SectionPreferences } from '../src/local-sections.js';
import type { AccessCredentials } from '../src/auth-protocol.js';

const profile = { clientId: 'shared-storage-test', clientSecret: 'PRIVATE-CLIENT-SECRET',
  redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] };
const room = { id: 'r', title: 'Synthetic storage room', type: 'group' as const, lastActivity: '' };
const draft = (account: string): LocalDraft => ({ roomId: 'r', text: 'Local-only text ' + account, format: 'plain', uncertain: false });
const grouping = (account: string) => [{ id: 'a'.repeat(24), name: 'Saved grouping ' + account, rooms: ['r'], collapsed: false }];
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(engine: EditorEngine, check: () => boolean) {
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { if (check()) { clearTimeout(timer); engine.off('state', done); resolve(); } };
    const timer = setTimeout(() => { engine.off('state', done); reject(new Error('Synthetic identity workflow timeout')); }, 3000);
    engine.on('state', done); done();
  });
}
async function fixture(t: TestContext) {
  const base = await mkdtemp('/tmp/opencode/wbx-shared-storage-');
  const preferences = new SectionPreferences(join(base, 'state'));
  // This workflow needs two saved accounts simultaneously. Slot-collision
  // refusal is tested separately; random temp paths must not select that case.
  const config = Array.from({ length: 256 }, (_, i) => join(base, `config-${i}.json`)).find(path =>
    preferences.path(spacesCacheKey(path, profile, 'account-a')) !== preferences.path(spacesCacheKey(path, profile, 'account-b')));
  assert.ok(config, 'choose independent private preference slots without changing account/key derivation');
  const cacheBase = join(base, 'cache'), stateBase = join(base, 'state');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  let account = 'account-a', access: AccessCredentials = { token: 'PRIVATE-ACCESS', scope: 'spark:all', expiresAt: Date.now() + 3600_000 };
  let next: ReturnType<typeof deferred<string>> | undefined, forbidden = 0, sends = 0;
  const identities: { gate: ReturnType<typeof deferred<string>>; signal: AbortSignal; token: string }[] = [];
  const io = { cache: [] as string[], drafts: [] as string[], preferences: [] as string[] };
  const caches: SpacesCache[] = [];
  class Cache extends SpacesCache {
    override async load(key: string) { io.cache.push(key); return super.load(key); }
  }
  class Drafts extends LocalDrafts {
    override async load(key: string) { io.drafts.push(key); return super.load(key); }
  }
  class Preferences extends SectionPreferences {
    override async load(key: string) { io.preferences.push(key); return super.load(key); }
  }
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ ...access }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => ({ ...access }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [room] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{ id: 'm-r', author: 'Synthetic', text: 'Live history stays independent', created: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw new Error('No send admitted'); });
  const engine = new EditorEngine(async () => assert.fail('No browser'), undefined, undefined, undefined, undefined, {
    create: () => { const cache = new Cache(cacheBase); caches.push(cache); return cache; },
    account: async (value, signal) => {
      const gate = next ?? deferred<string>(); const held = !!next; next = undefined;
      identities.push({ gate, signal, token: value.token });
      if (!held) gate.resolve(account);
      return gate.promise;
    },
  }, { localDrafts: new Drafts(stateBase), sectionPreferences: new Preferences(stateBase) });
  const packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  let id = 0;
  const call = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(item => item.id === request); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  t.after(async () => {
    engine.stop(); rpc.close(); for (const item of identities) item.gate.resolve('retired-account');
    await turn(); await rm(base, { recursive: true, force: true });
  });
  await send('hello', { version: 1 });
  return { engine, io, caches, identities, packets, call, send,
    start: (cache = true) => send('session.start', { mode: 'live', config, spacesCache: cache }),
    key: (value = account) => spacesCacheKey(config, profile, value),
    holdIdentity() { const gate = deferred<string>(); next = gate; return gate; },
    account(value: string) { account = value; },
    access(value: Partial<AccessCredentials>) { access = { ...access, ...value }; },
    counts: () => ({ identities: identities.length, caches: caches.length, forbidden, sends }),
    async seed(value = account) {
      const key = spacesCacheKey(config, profile, value), cache = new SpacesCache(cacheBase);
      await cache.save(key, [room]); cache.close();
      const drafts = new LocalDrafts(stateBase), empty = await drafts.load(key);
      await drafts.save(key, empty.revision, [draft(value)]);
      await new SectionPreferences(stateBase).save(key, grouping(value));
    } };
}

test('ordinary RPC cache, drafts and preferences share one held identity and reuse it after token renewal', async t => {
  const f = await fixture(t); await f.seed(); const identity = f.holdIdentity();
  await f.start();
  const opening = f.send('drafts.open');
  assert.equal(f.identities.length, 1); assert.deepEqual(f.io, { cache: [], drafts: [], preferences: [] });
  await f.send('rooms.select', { roomId: 'r' });
  assert.equal(f.engine.snapshot().ready, true, 'history selection does not wait for optional storage identity');
  identity.resolve('account-a');
  const opened = await opening;
  await until(f.engine, () => f.engine.snapshot().sections?.persistence === 'saved');
  assert.equal(opened.profile, f.key()); assert.deepEqual(opened.items, [draft('account-a')]);
  assert.deepEqual(f.engine.snapshot().sections!.items, grouping('account-a'));
  assert.deepEqual(f.io, { cache: [f.key()], drafts: [f.key()], preferences: [f.key()] });
  const saved = await f.send('drafts.save', { profile: opened.profile, revision: opened.revision,
    items: [{ ...draft('account-a'), text: 'New local-only saved text' }] });
  assert.equal(saved.sessionId, opened.sessionId);
  await f.send('sections.preferences', { action: 'save', revision: f.engine.snapshot().sections!.revision });
  f.access({ token: 'ROTATED-PRIVATE-ACCESS' }); await f.send('auth.refresh');
  assert.equal((await f.send('drafts.open')).items[0].text, 'New local-only saved text');
  await f.send('sections.preferences', { action: 'load', revision: f.engine.snapshot().sections!.revision });
  assert.equal(f.counts().identities, 1);
  assert.ok([...f.io.cache, ...f.io.drafts, ...f.io.preferences].every(key => key === f.key()));
  assert.doesNotMatch(JSON.stringify(f.engine.snapshot()), /PRIVATE|Local-only text|New local-only saved text/);
  assert.equal(f.counts().forbidden, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC shared storage identity reuse', identityReads: 1,
    sharedCacheDraftPreferenceKey: true, historyWhileIdentityHeld: true, renewalIdentityReads: 0 }));
});

test('ordinary RPC failed shared identity has no storage effects; explicit draft retry and reconnect recover separately', async t => {
  const f = await fixture(t); await f.seed(); const identity = f.holdIdentity();
  await f.start(); const opening = f.call('drafts.open');
  identity.reject(new Error('PRIVATE identity failure'));
  assert.equal((await opening).error.code, -32003);
  await until(f.engine, () => f.engine.snapshot().spacesCache.reason === 'identity-unavailable');
  assert.deepEqual(f.io, { cache: [], drafts: [], preferences: [] }); await turn();
  assert.equal(f.counts().identities, 1);
  const restored = await f.send('drafts.open');
  assert.deepEqual(restored.items, [draft('account-a')]); assert.equal(f.counts().identities, 2);
  assert.equal(f.engine.snapshot().spacesCache.reason, 'identity-unavailable', 'a draft retry does not implicitly restart cache binding');
  assert.equal((await f.call('sections.preferences', { action: 'load', revision: 0 })).error.code, -32032);
  assert.equal(f.io.preferences.length, 0);
  const session = restored.sessionId;
  await f.send('session.stop'); await f.start();
  await until(f.engine, () => f.engine.snapshot().sections?.persistence === 'saved');
  const reopened = await f.send('drafts.open');
  assert.notEqual(reopened.sessionId, session); assert.equal(reopened.profile, restored.profile);
  assert.equal(f.counts().identities, 3);
  assert.deepEqual(f.engine.snapshot().sections!.items, grouping('account-a'));
  assert.doesNotMatch(JSON.stringify(f.engine.snapshot()), /PRIVATE/);
  assert.equal(f.counts().forbidden, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC storage identity failure and explicit recovery', identityReads: 3,
    failedIdentityStorageReads: 0, automaticRetries: 0, draftRetryDoesNotBindPreferences: true }));
});

test('ordinary RPC replacement fences old identity and preserves draft physical admission while sharing the new account lookup', async t => {
  const f = await fixture(t); await f.seed(); await f.seed('account-b');
  const oldIdentity = f.holdIdentity(); await f.start();
  const oldSession = f.engine.snapshot().localContext!.sessionId;
  const oldOpening = f.call('drafts.open');
  await f.send('session.stop'); f.account('account-b'); f.access({ token: 'ACCOUNT-B-PRIVATE-ACCESS' });
  const nextIdentity = f.holdIdentity(); await f.start();
  assert.equal((await f.call('drafts.open')).error.code, -32002, 'old draft I/O admission survives logical session reset');
  assert.equal(f.identities[0]!.signal.aborted, true);
  oldIdentity.resolve('account-a');
  assert.equal((await oldOpening).error.code, -32003);
  assert.deepEqual(f.io, { cache: [], drafts: [], preferences: [] });
  const opening = f.send('drafts.open');
  assert.equal(f.identities.length, 2, 'old settlement cannot clear the newer single flight');
  nextIdentity.resolve('account-b'); const opened = await opening;
  await until(f.engine, () => f.engine.snapshot().sections?.persistence === 'saved');
  assert.notEqual(opened.sessionId, oldSession); assert.equal(opened.profile, f.key('account-b'));
  assert.notEqual(opened.profile, f.key('account-a')); assert.deepEqual(opened.items, [draft('account-b')]);
  assert.deepEqual(f.engine.snapshot().sections!.items, grouping('account-b'));
  assert.ok([...f.io.cache, ...f.io.drafts, ...f.io.preferences].every(key => key === f.key('account-b')));
  assert.equal(f.counts().caches, 1); assert.equal(f.counts().identities, 2);
  assert.equal(f.counts().forbidden, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC storage identity account/session replacement', identityReads: 2,
    retiredAccountStorageReads: 0, oldDraftAdmissionRetained: true, replacementFlightShared: true }));
});

test('ordinary RPC opt-out, grant loss and renewed grant cannot bypass identity gates or create another lookup', async t => {
  const f = await fixture(t); await f.seed(); f.access({ scope: 'spark:rooms_read' });
  await f.start(false); await f.send('state.get'); await f.send('rooms.list');
  assert.equal(f.counts().identities, 0); assert.equal(f.counts().caches, 0);
  assert.equal((await f.call('drafts.open')).error.code, -32003);
  assert.deepEqual(f.io, { cache: [], drafts: [], preferences: [] });
  f.access({ scope: 'spark:people_read spark:rooms_read' }); await f.send('auth.refresh');
  const opened = await f.send('drafts.open');
  assert.deepEqual(opened.items, [draft('account-a')]); assert.equal(f.counts().identities, 1);
  const reads = f.io.drafts.length;
  f.access({ scope: 'spark:rooms_read' }); await f.send('auth.refresh');
  assert.equal((await f.call('drafts.open')).error.code, -32003); assert.equal(f.io.drafts.length, reads);
  f.access({ scope: 'spark:all', token: 'RENEWED-PRIVATE-ACCESS' }); await f.send('auth.refresh');
  assert.equal((await f.send('drafts.open')).profile, opened.profile);
  assert.equal(f.counts().identities, 1); assert.equal(f.io.cache.length + f.io.preferences.length, 0);
  assert.equal(f.counts().forbidden, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC storage identity grant and opt-out gates', identityReads: 1,
    unavailableGrantStorageReads: 0, cachePreferenceReads: 0, renewalIdentityReads: 0 }));
});
