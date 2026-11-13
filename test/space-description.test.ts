/** MF23 description contract-first assertions, now exercised offline through the existing owners. */
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

const title = 'Existing standalone', oldDescription = 'Existing description\n  Exact preimage';
const description = 'Updated résumé 😀\n  Literal | :let g:unsafe=1';
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options: {
  room?: Record<string, unknown>; membership?: Record<string, unknown>; duplicate?: boolean; more?: boolean;
  ack?: (value: Record<string, unknown>) => unknown; refusal?: number; unknown?: boolean;
} = {}) {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  const room = { id: 'group', type: 'group', title, description: oldDescription, isLocked: false, ...options.room };
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
      const raw = { ...room, ...(body as object) };
      return { value: options.ack ? options.ack(raw) : raw };
    }
    assert.fail('Unaccounted operation: ' + method + ' ' + path);
  }) };
  mocks.track(rest);
  const owner = new ConversationActions(rest, new RoomMembers(), () => access, (signal, token) => authenticatedSelf(rest, signal, token));
  const api = (method: 'readDescription' | 'describe') => {
    assert.equal(typeof owner[method], 'function', 'MF23 description must extend the existing conversation owner');
    return owner;
  };
  return { owner, rest, room, access, calls, api,
    read: () => api('readDescription').readDescription('group', () => true),
    submit: (request = 'describe', expectedTitle = title, expectedDescription = oldDescription, text = description, valid = () => true) =>
      api('describe').describe(request, 'group', expectedTitle, expectedDescription, text, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF23 description preparation RPC is selected-room-only, with no generic fields or mutation consent', () => {
  const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.descriptionPrepare', params });
  assert.deepEqual(parse({ roomId: 'group' }), { method: 'rooms.descriptionPrepare', params: { roomId: 'group' } });
  for (const patch of [{ roomId: '' }, { actorId: 'forged' }, { description }, { confirmed: true }, { url: 'https://evil.invalid' }]) {
    assert.throws(() => parse({ roomId: 'group', ...patch }));
  }
});
test('MF23 describe RPC captures both preimages and nonblank text, not a description-only or arbitrary settings body', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: title, expectedDescription: oldDescription, description, confirmed: true };
  const parse = (value: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.describe', params: value });
  assert.deepEqual(parse(params), { method: 'rooms.describe', params });
  for (const patch of [{ confirmed: false }, { expectedDescription: null }, { expectedTitle: '' }, { description: oldDescription },
    { description: '' }, { description: ' ' }, { description: '\n  \n' }, { description: 'x'.repeat(1001) }, { description: '\ud800' },
    { title: 'A new title is not input' }, { isPublic: false }, { teamId: 'team' }, { actorId: 'forged' }, { format: 'markdown' },
    { body: { description } }, { url: 'https://evil.invalid' }]) assert.throws(() => parse({ ...params, ...patch }));
});
test('MF23 describe resolution requires exact original unknown room/request evidence without broadening rename recovery', () => {
  const params = { action: 'describe', roomId: 'group', requestId: 'original', checked: true };
  const parse = (value: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'conversations.resolve', params: value });
  assert.deepEqual(parse(params), { method: 'conversations.resolve', params });
  const { requestId: _id, ...missing } = params;
  assert.throws(() => parse(missing));
  assert.throws(() => parse({ ...params, checked: false }));
  assert.equal(parse({ ...params, action: 'rename' }).method, 'conversations.resolve');
  assert.throws(() => parse({ ...params, action: 'leave' }), 'legacy leave cannot borrow a description request ID');
});
test('MF23 description read preparation proves self/room/membership with three GETs and returns only bounded raw preimages', async () => {
  const f = fixture(), snapshot = await f.read();
  assert.deepEqual(snapshot, { roomId: 'group', expectedTitle: title, expectedDescription: oldDescription });
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/rooms/group'], ['GET', '/v1/memberships?roomId=group&personId=self&max=100'],
  ]);
  assert.equal(f.puts().length, 0);
});
test('MF23 replacement uses one exact title-echo/description PUT after fresh proof and retains bounded intent', async () => {
  const f = fixture(), result = await f.submit();
  assert.equal(result.outcome.status, 'changed');
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET', 'GET', 'PUT']);
  assert.deepEqual(f.puts()[0]!.body, { title, description });
  assert.equal(result.outcome.expectedTitle, title); assert.equal(result.outcome.expectedDescription, oldDescription);
  assert.equal(result.outcome.description, description); assert.equal(result.outcome.action, 'describe');
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
});
test('MF23 explicit empty preimage may be replaced, but absent/null/oversized descriptions are never inferred empty', async () => {
  const empty = fixture({ room: { description: '' } });
  assert.equal((await empty.read()).expectedDescription, '');
  assert.equal((await empty.submit('from-empty', title, '')).outcome.status, 'changed');
  for (const value of [undefined, null, 'x'.repeat(1001), 'bad\r\nline', '\u200eunsafe']) {
    const f = fixture({ room: { description: value } }); f.api('readDescription');
    await assert.rejects(f.read());
    assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 locked description update needs fresh space moderator, never creator/Team/cached role labels', async () => {
  const denied = fixture({ room: { isLocked: true, creatorId: 'self' } });
  assert.equal((await denied.submit()).outcome.status, 'failed'); assert.equal(denied.puts().length, 0);
  const allowed = fixture({ room: { isLocked: true }, membership: { isModerator: true } });
  assert.equal((await allowed.submit()).outcome.status, 'changed');
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, nullTeam: { teamId: null },
  readOnly: { isReadOnly: true }, missingLock: { isLocked: undefined }, wrongId: { id: 'foreign' },
})) test(`MF23 ${kind} description target refuses before PUT without a settings fallback`, async () => {
  const f = fixture({ room }); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
for (const [field, value] of [['title', 'Another client renamed'], ['description', 'Another client edited']] as const) {
  test(`MF23 changed ${field} preimage gives description conflict and no title echo PUT`, async () => {
    const f = fixture({ room: { [field]: value } });
    assert.equal((await f.submit()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0);
  });
}
test('MF23 blank/clear/no-op/unsafe/oversized new descriptions refuse without IO or normalization', async () => {
  const f = fixture(); f.api('describe');
  for (const value of ['', ' ', '\n \n', oldDescription, 'x'.repeat(1001), '😀'.repeat(501), 'tab\there', 'cr\rhere',
    '\ud800', 'nul\0here', '\u202eunsafe', '\u2066unsafe']) {
    await assert.rejects(() => f.submit('invalid', title, oldDescription, value));
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.submit('invalid')).outcome.status, 'changed');
});
test('MF23 foreign/duplicate/paged memberships cannot authorize description replacement', async () => {
  const required = fixture(); required.api('describe');
  for (const options of [{ duplicate: true }, { more: true }, { membership: { personId: 'foreign' } }, { membership: { roomId: 'foreign' } }]) {
    const f = fixture(options); assert.equal((await f.submit()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 every missing known grant or expired credential refuses description reads and writes before IO', async () => {
  const required = fixture(); required.api('readDescription'); required.api('describe');
  for (const scope of ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write', 'expired']) {
    const f = fixture();
    if (scope === 'expired') f.access.expiresAt = 0; else f.access.scopes = f.access.scopes.filter(v => v !== scope);
    await assert.rejects(f.read); await assert.rejects(() => f.submit()); assert.equal(f.calls.length, 0);
  }
});
test('MF23 missing/wrong/normalized description or title ACK is unknown and blocks new request identities', async () => {
  for (const patch of [{ id: 'foreign' }, { type: 'direct' }, { title: 'Unexpected rename' },
    { description: undefined }, { description: description.trim() + ' ' }, { errors: [] }]) {
    const f = fixture({ ack: raw => ({ ...raw, ...patch }) });
    assert.equal((await f.submit()).outcome.status, 'unknown');
    await assert.rejects(() => f.submit('new-id', title, oldDescription, 'Another update'));
    assert.equal(f.puts().length, 1);
  }
});
test('MF23 typed description PUT refusal stays failed; ambiguous PUT stays unknown with no retry', async () => {
  const refused = fixture({ refusal: 403 }); assert.equal((await refused.submit()).outcome.status, 'failed');
  const unknown = fixture({ unknown: true }); assert.equal((await unknown.submit()).outcome.status, 'unknown');
  await assert.rejects(() => unknown.submit('new')); assert.equal(unknown.puts().length, 1);
});
test('MF23 description evidence shares the conversation ledger and exact replay performs no second GET/PUT', async () => {
  const f = fixture(); await f.submit('shared'); const count = f.calls.length;
  await f.submit('shared'); assert.equal(f.calls.length, count);
  await assert.rejects(() => f.submit('shared', title, oldDescription, 'Different intent'));
  await assert.rejects(f.owner.rename('shared', 'group', title, 'Different title', () => true));
  assert.equal(f.puts().length, 1);
});
test('MF23 rename and description uncertainty interlock per room in both directions, never bypassing unknown title echo', async () => {
  const described = fixture({ unknown: true });
  assert.equal((await described.submit('description-unknown')).outcome.status, 'unknown');
  await assert.rejects(described.owner.rename('cannot-rename', 'group', title, 'Other title', () => true));
  assert.equal(described.puts().length, 1);
  const renamed = fixture({ unknown: true }); renamed.api('describe');
  assert.equal((await renamed.owner.rename('rename-unknown', 'group', title, 'Other title', () => true)).outcome.status, 'unknown');
  await assert.rejects(() => renamed.submit('cannot-describe')); assert.equal(renamed.puts().length, 1);
});
test('MF23 description recovery binds original request and cannot clear newer uncertainty or rewrite retained evidence', async () => {
  const f = fixture({ unknown: true });
  assert.equal((await f.submit('older')).outcome.status, 'unknown');
  assert.throws(() => f.owner.resolve('describe:group', 'foreign'));
  f.owner.resolve('describe:group', 'older');
  assert.equal((await f.submit('newer')).outcome.status, 'unknown');
  assert.throws(() => f.owner.resolve('describe:group', 'older'));
  await assert.rejects(() => f.submit('blocked')); assert.equal(f.puts().length, 2);
});
test('MF23 description selection loss after fresh proof prevents the PUT', async () => {
  const f = fixture(); f.api('describe'); const original = f.rest.call;
  let valid = true;
  f.rest.call = async (...args) => { const result = await original(...args); if (args[0].startsWith('/v1/memberships')) valid = false; return result; };
  assert.equal((await f.submit('changed', title, oldDescription, description, () => valid)).outcome.status, 'failed');
  assert.equal(f.puts().length, 0);
});
test('MF23 description total deadline is unknown after PUT and holds physical admission across reset until settlement', async t => {
  const f = fixture(); f.api('describe'); const original = f.rest.call, gate = deferred<any>(), started = deferred<void>();
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.submit('deadline'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown');
    assert.throws(() => f.owner.resolve('describe:group', 'deadline'));
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { id: 'group', type: 'group', title, description } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false);
});
test('MF23 actual demo description preparation/result stay separate from main room/title/history/activity and delivery', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general'); const before = engine.snapshot();
    const snapshot = await engine.prepareSpaceDescription('demo-general');
    assert.equal(snapshot.sessionId, before.localContext!.sessionId);
    assert.equal(snapshot.expectedTitle, before.room!.title); assert.equal(typeof snapshot.expectedDescription, 'string');
    const outcome = await engine.describeSpace('demo', 'demo-general', snapshot.expectedTitle, snapshot.expectedDescription, description);
    assert.equal(outcome.status, 'changed'); assert.equal(outcome.description, description);
    const after = engine.snapshot();
    assert.deepEqual(after.room, before.room); assert.deepEqual(after.rooms, before.rooms);
    assert.deepEqual(after.messages, before.messages); assert.deepEqual(deliveries, []);
  } finally { engine.stop(); }
});
test('MF23 unknown description also blocks read/edit preparation without spending another GET', async () => {
  const f = fixture({ unknown: true }); await f.submit();
  const count = f.calls.length; await assert.rejects(f.read); assert.equal(f.calls.length, count);
});
test('MF23 saturated shared description ledger keeps exact replay and never evicts write evidence to admit a new title echo', async () => {
  const f = fixture();
  for (let i = 0; i < 256; i++) assert.equal((await f.submit('entry-' + i)).outcome.status, 'changed');
  const count = f.calls.length;
  await assert.rejects(() => f.submit('overflow')); await f.submit('entry-0');
  assert.equal(f.calls.length, count); assert.equal(f.puts().length, 256);
});
test('MF23 description read deadline refuses logically while retaining stubborn physical GET across reset', async t => {
  const f = fixture(), gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.read(); await started.promise; t.mock.timers.tick(20000);
    await assert.rejects(pending); assert.equal(f.owner.busy(), true);
    f.owner.reset(); await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false); assert.equal(f.puts().length, 0);
});
