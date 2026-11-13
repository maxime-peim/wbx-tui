import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LocalDraftsLifecycle, LocalDraftError, type LocalDraftSession } from '../src/local-drafts-lifecycle.js';
import type { LocalDraft, LocalDrafts } from '../src/local-drafts.js';

const key = 'a'.repeat(64), other = 'b'.repeat(64);
const root: LocalDraft = { roomId: 'r', text: '**Local 😀 draft**\nSecond line', format: 'markdown', uncertain: false };
const reply: LocalDraft = { ...root, parentId: 'root', text: 'Reply retained', uncertain: true };
const unopened: LocalDraft = { roomId: 'unopened', text: 'Unopened room work', format: 'plain', uncertain: false };
const revision = (items: LocalDraft[]) => createHash('sha256').update(JSON.stringify(items)).digest('hex');
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const code = (value: number) => (error: unknown) => error instanceof LocalDraftError && error.code === value;
function fixture() {
  let generation = 0, ready = true, allowed = true, profile = key, mode: 'demo' | 'live' = 'live', config = '/tmp/opencode/draft-unit.json';
  let creates = 0, identities = 0, loadFailure = false, saveFailure = false;
  let identityGate: ReturnType<typeof deferred<string>> | undefined;
  const gates: { action: 'load' | 'save'; gate: ReturnType<typeof deferred<void>>; started: ReturnType<typeof deferred<void>> }[] = [];
  const documents = new Map<string, LocalDraft[]>([[key, [root, reply, unopened]], [other, [{ ...root, text: 'Other account work' }]]]);
  const calls: { action: 'load' | 'save'; profile: string; valid?: () => boolean }[] = [];
  const wait = async (action: 'load' | 'save') => {
    const index = gates.findIndex(gate => gate.action === action), held = index < 0 ? undefined : gates.splice(index, 1)[0];
    if (held) { held.started.resolve(); await held.gate.promise; }
  };
  const storage: Pick<LocalDrafts, 'load' | 'save'> = {
    async load(profile) {
      calls.push({ action: 'load', profile }); await wait('load');
      if (loadFailure) throw Error('PRIVATE file load failure');
      const items = structuredClone(documents.get(profile) ?? []);
      return { revision: revision(items), items };
    },
    async save(profile, expected, items, valid = () => true) {
      calls.push({ action: 'save', profile, valid }); await wait('save');
      if (saveFailure || !valid() || expected !== revision(documents.get(profile) ?? [])) throw Error('PRIVATE file commit failure');
      documents.set(profile, structuredClone(items)); return revision(items);
    },
  };
  const owner = new LocalDraftsLifecycle(() => { creates++; return storage; });
  return { owner, calls, documents,
    session(): LocalDraftSession {
      const captured = generation;
      return { mode, config, sessionId: 'session-' + captured, current: () => captured === generation && ready,
        key: async () => { identities++; const gate = identityGate; identityGate = undefined; return gate ? gate.promise : profile; },
        allowed: () => mode === 'demo' || allowed };
    },
    reset() { generation++; owner.reset(); }, ready(value: boolean) { ready = value; }, allow(value: boolean) { allowed = value; },
    profile(value: string) { profile = value; }, demo(value = config) { mode = 'demo'; config = value; },
    failLoad(value: boolean) { loadFailure = value; }, failSave(value: boolean) { saveFailure = value; },
    holdIdentity() { return identityGate = deferred<string>(); },
    hold(action: 'load' | 'save') {
      const held = { action, gate: deferred<void>(), started: deferred<void>() }; gates.push(held);
      return { started: held.started.promise, release: () => held.gate.resolve() };
    },
    counts: () => ({ creates, identities }),
  };
}

