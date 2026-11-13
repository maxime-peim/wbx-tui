/** MF23 separate description-clear contract-first assertions, exercised offline. */
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

const title = 'Existing résumé 😀 | standalone', previous = 'Exact nonblank description\n  Keep this preimage';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options: {
  room?: Record<string, unknown>; membership?: Record<string, unknown>; duplicate?: boolean; more?: boolean;
  refusal?: number; unknown?: boolean; ack?: (raw: Record<string, unknown>) => unknown;
} = {}) {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  const room = { id: 'group', type: 'group', title, description: previous, isLocked: false,
    isPublic: false, isAnnouncementOnly: false, ...options.room };
  const access = { token: 'INERT', scopes: ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write'],
    expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, call: mocks.wrap(async (path, method, _token, signal, body) => {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path === '/v1/rooms/group' && method === 'GET') return { value: { ...room } };
    if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      const own = { id: 'own', personId: 'self', roomId: 'group', isModerator: false, ...options.membership };
      return { value: { items: options.duplicate ? [own, own] : [own] },
        ...(options.more ? { link: '<https://webexapis.com/v1/memberships?roomId=group&before=next>; rel="next"' } : {}) };
    }
    if (path === '/v1/rooms/group' && method === 'PUT') {
      if (options.refusal) throw new PublicProblem('failed', options.refusal);
      if (options.unknown) throw new PublicProblem('unknown');
      // This explicit empty ACK is synthetic, NOT a documented service guarantee.
      const raw = { ...room, title: (body as any).title, description: '' };
      return { value: options.ack ? options.ack(raw) : raw };
    }
    assert.fail('Unaccounted operation: ' + method + ' ' + path);
  }) };
  mocks.track(rest);
  const owner = new ConversationActions(rest, new RoomMembers(), () => access, (signal, token) => authenticatedSelf(rest, signal, token));
  const api = () => {
    assert.equal(typeof owner.clearDescription, 'function',
      'MF23 clear must extend the existing conversation owner, not blank replacement');
    return owner;
  };
  return { owner, api, rest, room, access, calls,
    submit: (id = 'clear', expectedTitle = title, expectedDescription = previous, valid = () => true) =>
      api().clearDescription(id, 'group', expectedTitle, expectedDescription, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF23 clear RPC is a separate exact-preimage operation; callers never supply the service sentinel', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: title, expectedDescription: previous, confirmed: true };
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.descriptionClear', params }),
    { method: 'rooms.descriptionClear', params });
});
test('MF23 clear RPC rejects empty/whitespace preimages, caller sentinel, new title and settings/actor/body tunnels', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: title, expectedDescription: previous, confirmed: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.descriptionClear', params: p });
  assert.deepEqual(parse(params), { method: 'rooms.descriptionClear', params });
  for (const patch of [{ expectedDescription: '' }, { expectedDescription: ' ' }, { expectedDescription: '\n \n' },
    { expectedDescription: null }, { expectedDescription: 'x'.repeat(1001) }, { expectedTitle: '' }, { confirmed: false },
    { description: ' ' }, { description: '' }, { title: 'New' }, { clear: true }, { isLocked: false }, { isPublic: false },
    { isAnnouncementOnly: false }, { actorId: 'self' }, { body: { description: ' ' } }, { url: 'https://evil.invalid' }]) {
    assert.throws(() => parse({ ...params, ...patch }));
  }
});
test('MF23 description-clear recovery requires exact original unknown request/room without widening legacy recovery', () => {
  const params = { action: 'description-clear', roomId: 'group', requestId: 'original', checked: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'conversations.resolve', params: p });
  assert.deepEqual(parse(params), { method: 'conversations.resolve', params });
  const { requestId: _id, ...missing } = params; assert.throws(() => parse(missing));
  assert.throws(() => parse({ ...params, checked: false }));
  for (const action of ['rename', 'describe', 'lock', 'announcement']) assert.equal(parse({ ...params, action }).method, 'conversations.resolve');
  assert.throws(() => parse({ ...params, action: 'leave' }));
});
test('MF23 clear uses three fresh GETs and one title/single-ASCII-space PUT, only explicit empty ACK confirms', async () => {
  const f = fixture(), result = await f.submit();
  assert.equal(result.outcome.status, 'changed'); assert.equal(result.outcome.action, 'description-clear');
  assert.equal(result.outcome.expectedTitle, title); assert.equal(result.outcome.expectedDescription, previous);
  assert.equal(result.outcome.roomId, 'group'); assert.equal(Object.hasOwn(result.outcome, 'description'), false);
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/rooms/group'],
    ['GET', '/v1/memberships?roomId=group&personId=self&max=100'], ['PUT', '/v1/rooms/group'],
  ]);
  assert.deepEqual(f.puts()[0]!.body, { title, description: ' ' });
  assert.deepEqual(Buffer.from(f.puts()[0]!.body.description), Buffer.from([0x20]));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
});
test('MF23 clear needs strict own membership; locked spaces need moderator, never creator/Team/cache labels', async () => {
  const required = fixture(); required.api();
  for (const isLocked of [false, true]) for (const isModerator of [false, true, undefined, null, 'true']) {
    const f = fixture({ room: { isLocked, creatorId: 'self' }, membership: { isModerator } });
    const allowed = typeof isModerator === 'boolean' && (!isLocked || isModerator);
    assert.equal((await f.submit()).outcome.status, allowed ? 'changed' : 'failed');
    assert.equal(f.puts().length, allowed ? 1 : 0);
  }
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, nullTeam: { teamId: null }, public: { isPublic: true },
  announcement: { isAnnouncementOnly: true }, readonly: { isReadOnly: true }, foreign: { id: 'other' },
})) test(`MF23 ${kind} clear target refuses without private/mode/role conversion fallback`, async () => {
  const f = fixture({ room }); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
test('MF23 clear refuses missing/null/empty/sentinel/unsafe raw descriptions instead of inferring content or no-op', async () => {
  const required = fixture(); required.api();
  for (const description of [undefined, null, '', ' ', '\n \n', 'x'.repeat(1001), 'bad\r\nline', '\u202eunsafe']) {
    const f = fixture({ room: { description } });
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 clear never infers missing/coerced lock/private/announcement flags', async () => {
  const required = fixture(); required.api();
  for (const field of ['isLocked', 'isPublic', 'isAnnouncementOnly']) for (const value of [undefined, null, 'false', 0]) {
    const f = fixture({ room: { [field]: value } }); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
for (const [field, value] of [['title', 'Concurrent rename'], ['description', 'Concurrent replacement']] as const) {
  test(`MF23 changed ${field} gives clear preimage conflict with zero sentinel PUTs`, async () => {
    const f = fixture({ room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0);
  });
}
test('MF23 clear rejects duplicate/foreign/paged memberships without extra reads', async () => {
  const required = fixture(); required.api();
  for (const options of [{ duplicate: true }, { more: true }, { membership: { personId: 'other' } }, { membership: { roomId: 'other' } }]) {
    const f = fixture(options); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
    assert.equal(f.calls.length, 3);
  }
});
test('MF23 invalid clear preimages/title/request IDs reserve nothing; legacy replacement still rejects all blank submissions', async () => {
  const f = fixture(); f.api();
  for (const old of ['', ' ', '\n', 'x'.repeat(1001), 'bad\there', '\ud800']) await assert.rejects(() => f.submit('invalid', title, old));
  await assert.rejects(() => f.submit('bad!')); await assert.rejects(() => f.submit('invalid', ' padded '));
  for (const text of ['', ' ', '\n \n']) await assert.rejects(f.owner.describe('invalid', 'group', title, previous, text, () => true));
  assert.equal(f.calls.length, 0); assert.equal((await f.submit('invalid')).outcome.status, 'changed');
});
test('MF23 each missing known clear grant or expired token refuses before reads; spark all never adds membership writes', async () => {
  const required = fixture(); required.api();
  for (const scope of ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write', 'expired']) {
    const f = fixture(); if (scope === 'expired') f.access.expiresAt = 0; else f.access.scopes = f.access.scopes.filter(v => v !== scope);
    await assert.rejects(() => f.submit()); assert.equal(f.calls.length, 0);
  }
  const all = fixture(); all.access.scopes = ['spark:all']; assert.equal((await all.submit()).outcome.status, 'changed');
});
test('MF23 clear omitted/null/sentinel/whitespace/nonempty ACKs stay unknown; request sentinel is NOT response proof', async () => {
  for (const description of [undefined, null, ' ', '  ', '\n', previous, 'Other']) {
    const f = fixture({ ack: raw => ({ ...raw, description }) });
    assert.equal((await f.submit()).outcome.status, 'unknown'); await assert.rejects(() => f.submit('fresh'));
    assert.equal(f.puts().length, 1);
  }
});
test('MF23 clear wrong ID/type/title/critical flags/errors ACKs stay unknown without cached fallback', async () => {
  for (const patch of [{ id: 'foreign' }, { type: 'direct' }, { title: title + ' ' }, { isLocked: true }, { isLocked: undefined },
    { isPublic: undefined }, { isPublic: true }, { isAnnouncementOnly: true }, { teamId: null }, { isReadOnly: true }, { errors: [] }]) {
    const f = fixture({ ack: raw => ({ ...raw, ...patch }) });
    assert.equal((await f.submit()).outcome.status, 'unknown'); assert.equal(f.puts().length, 1);
  }
});
test('MF23 typed clear refusal stays failed; admitted network ambiguity stays unknown with no empty/sentinel retry', async () => {
  const denied = fixture({ refusal: 403 }); assert.equal((await denied.submit()).outcome.status, 'failed');
  const uncertain = fixture({ unknown: true }); assert.equal((await uncertain.submit()).outcome.status, 'unknown');
  await assert.rejects(() => uncertain.submit('fresh')); assert.equal(uncertain.puts().length, 1);
});
test('MF23 clear uncertainty blocks all four older metadata actions and description preparation', async () => {
  const f = fixture({ unknown: true }); await f.submit(); const count = f.calls.length;
  await assert.rejects(f.owner.rename('rename', 'group', title, 'Other title', () => true));
  await assert.rejects(f.owner.describe('describe', 'group', title, previous, 'New', () => true));
  await assert.rejects(f.owner.setLocked('lock', 'group', title, false, true, () => true));
  await assert.rejects(f.owner.setAnnouncementOnly('announcement', 'group', title, false, true, () => true));
  await assert.rejects(f.owner.readDescription('group', () => true)); assert.equal(f.calls.length, count);
});
test('MF23 clear uncertainty is exact-room scoped and never blocks or clears another room action', async () => {
  const f = fixture({ unknown: true }); await f.submit();
  const original = f.rest.call;
  f.rest.call = async (...args) => {
    const [path, method] = args;
    if (path === '/v1/rooms/other') return { value: { ...f.room, id: 'other', description: method === 'PUT' ? '' : previous } };
    if (path === '/v1/memberships?roomId=other&personId=self&max=100') return {
      value: { items: [{ id: 'other-own', roomId: 'other', personId: 'self', isModerator: false }] },
    };
    return original(...args);
  };
  assert.equal((await f.api().clearDescription('other', 'other', title, previous, () => true)).outcome.status, 'changed');
  await assert.rejects(f.owner.readDescription('group', () => true));
  await assert.rejects(() => f.submit('still-blocked'));
});
for (const action of ['rename', 'describe', 'lock', 'announcement'] as const) test(`MF23 unknown ${action} cannot be bypassed with description clearing`, async () => {
  const f = fixture({ unknown: true, room: { isLocked: true }, membership: { isModerator: true } }); f.api();
  if (action === 'rename') await f.owner.rename('prior', 'group', title, 'Other', () => true);
  else if (action === 'describe') await f.owner.describe('prior', 'group', title, previous, 'Other', () => true);
  else if (action === 'lock') await f.owner.setLocked('prior', 'group', title, true, false, () => true);
  else await f.owner.setAnnouncementOnly('prior', 'group', title, false, true, () => true);
  const count = f.calls.length; await assert.rejects(() => f.submit()); assert.equal(f.calls.length, count);
});
test('MF23 clear shares the 256-action ledger, exact replay and cross-action identity without evicting evidence', async () => {
  const f = fixture(); for (let i = 0; i < 256; i++) assert.equal((await f.submit('entry-' + i)).outcome.status, 'changed');
  const count = f.calls.length; await f.submit('entry-0'); await assert.rejects(() => f.submit('overflow'));
  await assert.rejects(() => f.submit('entry-0', title, 'Changed preimage'));
  await assert.rejects(f.owner.describe('entry-0', 'group', title, previous, 'Other', () => true)); assert.equal(f.calls.length, count);
});
test('MF23 clear recovery binds original unknown evidence, cannot rewrite it or clear a newer request', async () => {
  const f = fixture({ unknown: true }); await f.submit('older');
  assert.throws(() => f.owner.resolve('description-clear:group'));
  assert.throws(() => f.owner.resolve('description-clear:other', 'older'));
  assert.throws(() => f.owner.resolve('description-clear:group', 'forged'));
  f.owner.resolve('description-clear:group', 'older'); await f.submit('newer');
  assert.throws(() => f.owner.resolve('description-clear:group', 'older'));
  assert.equal((await f.submit('older')).outcome.status, 'unknown'); await assert.rejects(() => f.submit('blocked'));
  assert.equal(f.puts().length, 2);
});
test('MF23 clear grant/selection loss after membership prevents sentinel admission; grant loss after PUT is unknown', async () => {
  const required = fixture(); required.api();
  for (const phase of ['grant', 'selection', 'put']) {
    const f = fixture(), original = f.rest.call; let valid = true;
    f.rest.call = async (...args) => {
      const result = await original(...args);
      if (phase === 'put' ? args[1] === 'PUT' : args[0].startsWith('/v1/memberships')) {
        if (phase === 'selection') valid = false; else f.access.scopes = [];
      }
      return result;
    };
    assert.equal((await f.submit('loss', title, previous, () => valid)).outcome.status, phase === 'put' ? 'unknown' : 'failed');
    assert.equal(f.puts().length, phase === 'put' ? 1 : 0);
  }
});
for (const phase of ['GET', 'PUT']) test(`MF23 clear ${phase} deadline retains stubborn physical admission across reset without replay`, async t => {
  const f = fixture(); f.api(); const gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === phase ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.submit('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, phase === 'PUT' ? 'unknown' : 'failed');
    assert.equal(f.owner.busy(), true); assert.throws(() => f.owner.resolve('description-clear:group', 'physical'));
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: phase === 'PUT' ? { ...f.room, description: '' } : { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false);
});
test('MF23 actual demo clear reuses preparation and existing engine without main state/role/history/delivery publication', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general'); const before = engine.snapshot();
    const snapshot = await engine.prepareSpaceDescription('demo-general');
    const result = await engine.clearSpaceDescription('clear', 'demo-general', snapshot.expectedTitle, snapshot.expectedDescription);
    assert.equal(result.status, 'changed'); assert.equal(result.action, 'description-clear');
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(deliveries, []);
    const after = await engine.prepareSpaceDescription('demo-general');
    assert.equal(after.expectedDescription, '', 'synthetic provider may model explicit empty, never sentinel-as-content');
  } finally { engine.stop(); }
});
