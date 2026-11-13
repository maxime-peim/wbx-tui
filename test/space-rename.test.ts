/** MF23 contract-first assertions, now exercised by the existing owners offline. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers, authenticatedSelf } from '../src/room-members.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import net from 'node:net';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());

const oldTitle = 'Existing standalone group', newTitle = 'Planning résumé 😀 | literal';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options: {
  room?: Record<string, unknown>; membership?: Record<string, unknown>; more?: boolean;
  ack?: (raw: Record<string, unknown>) => unknown; refusal?: number; unknown?: boolean;
} = {}) {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  const room = { id: 'group', type: 'group', title: oldTitle, isLocked: false, ...options.room };
  const access = { token: 'INERT', scopes: ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write'], expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, async call(path, method, _token, signal, body) {
    assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path === '/v1/rooms' && method === 'POST') return { value: { id: 'created', type: 'group', title: (body as { title: string }).title } };
    if (path === '/v1/rooms/group' && method === 'GET') return { value: { ...room } };
    if (path === '/v1/memberships?roomId=group&personId=self&max=100') return {
      value: { items: [{ id: 'own', roomId: 'group', personId: 'self', isModerator: false, ...options.membership }] },
      ...(options.more ? { link: '<https://webexapis.com/v1/memberships?roomId=group&before=next>; rel="next"' } : {}),
    };
    if (path === '/v1/rooms/group' && method === 'PUT') {
      if (options.refusal) throw new PublicProblem('failed', options.refusal);
      if (options.unknown) throw new PublicProblem('unknown');
      const raw = { ...room, title: (body as any).title };
      return { value: options.ack ? options.ack(raw) : raw };
    }
    assert.fail('Unaccounted boundary: ' + method + ' ' + path);
  } };
  mocks.track(rest);
  const owner = new ConversationActions(rest, new RoomMembers(), () => access, (signal, token) => authenticatedSelf(rest, signal, token));
  const send = async (requestId = 'rename', expected = oldTitle, title = newTitle, valid = () => true) => {
    return owner.rename(requestId, 'group', expected, title, valid);
  };
  return { owner, rest, calls, access, room, send, puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF23 finite rename RPC accepts exact old/new titles and consent, never a generic room-settings tunnel', () => {
  const params = { requestId: 'one', roomId: 'group', expectedTitle: oldTitle, title: newTitle, confirmed: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'rooms.rename', params: p });
  assert.deepEqual(parse(params), { method: 'rooms.rename', params });
  for (const patch of [{ title: '' }, { title: ' same ' }, { title: 'x'.repeat(81) }, { title: '\ud800' },
    { expectedTitle: '' }, { title: oldTitle }, { confirmed: false }, { actorId: 'forged' }, { teamId: 'team' },
    { isLocked: false }, { description: 'Not rename' }, { body: { title: newTitle } }, { url: 'https://evil.invalid' }]) {
    assert.throws(() => parse({ ...params, ...patch }));
  }
});
test('MF23 recovery RPC carries the exact original unknown rename request without changing legacy resolution', () => {
  const params = { action: 'rename', roomId: 'group', requestId: 'unknown-rename', checked: true };
  const parse = (p: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'conversations.resolve', params: p });
  assert.deepEqual(parse(params), { method: 'conversations.resolve', params });
  const { requestId: _request, ...missing } = params;
  assert.throws(() => parse(missing));
  assert.throws(() => parse({ ...params, checked: false }));
  assert.throws(() => parse({ ...params, actorId: 'forged' }));
  assert.equal(parse({ action: 'leave', roomId: 'group', checked: true }).method, 'conversations.resolve');
});
test('MF23 unlocked standalone rename freshly proves self/room/membership then sends exactly one title-only PUT', async () => {
  const f = fixture(), result = await f.send();
  assert.equal(result.outcome.status, 'changed'); assert.equal(result.outcome.action, 'rename');
  assert.equal(result.outcome.roomId, 'group'); assert.equal(result.outcome.expectedTitle, oldTitle); assert.equal(result.outcome.title, newTitle);
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/rooms/group'],
    ['GET', '/v1/memberships?roomId=group&personId=self&max=100'], ['PUT', '/v1/rooms/group'],
  ]);
  assert.deepEqual(f.puts()[0]!.body, { title: newTitle });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
});
test('MF23 locked rename requires current space moderator proof, not creator or cached labels', async () => {
  const denied = fixture({ room: { isLocked: true, creatorId: 'self' } });
  assert.equal((await denied.send()).outcome.status, 'failed'); assert.equal(denied.puts().length, 0);
  const allowed = fixture({ room: { isLocked: true }, membership: { isModerator: true } });
  assert.equal((await allowed.send()).outcome.status, 'changed'); assert.equal(allowed.puts().length, 1);
});
for (const [kind, room] of Object.entries({
  direct: { type: 'direct' }, team: { teamId: 'team' }, 'null-team': { teamId: null }, 'empty-team': { teamId: '' },
  readonly: { isReadOnly: true }, 'missing-lock': { isLocked: undefined }, 'malformed-lock': { isLocked: 'false' }, 'wrong-id': { id: 'other' },
})) test(`MF23 ${kind} preflight refuses with zero PUTs and no generalized settings update`, async () => {
  const f = fixture({ room }); assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
});
test('MF23 detected old-title mismatch is conflict with zero PUTs, not an asserted atomic rename', async () => {
  const f = fixture({ room: { title: 'Already renamed elsewhere' } });
  assert.equal((await f.send()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0);
});
test('MF23 malformed/foreign/paged own membership never grants rename authority', async () => {
  for (const options of [{ membership: { personId: 'foreign' } }, { membership: { roomId: 'other' } },
    { membership: { id: '' } }, { more: true }]) {
    const f = fixture(options);
    assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF23 malformed raw rename ACK remains unknown and blocks new title/request IDs', async () => {
  for (const patch of [{ id: 'other' }, { type: 'direct' }, { title: newTitle + ' ' }, { title: undefined }, { errors: [] }]) {
    const f = fixture({ ack: raw => ({ ...raw, ...patch }) });
    assert.equal((await f.send()).outcome.status, 'unknown'); assert.equal(f.puts().length, 1);
    await assert.rejects(f.send('new-id', oldTitle, 'Another name')); assert.equal(f.puts().length, 1);
  }
});
test('MF23 rename identity shares retained conversation write evidence and never replays an exact request', async () => {
  const f = fixture(); assert.equal((await f.send('used')).outcome.status, 'changed');
  await f.send('used'); assert.equal(f.puts().length, 1);
  await assert.rejects(f.send('used', oldTitle, 'Changed intent')); assert.equal(f.puts().length, 1);
  await assert.rejects(f.owner.create('used', 'Same ledger', () => true));
});
test('MF23 typed PUT refusal is failed while ambiguous PUT outcome is unknown; neither auto-retries', async () => {
  const refused = fixture({ refusal: 403 });
  assert.equal((await refused.send()).outcome.status, 'failed'); assert.equal(refused.puts().length, 1);
  const ambiguous = fixture({ unknown: true });
  assert.equal((await ambiguous.send()).outcome.status, 'unknown');
  await assert.rejects(ambiguous.send('fresh')); assert.equal(ambiguous.puts().length, 1);
});
test('MF23 missing known grants or preflight selection loss produces no PUT', async () => {
  const f = fixture(); f.access.scopes = ['spark:rooms_write'];
  await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
  const selected = fixture(), original = selected.rest.call;
  let valid = true;
  selected.rest.call = async (...args) => { const value = await original(...args); if (args[0] === '/v1/rooms/group') valid = false; return value; };
  assert.equal((await selected.send('changed', oldTitle, newTitle, () => valid)).outcome.status, 'failed'); assert.equal(selected.puts().length, 0);
});
test('MF23 20-second logical deadline holds stubborn admitted work until native settlement without late success', async t => {
  const f = fixture(), gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send(); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown');
    await assert.rejects(f.owner.prepareDirect('peer', () => true));
  } finally { gate.resolve({ value: { id: 'group', type: 'group', title: newTitle } }); t.mock.timers.reset(); }
});
test('MF23 unknown resolution binds original ledger request and cannot resolve a newer uncertain rename', async () => {
  const f = fixture({ unknown: true }); assert.equal((await f.send('older')).outcome.status, 'unknown');
  f.owner.resolve('rename:group', 'older');
  assert.equal((await f.send('newer')).outcome.status, 'unknown');
  assert.throws(() => f.owner.resolve('rename:group', 'older'));
  await assert.rejects(f.send('must-stay-blocked')); assert.equal(f.puts().length, 2);
});
test('MF23 actual demo engine changes only selected room title, never messages/activity/unread/receipts', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const before = engine.snapshot();
    const result = await engine.renameSpace('demo-rename', 'demo-general', before.room!.title, newTitle);
    assert.equal(result.status, 'changed');
    const after = engine.snapshot();
    assert.equal(after.room!.id, before.room!.id); assert.equal(after.room!.title, newTitle);
    assert.deepEqual(after.messages, before.messages); assert.equal(after.room!.lastActivity, before.room!.lastActivity);
    assert.deepEqual(deliveries, []);
    assert.deepEqual(after.rooms.map(room => room.id), before.rooms.map(room => room.id));
  } finally { engine.stop(); }
});
test('MF23 shared 256-request saturation refuses before reads, retains replay and never evicts unknown evidence', async () => {
  const f = fixture({ unknown: true });
  assert.equal((await f.send('unknown')).outcome.status, 'unknown');
  for (let i = 1; i < 256; i++) await f.owner.create('create-' + i, 'Separate action', () => true);
  const reads = f.calls.length;
  f.owner.resolve('rename:group', 'unknown');
  await assert.rejects(f.send('over-limit'));
  assert.equal((await f.send('unknown')).outcome.status, 'unknown');
  assert.equal(f.calls.length, reads);
  assert.equal(f.puts().length, 1);
});
test('MF23 invalid/no-op title, request and room identities never reserve or read', async () => {
  const f = fixture();
  for (const title of [oldTitle, '', ' x', 'x ', 'x\n', 'x  x', '\ud800', '\u200eunsafe', '😀'.repeat(81), '\u00a0not canonical']) {
    await assert.rejects(f.send('invalid', oldTitle, title));
  }
  await assert.rejects(f.owner.rename('bad!', 'group', oldTitle, newTitle, () => true));
  await assert.rejects(f.owner.rename('invalid', 'bad..room', oldTitle, newTitle, () => true));
  assert.equal(f.calls.length, 0);
  assert.equal((await f.send('invalid')).outcome.status, 'changed', 'invalid inputs cannot poison a request ID');
});
test('MF23 every missing known grant and expired credential refuses before the first GET; spark:all stays compatible', async () => {
  for (const scope of ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write']) {
    const f = fixture(); f.access.scopes = f.access.scopes.filter(value => value !== scope);
    await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
  }
  const expired = fixture(); expired.access.expiresAt = 0;
  await assert.rejects(expired.send()); assert.equal(expired.calls.length, 0);
  const all = fixture(); all.access.scopes = ['spark:all'];
  assert.equal((await all.send()).outcome.status, 'changed');
});
test('MF23 preflight total deadline holds stubborn GET after logical refusal and cannot later submit', async t => {
  const f = fixture(), gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send(); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'failed');
    assert.equal(f.owner.busy(), true);
    f.owner.reset();
    await assert.rejects(f.owner.prepareDirect('peer', () => true));
    assert.equal(f.puts().length, 0);
  } finally { gate.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.owner.busy(), false);
  assert.equal(f.puts().length, 0);
});
test('MF23 unknown cannot resolve without matching original room/request or while physical PUT is unsettled', async t => {
  const f = fixture(), gate = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown');
    assert.throws(() => f.owner.resolve('rename:group', 'physical'));
  } finally { gate.resolve({ value: { id: 'group', type: 'group', title: newTitle } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.throws(() => f.owner.resolve('rename:group'));
  assert.throws(() => f.owner.resolve('rename:other', 'physical'));
  assert.throws(() => f.owner.resolve('rename:group', 'forged'));
  f.owner.resolve('rename:group', 'physical');
  assert.equal((await f.send('physical')).outcome.status, 'unknown', 'resolution never rewrites retained write evidence');
});
test('MF23 old creation-result replay cannot restore the pre-rename title or reinsert stale space metadata', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine();
  try {
    await engine.start('demo');
    const created = await engine.createSpace('original-create', oldTitle);
    await engine.select(created.roomId!);
    assert.equal((await engine.renameSpace('renamed', created.roomId!, oldTitle, newTitle)).status, 'changed');
    const before = engine.snapshot();
    const replayed = await engine.createSpace('original-create', oldTitle);
    assert.equal(replayed.roomId, created.roomId);
    assert.deepEqual(engine.snapshot().room, before.room);
    assert.deepEqual(engine.snapshot().rooms, before.rooms);
  } finally { engine.stop(); }
});
