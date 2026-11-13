/** C2: retained original requests, not a mutation retry or a second outcome registry. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationActions } from '../src/conversation-actions.js';
import { authenticatedSelf, RoomMembers } from '../src/room-members.js';
import { PublicProblem, type ActionREST } from '../src/public-rest.js';
import { CONVERSATION_LIMITS } from '../src/action-contracts.js';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const context = { account: 'self', partition: 'profile-A', unknown: true, hold: false };
  const held = deferred<any>(), started = deferred<void>(), calls: string[] = [];
  const access = { token: 'INERT', scopes: ['spark:all'], expiresAt: Date.now() + 600000 };
  const room = { id: 'group', type: 'group', title: 'Before', description: 'Old', isLocked: true, isPublic: false, isAnnouncementOnly: false };
  const team = { id: 'team', name: 'Before', description: 'Old' };
  const rest: ActionREST = { busy: () => false, async call(path, method, _token, signal, body) {
    assert.equal(signal.aborted, false); calls.push(method + ' ' + path);
    if (path === '/v1/people/me') return { value: { id: context.account } };
    if (method === 'GET' && path === '/v1/rooms/group') return { value: { ...room } };
    if (method === 'GET' && path === '/v1/teams/team') return { value: { ...team } };
    if (path.startsWith('/v1/memberships?')) return { value: { items: [
      { id: 'own', roomId: 'group', personId: context.account, isModerator: true },
    ] } };
    if (path.startsWith('/v1/team/memberships?')) return { value: { items: [
      { id: 'own', teamId: 'team', personId: context.account, isModerator: true },
    ] } };
    assert.equal(method, 'PUT');
    if (context.hold) { started.resolve(); return held.promise; }
    if (context.unknown) throw new PublicProblem('unknown', undefined, 'possible-write');
    const value = { ...(path.includes('/teams/') ? team : room), ...body };
    if (value.description === ' ') value.description = ''; // Documented clear sentinel -> explicit empty ACK.
    return { value };
  } };
  const owner = new ConversationActions(rest, new RoomMembers(), () => access,
    (signal, token) => authenticatedSelf(rest, signal, token), undefined, self => context.partition + ':' + self);
  const send = {
    rename: (id: string) => owner.rename(id, 'group', 'Before', 'After', () => true),
    describe: (id: string) => owner.describe(id, 'group', 'Before', 'Old', 'New', () => true),
    lock: (id: string) => owner.setLocked(id, 'group', 'Before', true, false, () => true),
    announcement: (id: string) => owner.setAnnouncementOnly(id, 'group', 'Before', false, true, () => true),
    'description-clear': (id: string) => owner.clearDescription(id, 'group', 'Before', 'Old', () => true),
    'team-rename': (id: string) => owner.renameTeam(id, 'team', 'Before', 'After', () => true),
    'team-describe': (id: string) => owner.describeTeam(id, 'team', 'Before', 'Old', 'New', () => true),
  };
  return { owner, send, context, held, started, access, calls, puts: () => calls.filter(c => c.startsWith('PUT')).length };
}
for (const action of ['rename', 'describe', 'lock', 'announcement', 'description-clear', 'team-rename', 'team-describe'] as const) {
  test(`C2 ${action}: reset retains only checked original-request recovery, then new deliberate work succeeds`, async () => {
    const f = fixture(), key = action + ':' + (action.startsWith('team-') ? 'team' : 'group');
    assert.equal((await f.send[action]('original')).outcome.status, 'unknown');
    f.owner.reset(); f.owner.reset(); f.access.token = 'RENEWED-INERT';
    assert.equal(f.puts(), 1);
    assert.throws(() => f.owner.resolve(key, 'original'), 'sync API cannot adopt retired evidence');
    await assert.rejects(f.owner.recover(key, 'wrong', () => true));
    await assert.rejects(f.owner.recover(key + '-other', 'original', () => true));
    await assert.rejects(f.send[action]('original'), 'retired outcomes never replay into the new session');
    assert.equal((await f.send[action]('blocked')).outcome.status, 'failed', 'same-partition unknown blocks new dispatch');
    assert.equal(f.puts(), 1);
    const before = f.calls.length;
    await f.owner.recover(key, 'original', () => true);
    assert.deepEqual(f.calls.slice(before), ['GET /v1/people/me'], 'recovery reads self only, never target or mutation');
    await f.owner.recover(key, 'original', () => true); // Lost recovery ACK may be checked again, never a mutation.
    f.context.unknown = false;
    assert.equal((await f.send[action]('deliberate')).outcome.status, 'changed');
    assert.equal(f.puts(), 2);
  });
}
for (const change of ['account', 'partition'] as const) test(`C2 recovery rejects changed ${change} without consuming original evidence`, async () => {
  const f = fixture();
  await f.send.rename('original'); f.owner.reset();
  const original = f.context[change]; f.context[change] = 'other';
  await assert.rejects(f.owner.recover('rename:group', 'original', () => true));
  assert.equal(f.puts(), 1);
  f.context.unknown = false;
  assert.equal((await f.send.rename('other-partition-deliberate')).outcome.status, 'changed', 'old-account evidence grants no authority and does not block new-account work');
  f.context[change] = original; f.owner.reset();
  await f.owner.recover('rename:group', 'original', () => true);
  assert.equal(f.puts(), 2);
});
test('C2 lost recovery ACK can be checked after another reset, but cannot resolve a newer unknown', async () => {
  const f = fixture();
  await f.send.rename('original'); f.owner.reset();
  await f.owner.recover('rename:group', 'original', () => true);
  f.owner.reset(); await f.owner.recover('rename:group', 'original', () => true);
  assert.equal((await f.send.rename('new-unknown')).outcome.status, 'unknown');
  await assert.rejects(f.owner.recover('rename:group', 'original', () => true));
  f.owner.resolve('rename:group', 'new-unknown');
  assert.equal(f.puts(), 2);
});
test('C2 reset during recovery identity proof retains evidence until a fresh explicit check', async () => {
  const f = fixture();
  await f.send.rename('original'); f.owner.reset();
  const self = deferred<any>(), entered = deferred<void>(), call = f.owner.rest.call;
  f.owner.rest.call = async (...args) => args[0] === '/v1/people/me' ? (entered.resolve(), self.promise) : call(...args);
  const pending = f.owner.recover('rename:group', 'original', () => true);
  await entered.promise; f.owner.reset(); await assert.rejects(pending);
  assert.equal(f.owner.busy(), true, 'canceled identity work retains physical admission');
  self.resolve({ value: { id: 'self' } }); for (let i = 0; i < 8; i++) await turn();
  f.owner.rest.call = call;
  await f.owner.recover('rename:group', 'original', () => true);
  assert.equal(f.puts(), 1);
});
test('C2 recovery rechecks grant after physical identity settlement, without consuming evidence on refusal', async () => {
  const f = fixture();
  await f.send.rename('original'); f.owner.reset();
  const physical = deferred<void>(), entered = deferred<void>();
  f.owner.rest.settled = () => { entered.resolve(); return physical.promise; };
  const pending = f.owner.recover('rename:group', 'original', () => true);
  await entered.promise; f.access.scopes = []; physical.resolve();
  await assert.rejects(pending);
  f.access.scopes = ['spark:all']; f.owner.rest.settled = undefined;
  await f.owner.recover('rename:group', 'original', () => true);
  assert.equal(f.puts(), 1);
});
test('C2 reset during submitted PUT retains unknown, holds physical admission and fences late ACK before recovery/new work', async () => {
  const f = fixture(); f.context.hold = true;
  const pending = f.send['team-describe']('original'); await f.started.promise;
  f.owner.reset();
  assert.equal((await pending).outcome.status, 'unknown');
  assert.equal(f.owner.busy(), true);
  await assert.rejects(f.owner.recover('team-describe:team', 'original', () => true));
  await assert.rejects(f.send.rename('overlap'));
  f.held.resolve({ value: { id: 'team', name: 'Before', description: 'New' } });
  for (let i = 0; i < 8; i++) await turn();
  assert.equal(f.owner.busy(), false);
  assert.equal((f.owner as any).uncertain.size, 0, 'late old completion cannot fill active-session uncertainty');
  await f.owner.recover('team-describe:team', 'original', () => true);
  f.context.hold = false; f.context.unknown = false;
  assert.equal((await f.send['team-describe']('deliberate')).outcome.status, 'changed');
  assert.equal(f.puts(), 2);
});
test('C2 reset before dispatch retains no request; recovery is fenced by grant, expiry and session validity', async () => {
  const f = fixture(), self = deferred<any>(), entered = deferred<void>(), call = f.owner.rest.call;
  f.owner.rest.call = async (...args) => args[0] === '/v1/people/me' ? (entered.resolve(), self.promise) : call(...args);
  const pending = f.send.rename('not-submitted'); await entered.promise; f.owner.reset();
  assert.equal((await pending).outcome.status, 'failed');
  self.resolve({ value: { id: 'self' } }); for (let i = 0; i < 8; i++) await turn();
  f.owner.rest.call = call;
  assert.equal((f.owner as any).requests.size, 0);
  await f.send.rename('original'); f.owner.reset();
  f.access.scopes = [];
  await assert.rejects(f.owner.recover('rename:group', 'original', () => true));
  f.access.scopes = ['spark:all']; f.access.expiresAt = 0;
  await assert.rejects(f.owner.recover('rename:group', 'original', () => true));
  f.access.expiresAt = Date.now() + 600000;
  await assert.rejects(f.owner.recover('rename:group', 'original', () => false));
  await f.owner.recover('rename:group', 'original', () => true);
  assert.equal(f.puts(), 1);
});
test('C2 retained ledger remains bounded without evicting unresolved requests on reset', async () => {
  const f = fixture();
  await f.send.rename('original'); f.owner.reset();
  // The common admission limit includes retained entries, not a separate unbounded recovery map.
  for (let i = 1; i < CONVERSATION_LIMITS.requests; i++)
    (f.owner as any).requests.set('inert-' + i, { identity: 'inert', epoch: -1 });
  await assert.rejects(f.send.rename('overflow'));
  await f.owner.recover('rename:group', 'original', () => true);
  assert.equal(f.puts(), 1);
});
