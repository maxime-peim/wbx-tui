/** MF23 announcement contract-first assertions, exercised through existing owners offline. */
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
  const room = { id: 'group', type: 'group', title, creatorId: 'someone-else', isLocked: true,
    isPublic: false, isAnnouncementOnly: initial, description: 'Existing description', ...options.room };
  const access = { token: 'INERT', scopes: ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write'],
    expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, call: mocks.wrap(async (path, method, _token, signal, body) => {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path === '/v1/rooms/group' && method === 'GET') return { value: { ...room } };
    if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      const own = { id: 'own', personId: 'self', roomId: 'group', isModerator: true, ...options.membership };
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
    assert.equal(typeof owner.setAnnouncementOnly, 'function',
      'MF23 announcement must extend the existing conversation owner');
    return owner;
  };
  return { owner, api, rest, room, calls, access,
    submit: (id = 'announcement', expectedTitle = title, expected = initial, value = !initial, valid = () => true) =>
      api().setAnnouncementOnly(id, 'group', expectedTitle, expected, value, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF23 announcement RPC captures exact title and explicit enable/disable preconditions, not a toggle', () => {
  const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.announcement', params });
  for (const announcementOnly of [true, false]) {
    const params = { requestId: 'one', roomId: 'group', expectedTitle: title,
      expectedAnnouncementOnly: !announcementOnly, announcementOnly, confirmed: true };
    assert.deepEqual(parse(params), { method: 'rooms.announcement', params });
  }
});
test('MF23 announcement RPC rejects no-op/coerced flags and any auto-lock/role/settings/actor tunnel', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: title,
    expectedAnnouncementOnly: false, announcementOnly: true, confirmed: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.announcement', params: p });
  assert.deepEqual(parse(params), { method: 'rooms.announcement', params });
  for (const patch of [{ announcementOnly: false }, { announcementOnly: 'true' }, { expectedAnnouncementOnly: 0 }, { confirmed: false },
    { isLocked: true }, { locked: true }, { isModerator: true }, { actorId: 'self' }, { creatorId: 'self' },
    { title: 'New title' }, { expectedTitle: '' }, { isAnnouncementOnly: true }, { isPublic: false }, { teamId: 'team' },
    { description: 'Unexpected' }, { body: { isAnnouncementOnly: true } }, { url: 'https://evil.invalid' }]) {
    assert.throws(() => parse({ ...params, ...patch }));
  }
});
test('MF23 announcement recovery requires exact original unknown room/request without broadening legacy resolution', () => {
  const params = { action: 'announcement', roomId: 'group', requestId: 'original', checked: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'conversations.resolve', params: p });
  assert.deepEqual(parse(params), { method: 'conversations.resolve', params });
  const { requestId: _id, ...missing } = params;
  assert.throws(() => parse(missing)); assert.throws(() => parse({ ...params, checked: false }));
  for (const action of ['rename', 'describe', 'lock']) assert.equal(parse({ ...params, action }).method, 'conversations.resolve');
  assert.throws(() => parse({ ...params, action: 'leave' }));
});
for (const initial of [false, true]) test(`MF23 ${initial ? 'disable' : 'enable'} announcement proves locked/private standalone and moderator then one exact title/mode PUT`, async () => {
  const f = fixture(initial), result = await f.submit();
  assert.equal(result.outcome.status, 'changed'); assert.equal(result.outcome.action, 'announcement');
  assert.equal(result.outcome.roomId, 'group'); assert.equal(result.outcome.expectedTitle, title);
  assert.equal(result.outcome.expectedAnnouncementOnly, initial); assert.equal(result.outcome.announcementOnly, !initial);
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/rooms/group'],
    ['GET', '/v1/memberships?roomId=group&personId=self&max=100'], ['PUT', '/v1/rooms/group'],
  ]);
  assert.deepEqual(f.puts()[0]!.body, { title, isAnnouncementOnly: !initial });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 16384);
});
test('MF23 announcement creator/lock labels never replace fresh moderator proof in either direction', async () => {
  const required = fixture(); required.api();
  for (const initial of [false, true]) for (const isModerator of [false, undefined, null, 'true']) {
    const f = fixture(initial, { room: { creatorId: 'self' }, membership: { isModerator } });
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, nullTeam: { teamId: null }, public: { isPublic: true },
  unlocked: { isLocked: false }, readonly: { isReadOnly: true }, foreign: { id: 'other' },
})) test(`MF23 ${kind} announcement target refuses with no automatic lock/private/member-role fallback`, async () => {
  const f = fixture(false, { room }); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
test('MF23 missing/null/coerced lock/private/announcement flags never imply an admissible state', async () => {
  const required = fixture(); required.api();
  for (const field of ['isLocked', 'isPublic', 'isAnnouncementOnly']) for (const value of [undefined, null, 'false', 0]) {
    const f = fixture(false, { room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 announcement own membership must be exact, unique and unpaged, never a roster-label inference', async () => {
  const required = fixture(); required.api();
  for (const options of [{ duplicate: true }, { more: true }, { membership: { personId: 'other' } },
    { membership: { roomId: 'other' } }, { membership: { id: '' } }]) {
    const f = fixture(false, options);
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
for (const [field, value] of [['title', 'Concurrent rename'], ['isAnnouncementOnly', true]] as const) {
  test(`MF23 changed ${field} gives announcement precondition conflict without PUT`, async () => {
    const f = fixture(false, { room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0);
  });
}
test('MF23 malformed/no-op announcement inputs reserve nothing, read nothing and never normalize consent', async () => {
  const f = fixture(), api = f.api();
  for (const [old, value] of [[false, false], [true, true], [0, true], [false, 'true']]) {
    await assert.rejects(() => api.setAnnouncementOnly('invalid', 'group', title, old as boolean, value as boolean, () => true));
  }
  await assert.rejects(() => f.submit('bad!')); await assert.rejects(() => f.submit('invalid', ' padded '));
  assert.equal(f.calls.length, 0); assert.equal((await f.submit('invalid')).outcome.status, 'changed');
});
test('MF23 each missing known announcement grant or expiry refuses before reads; spark all keeps one two-field PUT', async () => {
  const required = fixture(); required.api();
  for (const scope of ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write', 'expired']) {
    const f = fixture();
    if (scope === 'expired') f.access.expiresAt = 0; else f.access.scopes = f.access.scopes.filter(v => v !== scope);
    await assert.rejects(() => f.submit()); assert.equal(f.calls.length, 0);
  }
  const all = fixture(); all.access.scopes = ['spark:all'];
  assert.equal((await all.submit()).outcome.status, 'changed'); assert.equal(all.puts().length, 1);
});
test('MF23 malformed/foreign/unlocked/public/wrong-mode announcement ACK stays unknown without optimistic authority', async () => {
  for (const patch of [{ id: 'other' }, { type: 'direct' }, { title: title + ' ' }, { isAnnouncementOnly: false },
    { isAnnouncementOnly: undefined }, { isAnnouncementOnly: 'true' }, { isLocked: false }, { isLocked: undefined },
    { isPublic: true }, { isPublic: undefined }, { teamId: null }, { isReadOnly: true }, { errors: [] }]) {
    const f = fixture(false, { ack: raw => ({ ...raw, ...patch }) });
    assert.equal((await f.submit()).outcome.status, 'unknown');
    await assert.rejects(() => f.submit('fresh')); assert.equal(f.puts().length, 1);
  }
});
test('MF23 explicit announcement PUT refusal stays failed and ambiguous PUT stays unknown without replay or cleanup', async () => {
  const denied = fixture(false, { refusal: 403 }); assert.equal((await denied.submit()).outcome.status, 'failed');
  const uncertain = fixture(false, { unknown: true }); assert.equal((await uncertain.submit()).outcome.status, 'unknown');
  await assert.rejects(() => uncertain.submit('fresh')); assert.equal(uncertain.puts().length, 1);
});
test('MF23 announcement uncertainty blocks rename/describe/lock/description preparation before another read', async () => {
  const f = fixture(false, { unknown: true }); await f.submit(); const count = f.calls.length;
  await assert.rejects(f.owner.rename('rename', 'group', title, 'Other title', () => true));
  await assert.rejects(f.owner.describe('describe', 'group', title, 'Existing description', 'New description', () => true));
  await assert.rejects(f.owner.setLocked('lock', 'group', title, true, false, () => true));
  await assert.rejects(f.owner.readDescription('group', () => true));
  assert.equal(f.calls.length, count);
});
for (const action of ['rename', 'describe', 'lock'] as const) test(`MF23 unknown ${action} prevents announcement mode from bypassing metadata uncertainty`, async () => {
  const f = fixture(false, { unknown: true }); f.api();
  if (action === 'rename') await f.owner.rename('prior', 'group', title, 'Other title', () => true);
  else if (action === 'describe') await f.owner.describe('prior', 'group', title, 'Existing description', 'New description', () => true);
  else await f.owner.setLocked('prior', 'group', title, true, false, () => true);
  const count = f.calls.length; await assert.rejects(() => f.submit()); assert.equal(f.calls.length, count);
});
test('MF23 announcement shares saturated ledger identity and exact replay without evicting or republishing writes', async () => {
  const f = fixture();
  for (let i = 0; i < 256; i++) assert.equal((await f.submit('entry-' + i)).outcome.status, 'changed');
  const count = f.calls.length; await f.submit('entry-0');
  await assert.rejects(() => f.submit('overflow')); await assert.rejects(() => f.submit('entry-0', title, true, false));
  await assert.rejects(f.owner.setLocked('entry-0', 'group', title, true, false, () => true)); assert.equal(f.calls.length, count);
});
test('MF23 announcement recovery binds exact original evidence and cannot clear newer uncertainty or rewrite retained unknowns', async () => {
  const f = fixture(false, { unknown: true }); await f.submit('older');
  assert.throws(() => f.owner.resolve('announcement:group'));
  assert.throws(() => f.owner.resolve('announcement:other', 'older'));
  assert.throws(() => f.owner.resolve('announcement:group', 'forged'));
  f.owner.resolve('announcement:group', 'older'); await f.submit('newer');
  assert.throws(() => f.owner.resolve('announcement:group', 'older'));
  assert.equal((await f.submit('older')).outcome.status, 'unknown');
  await assert.rejects(() => f.submit('blocked')); assert.equal(f.puts().length, 2);
});
test('MF23 announcement selection/grant loss after fresh moderator proof cannot admit a PUT', async () => {
  const required = fixture(); required.api();
  for (const grant of [false, true]) {
    const f = fixture(), original = f.rest.call; let valid = true;
    f.rest.call = async (...args) => {
      const result = await original(...args);
      if (args[0].startsWith('/v1/memberships')) { if (grant) f.access.scopes = []; else valid = false; }
      return result;
    };
    assert.equal((await f.submit('loss', title, false, true, () => valid)).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 post-PUT announcement grant loss stays unknown without assuming posting rights or suppression', async () => {
  const f = fixture(); f.api(); const original = f.rest.call;
  f.rest.call = async (...args) => { const result = await original(...args); if (args[1] === 'PUT') f.access.scopes = []; return result; };
  assert.equal((await f.submit()).outcome.status, 'unknown'); assert.equal(f.puts().length, 1);
});
test('MF23 announcement logical deadline holds physical PUT admission and refuses resolution across reset until settlement', async t => {
  const f = fixture(); f.api(); const gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.submit('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown'); assert.equal(f.owner.busy(), true);
    assert.throws(() => f.owner.resolve('announcement:group', 'physical'));
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { ...f.room, isAnnouncementOnly: true } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false);
});
test('MF23 announcement preflight deadline refuses before PUT and retains stubborn GET admission after reset', async t => {
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
test('MF23 actual demo announcement on/off remains separate from main flags/title/roles/history/unread/delivery/notifications', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  try {
    await engine.start('demo');
    const created = await engine.createSpace('creator-owned', 'Already moderated announcement contract');
    await engine.select(created.roomId!);
    await engine.setSpaceLocked('prepare-lock', created.roomId!, engine.snapshot().room!.title, false, true);
    const before = engine.snapshot();
    const enabled = await engine.setSpaceAnnouncementOnly('on', created.roomId!, before.room!.title, false, true);
    assert.equal(enabled.status, 'changed'); assert.equal(enabled.announcementOnly, true); assert.deepEqual(engine.snapshot(), before);
    const disabled = await engine.setSpaceAnnouncementOnly('off', created.roomId!, before.room!.title, true, false);
    assert.equal(disabled.status, 'changed'); assert.equal(disabled.announcementOnly, false);
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(deliveries, []);
  } finally { engine.stop(); }
});
