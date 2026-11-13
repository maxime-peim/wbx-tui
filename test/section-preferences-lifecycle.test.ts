import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectionPreferencesLifecycle, SectionPreferenceError } from '../src/section-preferences-lifecycle.js';
import type { LocalSection, SectionPreferences } from '../src/local-sections.js';

const key = 'a'.repeat(64), other = 'b'.repeat(64);
const saved: LocalSection[] = [{ id: 'a'.repeat(24), name: 'Saved local grouping', rooms: ['r'], collapsed: false }];
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const code = (value: number) => (error: unknown) => error instanceof SectionPreferenceError && error.code === value;
function fixture() {
  let bound: string | undefined = key, generation = 0, ready = true, allowed = true, creates = 0, changes = 0;
  let loadGate: ReturnType<typeof deferred<LocalSection[] | undefined>> | undefined;
  let writeGate: ReturnType<typeof deferred<void>> | undefined, failure = false;
  const documents = new Map<string, LocalSection[]>([[key, structuredClone(saved)], [other, [{ ...saved[0]!, name: 'Other account' }]]]),
    calls: { action: string; key: string; valid?: () => boolean }[] = [];
  const storage: Pick<SectionPreferences, 'load' | 'save' | 'clear'> = {
    async load(key) {
      calls.push({ action: 'load', key });
      const gate = loadGate; loadGate = undefined;
      if (gate) return gate.promise;
      if (failure) throw Error('PRIVATE load failure');
      return structuredClone(documents.get(key));
    },
    async save(key, items, valid = () => true) {
      calls.push({ action: 'save', key, valid });
      const gate = writeGate; writeGate = undefined; if (gate) await gate.promise;
      if (failure || !valid()) throw Error('PRIVATE save failure');
      documents.set(key, structuredClone(items));
    },
    async clear(key, valid = () => true) {
      calls.push({ action: 'clear', key, valid });
      const gate = writeGate; writeGate = undefined; if (gate) await gate.promise;
      if (failure || !valid()) throw Error('PRIVATE clear failure');
      documents.delete(key);
    },
  };
  const owner = new SectionPreferencesLifecycle({ create: () => { creates++; return storage; },
    rooms: () => ['r'], changed: () => { changes++; } });
  return { owner, calls, documents,
    session() { const captured = generation; return { key: () => bound, current: () => captured === generation && ready, restoreAllowed: () => allowed }; },
    bind(value: string | undefined) { bound = value; }, ready(value: boolean) { ready = value; }, allow(value: boolean) { allowed = value; },
    reset() { generation++; owner.reset(); }, fail(value: boolean) { failure = value; },
    holdLoad() { return loadGate = deferred<LocalSection[] | undefined>(); },
    holdWrite() { return writeGate = deferred<void>(); },
    counts: () => ({ creates, changes }),
  };
}

test('preference owner is lazy and observational; local edits use detached revisioned grouping and listed room evidence', () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal(f.owner.snapshot(), undefined);
  assert.deepEqual(f.counts(), { creates: 0, changes: 0 });
  const created = f.owner.edit({ action: 'create', name: 'Session grouping' }, 0);
  created.items[0]!.name = 'Caller mutation';
  assert.equal(f.owner.snapshot()!.items[0]!.name, 'Session grouping');
  const id = created.items[0]!.id;
  assert.throws(() => f.owner.edit({ action: 'assign', id, roomId: 'not-listed' }, 1), code(-32032));
  const assigned = f.owner.edit({ action: 'assign', id, roomId: 'r' }, 1);
  assert.deepEqual(assigned.items[0]!.rooms, ['r']);
  assert.equal(f.owner.intent(), 3, 'even refused user intent supersedes automatic restore');
  assert.deepEqual(f.counts(), { creates: 0, changes: 2 });
  f.owner.reset();
  assert.equal(f.owner.snapshot(), undefined); assert.equal(f.owner.intent(), 3, 'reset is not a new intent counter');
});

