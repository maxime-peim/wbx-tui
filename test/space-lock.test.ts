/** MF23 lock/unlock contract-first assertions, exercised through existing owners offline. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers, authenticatedSelf } from '../src/room-members.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());

const title = 'Existing résumé 😀 | inert standalone';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(initial = false, options: {
  room?: Record<string, unknown>; membership?: Record<string, unknown>; duplicate?: boolean; more?: boolean;
  refusal?: number; unknown?: boolean; ack?: (raw: Record<string, unknown>) => unknown;
} = {}) {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  const room = { id: 'group', type: 'group', title, creatorId: 'self', isLocked: initial,
    isPublic: false, isAnnouncementOnly: false, description: 'Existing description', ...options.room };
  const access = { token: 'INERT', scopes: ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write'],
    expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, call: mocks.wrap(async (path, method, _token, signal, body) => {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path === '/v1/rooms/group' && method === 'GET') return { value: { ...room } };
    if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      const own = { id: 'own', personId: 'self', roomId: 'group', isModerator: initial, ...options.membership };
      return { value: { items: options.duplicate ? [own, own] : [own] },
        ...(options.more ? { link: '<https://webexapis.com/v1/memberships?roomId=group&before=next>; rel="next"' } : {}) };
    }
    if (path === '/v1/rooms/group' && method === 'PUT') {
      if (options.refusal) throw new PublicProblem('failed', options.refusal);
      if (options.unknown) throw new PublicProblem('unknown');
      const raw = { ...room, ...(body as object) };
      return { value: options.ack ? options.ack(raw) : raw };
    }
    assert.fail('Unaccounted operation: ' + method + ' ' + path);
  }) };
  mocks.track(rest);
  const owner = new ConversationActions(rest, new RoomMembers(), () => access, (signal, token) => authenticatedSelf(rest, signal, token));
  const api = () => {
    assert.equal(typeof owner.setLocked, 'function', 'MF23 lock must extend the existing conversation owner');
    return owner;
  };
  return { owner, api, rest, room, calls, access,
    submit: (id = 'lock', expectedTitle = title, expectedLocked = initial, locked = !initial, valid = () => true) =>
      api().setLocked(id, 'group', expectedTitle, expectedLocked, locked, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF23 lock RPC names one explicit boolean transition and exact title echo, never a toggle/settings tunnel', () => {
  const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.lock', params });
  for (const locked of [true, false]) {
    const params = { requestId: 'one', roomId: 'group', expectedTitle: title, expectedLocked: !locked, locked, confirmed: true };
    assert.deepEqual(parse(params), { method: 'rooms.lock', params });
  }
});
test('MF23 lock RPC rejects no-op/coerced flags, actor/creator overrides and unreviewed settings', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: title, expectedLocked: false, locked: true, confirmed: true };
  const parse = (value: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.lock', params: value });
  assert.deepEqual(parse(params), { method: 'rooms.lock', params });
  for (const patch of [{ locked: false }, { locked: 'true' }, { expectedLocked: 0 }, { confirmed: false },
    { title: 'New title' }, { creatorId: 'self' }, { actorId: 'self' }, { isModerator: true }, { isPublic: false },
    { isAnnouncementOnly: false }, { isLocked: true }, { teamId: 'team' }, { expectedTitle: '' },
    { body: { isLocked: true } }, { url: 'https://evil.invalid' }]) assert.throws(() => parse({ ...params, ...patch }));
});
test('MF23 lock resolution requires the exact original unknown room/request without widening legacy recovery', () => {
  const params = { action: 'lock', roomId: 'group', requestId: 'original', checked: true };
  const parse = (value: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'conversations.resolve', params: value });
  assert.deepEqual(parse(params), { method: 'conversations.resolve', params });
  const { requestId: _id, ...missing } = params;
  assert.throws(() => parse(missing)); assert.throws(() => parse({ ...params, checked: false }));
  for (const action of ['rename', 'describe']) assert.equal(parse({ ...params, action }).method, 'conversations.resolve');
  assert.throws(() => parse({ ...params, action: 'leave' }));
});
test('MF23 lock proves self/creator/private standalone room/nonmoderator membership then one exact title/isLocked PUT', async () => {
  const f = fixture(), result = await f.submit();
  assert.equal(result.outcome.status, 'changed');
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/rooms/group'],
    ['GET', '/v1/memberships?roomId=group&personId=self&max=100'], ['PUT', '/v1/rooms/group'],
  ]);
  assert.deepEqual(f.puts()[0]!.body, { title, isLocked: true });
  assert.deepEqual({ ...result.outcome, status: 'changed' }, { ...result.outcome,
    action: 'lock', requestId: 'lock', roomId: 'group', expectedTitle: title, expectedLocked: false, locked: true, status: 'changed' });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
});
test('MF23 unlock requires fresh space moderator and sends false without membership/announcement/public changes', async () => {
  const f = fixture(true, { room: { creatorId: 'someone-else' } });
  assert.equal((await f.submit()).outcome.status, 'changed');
  assert.deepEqual(f.puts()[0]!.body, { title, isLocked: false });
  assert.equal(f.calls.length, 4);
});
test('MF23 lock refuses noncreator/missing creator even with stale creator labels or a moderator flag', async () => {
  const required = fixture(); required.api();
  for (const creatorId of ['other', undefined, null, '']) {
    const f = fixture(false, { room: { creatorId } });
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
  const contradictory = fixture(false, { membership: { isModerator: true } });
  assert.equal((await contradictory.submit()).outcome.status, 'failed'); assert.equal(contradictory.puts().length, 0);
});
test('MF23 creator alone cannot unlock; only fresh isModerator true authorizes the reviewed transition', async () => {
  const f = fixture(true, { membership: { isModerator: false } });
  assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, nullTeam: { teamId: null },
  public: { isPublic: true }, announcement: { isAnnouncementOnly: true }, readonly: { isReadOnly: true }, foreign: { id: 'other' },
})) test(`MF23 ${kind} lock target refuses with no privatize/clear-announcement/role fallback`, async () => {
  const f = fixture(false, { room }); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
test('MF23 missing/null/coerced private, announcement or lock flags never mean a safe false default', async () => {
  const required = fixture(); required.api();
  for (const field of ['isPublic', 'isAnnouncementOnly', 'isLocked']) for (const value of [undefined, null, 'false', 0]) {
    const f = fixture(false, { room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 lock membership role must be explicit, exact and unpaged for either transition', async () => {
  const required = fixture(); required.api();
  for (const initial of [false, true]) for (const options of [
    { duplicate: true }, { more: true }, { membership: { personId: 'other' } }, { membership: { roomId: 'other' } },
    { membership: { isModerator: undefined } }, { membership: { isModerator: null } }, { membership: { isModerator: 'true' } },
  ]) {
    const f = fixture(initial, options);
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
for (const [field, value] of [['title', 'Concurrent rename'], ['isLocked', true]] as const) {
  test(`MF23 changed ${field} is lock precondition conflict, zero title-echo PUTs`, async () => {
    const f = fixture(false, { room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0);
  });
}
test('MF23 invalid/no-op lock intent refuses without IO or reserving the request identity', async () => {
  const f = fixture(), api = f.api();
  for (const [expected, locked] of [[false, false], [true, true], [0, true], [false, 'true']]) {
    await assert.rejects(() => api.setLocked('invalid', 'group', title, expected as boolean, locked as boolean, () => true));
  }
  await assert.rejects(() => f.submit('bad!'));
  await assert.rejects(() => f.submit('invalid', ' padded '));
  assert.equal(f.calls.length, 0); assert.equal((await f.submit('invalid')).outcome.status, 'changed');
});
test('MF23 each missing known lock grant/expiry refuses before GETs; spark all does not add membership writes', async () => {
  const required = fixture(); required.api();
  for (const scope of ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write', 'expired']) {
    const f = fixture();
    if (scope === 'expired') f.access.expiresAt = 0; else f.access.scopes = f.access.scopes.filter(v => v !== scope);
    await assert.rejects(() => f.submit()); assert.equal(f.calls.length, 0);
  }
  const all = fixture(); all.access.scopes = ['spark:all'];
  assert.equal((await all.submit()).outcome.status, 'changed'); assert.equal(all.puts().length, 1);
});
test('MF23 missing/coerced/foreign/mismatched lock ACK remains unknown, never HTTP-success permission', async () => {
  for (const patch of [{ id: 'foreign' }, { type: 'direct' }, { title: 'Changed title' }, { isLocked: undefined },
    { isLocked: 'true' }, { isLocked: false }, { isPublic: undefined }, { isPublic: true }, { isAnnouncementOnly: true },
    { teamId: 'team' }, { errors: [] }]) {
    const f = fixture(false, { ack: raw => ({ ...raw, ...patch }) });
    assert.equal((await f.submit()).outcome.status, 'unknown');
    await assert.rejects(() => f.submit('fresh')); assert.equal(f.puts().length, 1);
  }
});
test('MF23 typed lock refusal is failed and ambiguous PUT is unknown, never membership fallback or retry', async () => {
  const denied = fixture(false, { refusal: 403 }); assert.equal((await denied.submit()).outcome.status, 'failed');
  const unknown = fixture(false, { unknown: true }); assert.equal((await unknown.submit()).outcome.status, 'unknown');
  await assert.rejects(() => unknown.submit('another')); assert.equal(unknown.puts().length, 1);
});
test('MF23 unknown lock blocks rename/description/preparation for that room through the shared metadata interlock', async () => {
  const f = fixture(false, { unknown: true }); await f.submit();
  const count = f.calls.length;
  await assert.rejects(f.owner.rename('rename', 'group', title, 'Other title', () => true));
  await assert.rejects(f.owner.describe('describe', 'group', title, 'Existing description', 'New description', () => true));
  await assert.rejects(f.owner.readDescription('group', () => true)); assert.equal(f.calls.length, count);
});
for (const action of ['rename', 'describe'] as const) test(`MF23 unknown ${action} blocks a new lock request before all reads`, async () => {
  const f = fixture(false, { unknown: true }); f.api();
  if (action === 'rename') await f.owner.rename('prior', 'group', title, 'Other title', () => true);
  else await f.owner.describe('prior', 'group', title, 'Existing description', 'New description', () => true);
  const count = f.calls.length; await assert.rejects(() => f.submit()); assert.equal(f.calls.length, count);
});
test('MF23 lock shares exact replay/identity with the 256-entry conversation ledger without republishing or eviction', async () => {
  const f = fixture();
  for (let i = 0; i < 256; i++) assert.equal((await f.submit('entry-' + i)).outcome.status, 'changed');
  const count = f.calls.length;
  await f.submit('entry-0'); await assert.rejects(() => f.submit('overflow'));
  await assert.rejects(() => f.submit('entry-0', title, true, false));
  await assert.rejects(f.owner.rename('entry-0', 'group', title, 'Other title', () => true));
  assert.equal(f.calls.length, count);
});
test('MF23 lock recovery requires exact original room/request and cannot erase newer unknown or rewrite old evidence', async () => {
  const f = fixture(false, { unknown: true }); await f.submit('older');
  assert.throws(() => f.owner.resolve('lock:group'));
  assert.throws(() => f.owner.resolve('lock:other', 'older'));
  assert.throws(() => f.owner.resolve('lock:group', 'forged'));
  f.owner.resolve('lock:group', 'older'); await f.submit('newer');
  assert.throws(() => f.owner.resolve('lock:group', 'older'));
  assert.equal((await f.submit('older')).outcome.status, 'unknown');
  await assert.rejects(() => f.submit('blocked')); assert.equal(f.puts().length, 2);
});
test('MF23 lock selection or grant loss after fresh membership cannot admit the PUT', async () => {
  const required = fixture(); required.api();
  for (const grantLoss of [false, true]) {
    const f = fixture(), original = f.rest.call; let valid = true;
    f.rest.call = async (...args) => {
      const result = await original(...args);
      if (args[0].startsWith('/v1/memberships')) {
        if (grantLoss) f.access.scopes = []; else valid = false;
      }
      return result;
    };
    assert.equal((await f.submit('loss', title, false, true, () => valid)).outcome.status, 'failed');
    assert.equal(f.puts().length, 0);
  }
});
test('MF23 post-PUT lock grant loss is unknown and cannot confer a moderator role', async () => {
  const f = fixture(); f.api(); const original = f.rest.call;
  f.rest.call = async (...args) => { const result = await original(...args); if (args[1] === 'PUT') f.access.scopes = []; return result; };
  assert.equal((await f.submit()).outcome.status, 'unknown'); assert.equal(f.puts().length, 1);
});
test('MF23 lock logical PUT deadline holds admission and refuses resolution across reset until physical settlement', async t => {
  const f = fixture(); f.api(); const gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.submit('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown'); assert.equal(f.owner.busy(), true);
    assert.throws(() => f.owner.resolve('lock:group', 'physical'));
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { ...f.room, isLocked: true } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false);
});
test('MF23 lock preflight deadline refuses before PUT and retains stubborn GET admission across reset', async t => {
  const f = fixture(); f.api(); const gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.submit(); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'failed'); assert.equal(f.owner.busy(), true);
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false); assert.equal(f.puts().length, 0);
});
test('MF23 actual demo lock/unlock returns transition evidence without main room/title/flag/role/history/delivery publication', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  try {
    await engine.start('demo');
    const created = await engine.createSpace('creator-owned', 'Creator owned standalone');
    await engine.select(created.roomId!); const before = engine.snapshot();
    const locked = await engine.setSpaceLocked('lock', created.roomId!, before.room!.title, false, true);
    assert.equal(locked.status, 'changed'); assert.equal(locked.locked, true);
    assert.deepEqual(engine.snapshot(), before, 'ACK cannot infer ongoing flags, membership roles, cache or receipts');
    const unlocked = await engine.setSpaceLocked('unlock', created.roomId!, before.room!.title, true, false);
    assert.equal(unlocked.status, 'changed'); assert.equal(unlocked.locked, false);
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(deliveries, []);
  } finally { engine.stop(); }
});
