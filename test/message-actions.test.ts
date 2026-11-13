import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageActions, type MutationIntent } from '../src/message-actions.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { richMentions, validateMentions } from '../src/rich-messages.js';
import { RoomMembers } from '../src/room-members.js';
import { handled, until } from './async-test.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());
const credentials = { token: 'SYNTHETIC', scopes: ['spark:all'], expiresAt: Date.now() + 3600000 };
function fixture() {
  let raw: Record<string, unknown> = { id: 'm', roomId: 'room', personId: 'self', text: 'Original', created: '2026-01-01T00:00:00Z' };
  const calls: { path: string; method: PublicMethod; body?: object }[] = [];
  let fail: PublicProblem | undefined, self: unknown = { id: 'self' }, changed = false, valid = true;
  const rest: ActionREST = { busy: () => false, call: async (path, method, _, signal, body) => {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (method !== 'GET') {
      if (fail) throw fail;
      if (method === 'DELETE') { changed = true; return { value: undefined }; }
      raw = { ...raw, text: undefined, markdown: undefined, ...body, updated: '2026-11-14T12:00:00Z' };
    }
    return { value: path === '/v1/people/me' ? self : path.startsWith('/v1/memberships?')
      ? { items: [{ id: 'member', roomId: 'room', personId: 'person', personDisplayName: 'Person' }] } : raw };
  } };
  mocks.track(rest);
  const owner = new MessageActions(rest, () => credentials);
  return { owner, rest, calls, valid: () => valid, revoke: () => { valid = false; }, raw: () => raw,
    change: (patch: object) => { raw = { ...raw, ...patch }; }, self: (value: unknown) => { self = value; },
    fail: (error: PublicProblem) => { fail = error; }, deleted: () => changed };
}
test('own-message preparation verifies self via public boundary and submitting is distinct, exact, and non-replayed', async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'edit', f.valid);
  assert.equal(context.content, 'Original'); assert.equal(context.format, 'plain');
  assert.ok(!JSON.stringify(context).includes('self')); assert.ok(!JSON.stringify(context).includes('fingerprint'));
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0, 'opening/writing an edit buffer is not mutation consent');
  const intent: MutationIntent = { contextId: context.contextId, requestId: 'edit-1', action: 'edit', revision: 12, content: 'New 😀', format: 'plain', conflictAccepted: true };
  const result = await f.owner.submit(intent, f.valid);
  assert.equal(result.outcome.status, 'changed'); assert.equal(result.outcome.revision, 12);
  assert.deepEqual(f.calls.at(-1)!.body, { roomId: 'room', text: 'New 😀' });
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
  assert.deepEqual((await f.owner.submit(intent, f.valid)).outcome, result.outcome);
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
  await assert.rejects(f.owner.submit({ ...intent, content: 'Different' }, f.valid));
});
for (const kind of ['author', 'unknown-self', 'files', 'card', 'oversize'] as const) test(`edit preparation refuses ${kind}`, async () => {
  const f = fixture();
  if (kind === 'author') f.change({ personId: 'foreign' });
  if (kind === 'unknown-self') f.self({});
  if (kind === 'files') f.change({ files: ['https://webexapis.com/v1/contents/file'] });
  if (kind === 'card') f.change({ attachments: [{}] });
  if (kind === 'oversize') f.change({ text: 'a'.repeat(1001) });
  await assert.rejects(f.owner.prepare('room', 'm', 'edit', f.valid));
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
});
test('detected concurrent server edits never PUT, and account/room changes cannot authorize old contexts', async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'edit', f.valid);
  f.change({ text: 'Another client edit' });
  const result = await f.owner.submit({ contextId: context.contextId, requestId: 'conflict', action: 'edit', revision: 0, content: 'Would overwrite', format: 'plain', conflictAccepted: true }, f.valid);
  assert.equal(result.outcome.status, 'conflict'); assert.equal(f.raw().text, 'Another client edit');
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0);
  const again = await f.owner.prepare('room', 'm', 'edit', f.valid); f.self({ id: 'different-account' });
  const denied = await f.owner.submit({ contextId: again.contextId, requestId: 'wrong-account', action: 'edit', revision: 1, content: 'Denied', format: 'plain', conflictAccepted: true }, f.valid);
  assert.equal(denied.outcome.status, 'failed'); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0);
  f.owner.reset(); await assert.rejects(f.owner.submit({ contextId: again.contextId, requestId: 'old', action: 'delete', revision: 0, conflictAccepted: true }, f.valid));
});
for (const status of ['failed', 'unknown'] as const) test(`mutation ${status} has truthful outcome, exact replay refusal and explicit unknown resolution`, async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'delete', f.valid);
  f.fail(new PublicProblem(status, status === 'failed' ? 403 : undefined));
  const intent: MutationIntent = { contextId: context.contextId, requestId: 'delete', action: 'delete', revision: 0, conflictAccepted: true };
  const result = await f.owner.submit(intent, f.valid);
  assert.equal(result.outcome.status, status); assert.equal(f.deleted(), false);
  await f.owner.submit(intent, f.valid); assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 1);
  if (status === 'unknown') {
    await assert.rejects(f.owner.prepare('room', 'm', 'delete', f.valid));
    f.owner.resolve('room', 'm');
    assert.ok(await f.owner.prepare('room', 'm', 'delete', f.valid));
  }
});
test('explicit deletion of an own file message is allowed, edits are capped at ten locally observed successes', async () => {
  const f = fixture();
  for (let i = 0; i < 11; i++) {
    const context = await f.owner.prepare('room', 'm', 'edit', f.valid);
    const result = await f.owner.submit({ contextId: context.contextId, requestId: 'edit-' + i, action: 'edit', revision: i, content: 'Edit ' + i, format: 'plain', conflictAccepted: true }, f.valid);
    assert.equal(result.outcome.status, i < 10 ? 'changed' : 'failed');
  }
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 10);
  f.change({ files: ['https://webexapis.com/v1/contents/file'] });
  const context = await f.owner.prepare('room', 'm', 'delete', f.valid);
  const result = await f.owner.submit({ contextId: context.contextId, requestId: 'delete', action: 'delete', revision: 0, conflictAccepted: true }, f.valid);
  assert.equal(result.outcome.status, 'changed'); assert.equal(f.deleted(), true);
});
test('context budgets, expiry, missing grants and explicit conflict acceptance fail closed', async t => {
  const f = fixture();
  for (let i = 0; i < 8; i++) await f.owner.prepare('room', 'm', 'edit', f.valid);
  await assert.rejects(f.owner.prepare('room', 'm', 'edit', f.valid));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 600001 });
  const context = await f.owner.prepare('room', 'm', 'edit', f.valid);
  await assert.rejects(f.owner.submit({ contextId: context.contextId, requestId: 'no-consent', action: 'edit', revision: 0, content: 'x', format: 'plain', conflictAccepted: false } as unknown as MutationIntent, f.valid));
  const unavailable = new MessageActions(f.rest, () => ({ ...credentials, scopes: ['spark:messages_write'] }));
  await assert.rejects(unavailable.prepare('room', 'm', 'edit', f.valid));
});
test('mention syntax separates exact target and label, rejects malformed/email/HTML targets, and requires fresh selected-room membership', async () => {
  const f = fixture(), members = new RoomMembers(), signal = new AbortController().signal;
  const text = 'Hello <@personId:person|Name 😀> <@all>';
  assert.deepEqual(richMentions(text), { people: ['person'], all: true });
  for (const invalid of ['<@personEmail:p@example.invalid|Name>', '<@personId:../x|Name>', '<@personId:person|Unsafe\nname>', '<@personId:person|', '<spark-mention data-object-id="person">Name</spark-mention>']) assert.throws(() => richMentions(invalid));
  await assert.rejects(validateMentions(f.rest, members, 'room', text, { mentionsAccepted: true }, signal, () => 'SYNTHETIC'));
  assert.equal(f.calls.length, 0, '@all requires distinct explicit consent before lookup/write');
  await validateMentions(f.rest, members, 'room', text, { mentionsAccepted: true, allAccepted: true }, signal, () => 'SYNTHETIC');
  assert.equal(f.calls.length, 1); assert.match(f.calls[0]!.path, /roomId=room&personId=person/);
  await assert.rejects(validateMentions(f.rest, members, 'room', '<@personId:removed|Name>', { mentionsAccepted: true }, signal, () => 'SYNTHETIC'));
});
test('rich edit refuses unconsented mentions and sends the Markdown field only on deliberate rich submit', async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'edit', f.valid);
  const intent: MutationIntent = { contextId: context.contextId, requestId: 'rich', action: 'edit', revision: 0,
    content: '**Hello** <@personId:person|Person>', format: 'markdown', conflictAccepted: true };
  assert.equal((await f.owner.submit(intent, f.valid)).outcome.status, 'failed');
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, 0);
  const result = await f.owner.submit({ ...intent, requestId: 'consented', mentionsAccepted: true }, f.valid);
  assert.equal(result.outcome.status, 'changed'); assert.deepEqual(f.calls.at(-1)!.body, { roomId: 'room', markdown: intent.content });
});
test('context discard frees bounded preparation only, never starts a mutation; reset rejects late account results', async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'edit', f.valid);
  f.owner.discard(context.contextId);
  assert.equal(f.owner.target(context.contextId), undefined);
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
  const second = await f.owner.prepare('room', 'm', 'edit', f.valid);
  let complete!: (value: any) => void, pending = false;
  const original = f.rest.call;
  f.rest.call = async (...args) => {
    if (args[1] === 'PUT') { pending = true; return new Promise(resolve => { complete = resolve; }); }
    return original(...args);
  };
  const submission = handled(f.owner.submit({ contextId: second.contextId, requestId: 'late', action: 'edit', revision: 1, content: 'New', format: 'plain', conflictAccepted: true }, f.valid));
  try {
  await until(() => pending, 'message PUT admission');
  f.owner.reset();
  await assert.rejects(f.owner.prepare('room', 'm', 'edit', f.valid), 'native admission cannot be bypassed by reset while an uncooperative boundary is running');
  complete({ value: { ...f.raw(), text: 'New' } });
  assert.equal((await submission).outcome.status, 'unknown');
  assert.equal(f.owner.target(second.contextId, 'late'), undefined);
  assert.ok(await f.owner.prepare('room', 'm', 'edit', f.valid), 'late unknown cannot contaminate a replacement session latch');
  } finally { complete?.({ value: { ...f.raw(), text: 'New' } }); f.owner.reset(); }
});
test('bounded request ledger refuses further mutations instead of evicting old replay identities', async () => {
  const f = fixture(), context = await f.owner.prepare('room', 'm', 'delete', f.valid);
  f.fail(new PublicProblem('failed', 403));
  const intent: MutationIntent = { contextId: context.contextId, requestId: 'first', action: 'delete', revision: 0, conflictAccepted: true };
  for (let i = 0; i < 256; i++) assert.equal((await f.owner.submit({ ...intent, requestId: i ? 'id-' + i : 'first' }, f.valid)).outcome.status, 'failed');
  const calls = f.calls.length;
  await assert.rejects(f.owner.submit({ ...intent, requestId: 'overflow' }, f.valid));
  assert.equal(f.calls.length, calls);
  assert.equal((await f.owner.submit(intent, f.valid)).outcome.status, 'failed');
  assert.equal(f.calls.length, calls, 'old failure is retained, never resubmitted');
});
for (const field of ['created', 'parentId', 'updated']) test(`edit ACK cannot change canonical ${field} or become new-message evidence`, async () => {
  const raw = { id: 'message', roomId: 'room', personId: 'self', created: '2026-01-01T00:00:00Z', updated: '2026-11-14T10:00:00Z', text: 'Before' };
  const actions = new MessageActions({ busy: () => false, call: async (path, method) => ({ value: path === '/v1/people/me'
    ? { id: 'self' } : method === 'PUT' ? { ...raw, text: 'After', [field]: field === 'created'
      ? '2026-11-14T12:00:00Z' : field === 'parentId' ? 'wrong-root' : '2026-01-01T00:00:00Z' } : raw }) },
    () => ({ token: 'SYNTHETIC', scopes: ['spark:all'], expiresAt: Date.now() + 10000 }));
  const context = await actions.prepare('room', 'message', 'edit', () => true);
  const result = await actions.submit({ contextId: context.contextId, requestId: 'edit', action: 'edit', revision: 0,
    format: 'plain', content: 'After', conflictAccepted: true }, () => true);
  assert.equal(result.outcome.status, 'unknown');
  assert.equal(result.raw, undefined, 'uncertain ACK never enters history projection');
});