test('ordinary automatic restore and explicit edit/save/load/clear preserve revisions and use only the bound partition', async () => {
  const f = fixture();
  await f.owner.restore(key, f.session(), f.owner.intent());
  assert.deepEqual(f.owner.snapshot(), { revision: 1, persistence: 'saved', items: saved });
  f.owner.edit({ action: 'rename', id: saved[0]!.id, name: 'Edited grouping' }, 1);
  assert.equal((await f.owner.operate('save', 2, f.session())).revision, 2);
  assert.equal(f.owner.snapshot()!.persistence, 'saved');
  f.owner.edit({ action: 'rename', id: saved[0]!.id, name: 'Unsaved replacement' }, 2);
  assert.equal((await f.owner.operate('load', 3, f.session())).items[0]!.name, 'Edited grouping');
  assert.deepEqual(await f.owner.operate('clear', 4, f.session()), { revision: 5, persistence: 'session', items: [] });
  assert.equal(f.documents.has(key), false); assert.equal(f.documents.has(other), true);
  assert.deepEqual(f.calls.map(call => call.action), ['load', 'save', 'load', 'clear']);
  assert.ok(f.calls.every(call => call.key === key)); assert.equal(f.counts().changes, 6);
});

test('automatic restore requires initial empty revision, original intent and current allowed verified binding before file creation', async () => {
  for (const boundary of ['unbound', 'different-key', 'not-current', 'not-allowed', 'old-intent', 'edited']) {
    const f = fixture(), session = f.session(), intent = f.owner.intent();
    if (boundary === 'unbound') f.bind(undefined);
    if (boundary === 'different-key') f.bind(other);
    if (boundary === 'not-current') f.ready(false);
    if (boundary === 'not-allowed') f.allow(false);
    if (boundary === 'old-intent') { f.bind(undefined); await assert.rejects(f.owner.operate('clear', 0, session), code(-32032)); f.bind(key); }
    if (boundary === 'edited') f.owner.edit({ action: 'create', name: 'Current grouping' }, 0);
    await f.owner.restore(key, session, boundary === 'edited' ? f.owner.intent() : intent);
    assert.equal(f.calls.length, 0, boundary); assert.equal(f.counts().creates, 0, boundary);
  }
});

test('edits and refused explicit actions supersede an automatic read without releasing physical admission or replaying it', async () => {
  for (const intent of ['edit', 'bad-edit', 'load', 'save', 'clear'] as const) {
    const f = fixture(), gate = f.holdLoad();
    const pending = f.owner.restore(key, f.session(), f.owner.intent());
    if (intent === 'edit') f.owner.edit({ action: 'create', name: 'New session work' }, 0);
    else if (intent === 'bad-edit') assert.throws(() => f.owner.edit({ action: 'create', name: 'Stale edit' }, 1), code(-32032));
    else await assert.rejects(f.owner.operate(intent, 0, f.session()), code(-32002));
    assert.equal(f.calls.length, 1);
    gate.resolve(saved); await pending;
    assert.equal(f.owner.snapshot()?.items[0]?.name, intent === 'edit' ? 'New session work' : undefined);
    assert.equal(f.calls.length, 1, 'no automatic follow-up read/write');
    await f.owner.operate('load', intent === 'edit' ? 1 : 0, f.session());
    assert.deepEqual(f.owner.snapshot()!.items, saved, 'later explicit load recovers normally');
  }
});

test('explicit load/save/clear keep physical admission across reset and cannot publish or commit into a replacement session', async () => {
  for (const action of ['load', 'save', 'clear'] as const) {
    const f = fixture();
    f.owner.edit({ action: 'create', name: 'Old grouping' }, 0);
    const load = action === 'load' ? f.holdLoad() : undefined, write = action !== 'load' ? f.holdWrite() : undefined;
    const pending = f.owner.operate(action, 1, f.session()), rejected = assert.rejects(pending, code(-32032));
    assert.throws(() => f.owner.edit({ action: 'create', name: 'Blocked' }, 1), code(-32002));
    f.reset(); f.bind(other);
    await f.owner.restore(other, f.session(), f.owner.intent());
    await assert.rejects(f.owner.operate('load', 0, f.session()), code(-32002));
    assert.equal(f.calls.length, 1); assert.equal(f.owner.snapshot(), undefined);
    const changes = f.counts().changes;
    load?.resolve(saved); write?.resolve(); await rejected;
    assert.equal(f.counts().changes, changes, 'retired completion cannot publish unavailable/saved state');
    assert.deepEqual(f.documents.get(key), saved, 'retired writes keep the old document');
    assert.equal(f.owner.snapshot(), undefined);
    assert.equal((await f.owner.operate('load', 0, f.session())).items[0]!.name, 'Other account');
    assert.equal(f.calls.length, 2);
  }
});

