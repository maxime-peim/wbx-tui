import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers } from '../src/room-members.js';
import { handled, until } from './async-test.js';
import { authenticatedSelf } from '../src/room-members.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());
function fixture() {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  let fail: 'create' | 'invite' | 'direct' | undefined, moderator = false, locked: boolean | undefined = false, count = 0;
  const rest: ActionREST = { busy: () => false, call: async (path, method, _, signal, body) => {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (method === 'POST' && (fail === 'create' && path === '/v1/rooms' || fail === 'invite' && path === '/v1/memberships' || fail === 'direct' && path === '/v1/messages')) throw new PublicProblem('unknown');
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path.startsWith('/v1/people')) return { value: { id: 'person', displayName: 'Same name' } };
    if (path === '/v1/rooms' && method === 'POST') return { value: { id: 'new-group', title: (body as any).title, type: 'group' } };
    if (path.startsWith('/v1/rooms/')) return { value: { id: path.slice('/v1/rooms/'.length), type: path.endsWith('direct') ? 'direct' : 'group', isLocked: locked } };
    if (path.startsWith('/v1/memberships?')) return { value: { items: [{ id: 'own-membership', personId: 'self', roomId: 'group', isModerator: moderator }] } };
    if (path === '/v1/memberships' && method === 'POST') return { value: { id: 'new-membership', personId: 'person', roomId: 'group', isModerator: false } };
    if (path.startsWith('/v1/memberships/') && method === 'GET') return { value: { id: path.slice('/v1/memberships/'.length), personId: 'person', roomId: 'group' } };
    if (path.startsWith('/v1/memberships/') && method === 'DELETE') return { value: undefined };
    if (path === '/v1/messages' && method === 'POST') return { value: { id: 'message-' + ++count, roomId: 'direct', personId: 'self', created: new Date().toISOString(), text: (body as any).text } };
    assert.fail('Unexpected boundary: ' + method + ' ' + path);
  } };
  mocks.track(rest);
  const access = { token: 'SYNTHETIC', scopes: ['spark:all'], expiresAt: Date.now() + 3600000 };
  const owner = new ConversationActions(rest, new RoomMembers(), () => access,
    (signal, token) => authenticatedSelf(rest, signal, token));
  return { owner, rest, access, calls, fail: (kind: typeof fail) => { fail = kind; }, moderator: () => { moderator = true; }, lock: (value: typeof locked) => { locked = value; } };
}
test('recipient preparation sends no placeholder; first and later DM sends bind distinct returned room identity', async () => {
  const f = fixture(), draft = await f.owner.prepareDirect('person', () => true);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  const result = await f.owner.sendDirect('first', draft.targetId, 'native-draft', 'First', () => true);
  assert.equal(result.outcome.status, 'changed'); assert.equal(result.outcome.roomId, 'direct');
  assert.equal(result.outcome.messageId, 'message-1'); assert.equal(result.outcome.targetId, draft.targetId);
  assert.deepEqual(f.calls.find(call => call.path === '/v1/messages')!.body, { toPersonId: 'person', text: 'First' });
  await f.owner.sendDirect('first', draft.targetId, 'native-draft', 'First', () => true);
  assert.equal(f.calls.filter(call => call.path === '/v1/messages').length, 1);
  await f.owner.sendDirect('second', draft.targetId, 'native-draft', 'Second', () => true);
  assert.deepEqual(f.calls.filter(call => call.path === '/v1/messages').at(-1)!.body, { roomId: 'direct', text: 'Second' });
  await assert.rejects(f.owner.sendDirect('second', draft.targetId, 'other-draft', 'Second', () => true));
});
test('room creation and invitation are separate outcomes; partial success never repeats creation', async () => {
  const f = fixture();
  const created = await f.owner.create('create', 'Duplicate names allowed', () => true);
  assert.equal(created.outcome.status, 'changed'); assert.equal(created.outcome.roomId, 'new-group');
  f.fail('invite');
  assert.equal((await f.owner.membership('invite', 'invite', 'group', 'person', () => true)).outcome.status, 'unknown');
  await f.owner.create('create', 'Duplicate names allowed', () => true);
  assert.equal(f.calls.filter(call => call.path === '/v1/rooms' && call.method === 'POST').length, 1);
  assert.equal(f.calls.filter(call => call.path === '/v1/messages').length, 0);
});
test('fresh role/lock proof controls member actions and leave targets only the exact self membership', async () => {
  const f = fixture(); f.lock(true);
  assert.equal((await f.owner.membership('locked', 'invite', 'group', 'person', () => true)).outcome.status, 'failed');
  assert.equal((await f.owner.membership('unprivileged', 'remove', 'group', 'target-member', () => true)).outcome.status, 'failed');
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
  f.moderator();
  assert.equal((await f.owner.membership('remove', 'remove', 'group', 'target-member', () => true)).outcome.status, 'changed');
  assert.equal(f.calls.filter(call => call.method === 'DELETE').at(-1)!.path, '/v1/memberships/target-member');
  assert.equal((await f.owner.membership('leave', 'leave', 'group', undefined, () => true)).outcome.status, 'changed');
  assert.equal(f.calls.filter(call => call.method === 'DELETE').at(-1)!.path, '/v1/memberships/own-membership');
  assert.ok(f.calls.filter(call => call.method === 'DELETE').every(call => !call.path.startsWith('/v1/rooms')));
});
test('unknown creates and recipient sends latch independent of new request IDs, never auto-replay', async () => {
  const f = fixture(); f.fail('create');
  assert.equal((await f.owner.create('unknown', 'Title', () => true)).outcome.status, 'unknown');
  await assert.rejects(f.owner.create('different-id', 'Title', () => true));
  const draft = await f.owner.prepareDirect('person', () => true);
  f.fail('direct');
  assert.equal((await f.owner.sendDirect('send', draft.targetId, 'draft', 'Text', () => true)).outcome.status, 'unknown');
  const other = await f.owner.prepareDirect('person', () => true);
  await assert.rejects(f.owner.sendDirect('send-new', other.targetId, 'draft2', 'Text', () => true), 'new local context cannot bypass uncertainty for the same person');
  assert.equal(f.calls.filter(call => call.path === '/v1/messages').length, 1);
});
for (const kind of ['empty', 'ambiguous', 'wrong-email', 'wrong-id', 'self', 'missing-id', 'errors']) test(`recipient ${kind} identity refuses without a placeholder`, async () => {
  const f = fixture(), original = f.rest.call, email = 'exact@example.invalid';
  f.rest.call = async (...args) => {
    if (!args[0].startsWith('/v1/people') || args[0] === '/v1/people/me') return original(...args);
    const person = { id: kind === 'self' ? 'self' : kind === 'missing-id' ? undefined : 'person',
      emails: [kind === 'wrong-email' ? 'other@example.invalid' : email] };
    return { value: kind === 'wrong-id' ? { id: 'another' } : { items: kind === 'empty' ? [] : kind === 'ambiguous' ? [person, person] : [person],
      ...(kind === 'errors' ? { errors: [] } : {}) } };
  };
  await assert.rejects(f.owner.prepareDirect(kind === 'wrong-id' ? 'person' : email, () => true));
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
});
test('exact email resolution binds returned ID; account replacement and missing known grants cannot send', async () => {
  const f = fixture(), original = f.rest.call;
  f.rest.call = async (...args) => args[0].startsWith('/v1/people?')
    ? { value: { items: [{ id: 'person', displayName: 'Same name', emails: ['EXACT@example.invalid'] }] } } : original(...args);
  const draft = await f.owner.prepareDirect('exact@example.invalid', () => true);
  assert.equal(draft.personId, 'person');
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? { value: { id: 'replacement' } } : original(...args);
  assert.equal((await f.owner.sendDirect('changed-self', draft.targetId, 'draft', 'Text', () => true)).outcome.status, 'failed');
  f.access.scopes = ['spark:messages_write'];
  await assert.rejects(f.owner.create('missing', 'Title', () => true));
  await assert.rejects(f.owner.prepareDirect('person', () => true));
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
});
for (const field of ['id', 'roomId', 'personId', 'text', 'parentId', 'created', 'toPersonId', 'files', 'markdown', 'errors', 'room-type']) test(`direct ${field} malformed ACK remains unknown and blocks a fresh request ID`, async () => {
  const f = fixture(), draft = await f.owner.prepareDirect('person', () => true), original = f.rest.call;
  f.rest.call = async (...args) => {
    const value = await original(...args);
    if (args[1] === 'POST') return { value: { ...(value.value as object), [field]: field === 'created' ? 'invalid'
      : field === 'files' ? ['unexpected'] : field === 'errors' ? [] : field === 'id' ? '' : 'wrong' } };
    if (field === 'room-type' && args[0] === '/v1/rooms/direct') return { value: { id: 'direct', type: 'group' } };
    return value;
  };
  assert.equal((await f.owner.sendDirect('bad', draft.targetId, 'draft', 'Text', () => true)).outcome.status, 'unknown');
  assert.equal(f.owner.recipient(draft.targetId)!.roomId, undefined);
  await assert.rejects(f.owner.sendDirect('fresh', draft.targetId, 'draft', 'Text', () => true));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
for (const change of ['grant', 'reset', 'destination']) test(`post-submission ${change} loss preserves unknown, holds admission and fences late state`, async () => {
  const f = fixture(), original = f.rest.call;
  let complete!: (value: any) => void, posted = false, valid = true;
  f.rest.call = async (...args) => {
    if (args[1] === 'POST') { posted = true; return new Promise(resolve => { complete = resolve; }); }
    return original(...args);
  };
  const pending = handled(f.owner.create('pending', 'Title', () => valid));
  try {
  await until(() => posted, 'conversation POST admission');
  if (change === 'grant') f.access.scopes = [];
  if (change === 'reset') f.owner.reset();
  if (change === 'destination') valid = false;
  await assert.rejects(f.owner.prepareDirect('person', () => true), 'unsettled physical owner cannot overlap after logical invalidation');
  complete({ value: { id: 'new-group', title: 'Title', type: 'group' } });
  assert.equal((await pending).outcome.status, 'unknown', 'outer read check must not erase a mutation outcome');
  f.access.scopes = ['spark:all']; valid = true;
  f.rest.call = original;
  if (change === 'reset') assert.equal((await f.owner.create('pending', 'Title', () => true)).outcome.status, 'changed', 'late unknown cannot contaminate a replacement session');
  if (change !== 'reset') {
    assert.equal((await f.owner.create('pending', 'Title', () => true)).outcome.status, 'unknown');
    await assert.rejects(f.owner.create('another', 'Title', () => true));
  }
  } finally { complete?.({ value: { id: 'new-group', title: 'Title', type: 'group' } }); f.owner.reset(); }
});
test('recipient context lifetime and request budget refuse instead of evicting replay identities', async t => {
  const f = fixture();
  for (let i = 0; i < 8; i++) await f.owner.prepareDirect('person', () => true);
  await assert.rejects(f.owner.prepareDirect('person', () => true));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 600001 });
  const draft = await f.owner.prepareDirect('person', () => true);
  f.owner.discardRecipient(draft.targetId);
  assert.equal(f.owner.recipient(draft.targetId), undefined);
  const original = f.rest.call;
  f.rest.call = async (...args) => {
    if (args[1] === 'POST') throw new PublicProblem('failed', 403);
    return original(...args);
  };
  for (let i = 0; i < 256; i++) assert.equal((await f.owner.create('create-' + i, 'Same title', () => true)).outcome.status, 'failed');
  const calls = f.calls.length;
  await assert.rejects(f.owner.create('overflow', 'Same title', () => true));
  assert.equal((await f.owner.create('create-0', 'Same title', () => true)).outcome.status, 'failed');
  assert.equal(f.calls.length, calls);
});
test('unknown leave is not success, never room deletion, and requires explicit resolution', async () => {
  const f = fixture(), original = f.rest.call;
  f.rest.call = async (...args) => {
    if (args[1] === 'DELETE') throw new PublicProblem('unknown');
    return original(...args);
  };
  const result = await f.owner.membership('leave', 'leave', 'group', undefined, () => true);
  assert.equal(result.outcome.status, 'unknown'); assert.equal(result.outcome.roomId, 'group');
  await assert.rejects(f.owner.membership('new', 'leave', 'group', undefined, () => true));
  f.owner.resolve('leave:group');
  f.rest.call = original;
  assert.equal((await f.owner.membership('resolved', 'leave', 'group', undefined, () => true)).outcome.status, 'changed');
  assert.equal(f.calls.at(-1)!.path, '/v1/memberships/own-membership');
});