test('draft lifecycle is lazy and preserves the exact demo partition without live identity work', async () => {
  const f = fixture(); f.owner.reset(); assert.deepEqual(f.counts(), { creates: 0, identities: 0 });
  f.demo(); f.allow(false);
  const opened = await f.owner.open(f.session());
  assert.equal(opened.profile, createHash('sha256').update(JSON.stringify(['demo-drafts', f.session().config])).digest('hex'));
  assert.equal(opened.sessionId, 'session-0'); assert.deepEqual(opened.items, []);
  await f.owner.save(opened.profile, opened.revision, [root], f.session());
  assert.equal(f.counts().identities, 0);
  f.reset(); f.demo('/tmp/opencode/other-demo.json');
  assert.notEqual((await f.owner.open(f.session())).profile, opened.profile);
});

test('live open delegates to the shared key facade and returns exact session/profile/revision data without another cache', async () => {
  const f = fixture(), held = f.holdIdentity(), session = f.session();
  const opening = f.owner.open(session); session.sessionId = 'caller-mutated';
  assert.equal(f.counts().identities, 1); assert.equal(f.counts().creates, 0);
  await assert.rejects(f.owner.open(f.session()), code(-32002));
  held.resolve(key); const opened = await opening;
  assert.equal(opened.sessionId, 'session-0'); assert.equal(opened.profile, key);
  assert.equal(opened.revision, revision([root, reply, unopened]));
  opened.items[0]!.text = 'Caller change'; assert.equal(f.documents.get(key)![0]!.text, root.text);
  f.profile(other);
  assert.equal((await f.owner.open(f.session())).profile, other, 'identity reuse belongs to the key facade, not a second lifecycle identity cache');
});

test('ordinary draft patches retain unopened destinations and distinguish exact room/reply deletion from uncertainty', async () => {
  const f = fixture(), opened = await f.owner.open(f.session());
  const changed = { ...root, text: 'Edited local text' };
  const first = await f.owner.save(key, opened.revision, [changed], f.session());
  assert.deepEqual(f.documents.get(key), [changed, reply, unopened]); assert.equal(first.sessionId, opened.sessionId);
  const uncertain = { ...reply, text: '', uncertain: true };
  const second = await f.owner.save(key, first.revision, [{ ...root, text: '' }, uncertain], f.session());
  assert.deepEqual(f.documents.get(key), [uncertain, unopened]);
  await f.owner.save(key, second.revision, [{ ...uncertain, uncertain: false }], f.session());
  assert.deepEqual(f.documents.get(key), [unopened]);
  assert.ok(f.calls.every(call => call.profile === key));
});

test('save requires a successfully opened exact profile and valid patch before storage admission', async () => {
  const f = fixture();
  await assert.rejects(f.owner.save(key, revision([]), [root], f.session()), code(-32002));
  assert.equal(f.counts().creates, 0);
  const opened = await f.owner.open(f.session()), creates = f.counts().creates;
  await assert.rejects(f.owner.save(other, opened.revision, [root], f.session()), code(-32002));
  await assert.rejects(f.owner.save(key, opened.revision, [root, root], f.session()), code(-32002));
  assert.equal(f.counts().creates, creates);
  const held = f.hold('save'), saving = f.owner.save(key, opened.revision, [root], f.session());
  await held.started;
  await assert.rejects(f.owner.open(f.session()), code(-32002));
  await assert.rejects(f.owner.save(key, opened.revision, [root], f.session()), code(-32002));
  held.release(); await saving;
});

test('stale revision fails before write and explicit reopen/edit/save recovers without replay', async () => {
  const f = fixture(), opened = await f.owner.open(f.session());
  const concurrent = [{ ...root, text: 'Another editor newer work' }]; f.documents.set(key, concurrent);
  await assert.rejects(f.owner.save(key, opened.revision, [{ ...root, text: 'Stale edit' }], f.session()), code(-32003));
  assert.deepEqual(f.documents.get(key), concurrent); assert.equal(f.calls.filter(call => call.action === 'save').length, 0);
  const reopened = await f.owner.open(f.session());
  await f.owner.save(key, reopened.revision, [{ ...root, text: 'Explicitly merged work' }], f.session());
  assert.equal(f.documents.get(key)![0]!.text, 'Explicitly merged work');
});