test('retired automatic success or failure permits new edits but cannot overwrite or mark unavailable after reset', async () => {
  for (const outcome of ['success', 'failure']) {
    const f = fixture(), gate = f.holdLoad();
    const pending = f.owner.restore(key, f.session(), f.owner.intent());
    f.reset(); f.bind(other);
    f.owner.edit({ action: 'create', name: 'Replacement session work' }, 0);
    await f.owner.restore(other, f.session(), f.owner.intent());
    const before = f.owner.snapshot(), changes = f.counts().changes;
    if (outcome === 'success') gate.resolve(saved); else gate.reject(Error('PRIVATE old file failure'));
    await pending;
    assert.deepEqual(f.owner.snapshot(), before); assert.equal(f.counts().changes, changes);
    await f.owner.operate('save', 1, f.session());
    assert.equal(f.documents.get(other)![0]!.name, 'Replacement session work');
  }
});

test('current explicit failures preserve grouping and revision, sanitize errors and recover only on explicit retry', async () => {
  for (const action of ['load', 'save', 'clear'] as const) {
    const f = fixture(); f.owner.edit({ action: 'create', name: 'Retained work' }, 0);
    f.fail(true);
    await assert.rejects(f.owner.operate(action, 1, f.session()), error =>
      code(-32032)(error) && error instanceof Error && !error.message.includes('PRIVATE'));
    assert.equal(f.owner.snapshot()!.items[0]!.name, 'Retained work');
    assert.equal(f.owner.snapshot()!.revision, 1); assert.equal(f.owner.snapshot()!.persistence, 'unavailable');
    assert.equal(f.calls.length, 1); await Promise.resolve(); assert.equal(f.calls.length, 1);
    f.fail(false);
    await f.owner.operate(action, 1, f.session()); assert.equal(f.calls.length, 2);
    assert.notEqual(f.owner.snapshot()!.persistence, 'unavailable');
  }
});

test('missing and malformed saved data differ from automatic absence and never erase local grouping', async () => {
  const f = fixture(); f.documents.delete(key);
  await f.owner.restore(key, f.session(), f.owner.intent());
  assert.deepEqual(f.owner.snapshot(), { revision: 0, persistence: 'session', items: [] });
  f.owner.edit({ action: 'create', name: 'Retained local work' }, 0);
  await assert.rejects(f.owner.operate('load', 1, f.session()), code(-32032));
  f.documents.set(key, [{ ...saved[0]!, rooms: ['r', 'r'] }]);
  await assert.rejects(f.owner.operate('load', 1, f.session()), code(-32032));
  assert.equal(f.owner.snapshot()!.items[0]!.name, 'Retained local work');
  assert.equal(f.owner.snapshot()!.revision, 1); assert.equal(f.calls.length, 3);
});

test('explicit stale revision and unavailable binding fail before file work; binding loss invalidates a held commit', async () => {
  const f = fixture(); f.owner.edit({ action: 'create', name: 'Local work' }, 0);
  await assert.rejects(f.owner.operate('save', 0, f.session()), code(-32032));
  f.bind(undefined); await assert.rejects(f.owner.operate('clear', 1, f.session()), code(-32032));
  assert.equal(f.counts().creates, 0); f.bind(key);
  const gate = f.holdWrite(), pending = f.owner.operate('save', 1, f.session()), rejected = assert.rejects(pending, code(-32032));
  f.bind(undefined);
  assert.equal(f.calls[0]!.valid!(), false); gate.resolve(); await rejected;
  assert.equal(f.owner.snapshot()!.persistence, 'session', 'invalidated failure does not overwrite the existing projection');
  assert.deepEqual(f.documents.get(key), saved);
});

test('automatic grant admission remains distinct from explicit current-bound-key admission without new identity/expiry policy', async () => {
  const f = fixture(); f.allow(false);
  await f.owner.restore(key, f.session(), f.owner.intent()); assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.owner.operate('load', 0, f.session())).items, saved, 'explicit operation follows existing bound-key/current checks');
  const snapshot = f.owner.snapshot(); for (let i = 0; i < 20; i++) assert.deepEqual(f.owner.snapshot(), snapshot);
  assert.equal(f.calls.length, 1, 'projection cannot initiate preference I/O');
});