test('reset retires a held open without releasing physical I/O and later new-account open/save works', async () => {
  const f = fixture(), held = f.hold('load'), opening = f.owner.open(f.session()), rejected = assert.rejects(opening, code(-32003));
  await held.started; f.reset(); f.profile(other);
  await assert.rejects(f.owner.open(f.session()), code(-32002));
  assert.equal(f.counts().identities, 1, 'physical busy rejection does not request replacement identity');
  held.release(); await rejected;
  await assert.rejects(f.owner.save(key, revision([root, reply, unopened]), [root], f.session()), code(-32002));
  const opened = await f.owner.open(f.session());
  assert.equal(opened.profile, other); assert.equal(opened.sessionId, 'session-1');
  await f.owner.save(other, opened.revision, [{ ...root, text: 'Replacement account edit' }], f.session());
  assert.deepEqual(f.documents.get(key), [root, reply, unopened]);
});

test('save reload and commit each retain physical admission across reset and reject retired results', async () => {
  for (const stage of ['load', 'save'] as const) {
    const f = fixture(), opened = await f.owner.open(f.session()), held = f.hold(stage);
    const pending = f.owner.save(key, opened.revision, [{ ...root, text: 'Retired edit' }], f.session()), rejected = assert.rejects(pending, code(-32003));
    await held.started; f.reset(); f.profile(other);
    await assert.rejects(f.owner.open(f.session()), code(-32002));
    held.release(); await rejected;
    assert.deepEqual(f.documents.get(key), [root, reply, unopened]);
    assert.equal((await f.owner.open(f.session())).profile, other);
  }
});

test('identity/load/save failures sanitize errors, retain documents and retry only on a later explicit operation', async () => {
  const f = fixture(), identity = f.holdIdentity();
  const pending = f.owner.open(f.session()), rejected = assert.rejects(pending, error =>
    code(-32003)(error) && error instanceof Error && !error.message.includes('PRIVATE'));
  identity.reject(Error('PRIVATE identity failure')); await rejected;
  assert.equal(f.calls.length, 0);
  const opened = await f.owner.open(f.session());
  f.failLoad(true); await assert.rejects(f.owner.open(f.session()), code(-32003)); f.failLoad(false);
  f.failSave(true);
  await assert.rejects(f.owner.save(key, opened.revision, [root], f.session()), error =>
    code(-32003)(error) && error instanceof Error && !error.message.includes('PRIVATE'));
  assert.deepEqual(f.documents.get(key), [root, reply, unopened]);
  const calls = f.calls.length; await Promise.resolve(); assert.equal(f.calls.length, calls);
  f.failSave(false);
  await f.owner.save(key, opened.revision, [{ ...root, text: 'Explicit recovery' }], f.session());
  assert.equal(f.documents.get(key)![0]!.text, 'Explicit recovery', 'failed reopen did not invent a new binding-reset policy');
});

test('save rechecks current session/profile/grant before write and at physical commit', async () => {
  for (const stage of ['load', 'save'] as const) {
    for (const boundary of ['grant', 'ready', 'profile']) {
      const f = fixture(), opened = await f.owner.open(f.session()), held = f.hold(stage);
      const pending = f.owner.save(key, opened.revision, [{ ...root, text: 'Blocked commit' }], f.session()), rejected = assert.rejects(pending, code(-32003));
      await held.started;
      if (boundary === 'grant') f.allow(false);
      if (boundary === 'ready') f.ready(false);
      if (boundary === 'profile') f.owner.reset();
      held.release(); await rejected;
      assert.deepEqual(f.documents.get(key), [root, reply, unopened]);
      if (stage === 'load') assert.equal(f.calls.filter(call => call.action === 'save').length, 0);
    }
  }
});

test('open preserves existing post-load current-session policy while save still requires live allowed access', async () => {
  const f = fixture(), held = f.hold('load'), pending = f.owner.open(f.session());
  await held.started; f.allow(false); held.release();
  const opened = await pending;
  assert.deepEqual(opened.items, [root, reply, unopened], 'open grant/expiry admission belongs to shared identity, not a new post-file-load gate');
  await assert.rejects(f.owner.save(key, opened.revision, [root], f.session()), code(-32003));
  assert.equal(f.calls.filter(call => call.action === 'save').length, 0);
});
