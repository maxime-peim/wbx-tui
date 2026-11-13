/** MF22 contract-first assertions, exercised offline: NOT product Hide/mute/Favorites sync. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { RoomMembers } from '../src/room-members.js';
import { PublicProblem, type ActionREST } from '../src/public-rest.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options: {
  own?: Record<string, unknown>; room?: Record<string, unknown>; self?: unknown;
  items?: unknown[]; link?: string; failure?: number;
} = {}) {
  const owner = new RoomMembers(), calls: { path: string; method: string; body: unknown }[] = [], abort = new AbortController();
  const own: Record<string, unknown> = { id: 'own', roomId: 'direct', personId: 'self', roomType: 'direct',
    isRoomHidden: true, isModerator: false, personEmail: 'private@example.invalid', personDisplayName: ':let g:unsafe=1', ...options.own };
  let valid = true;
  const token = () => { if (!valid || abort.signal.aborted) throw new PublicProblem('failed'); return 'INERT'; };
  const rest: ActionREST = { busy: () => false, async call(path, method, access, signal, body) {
    assert.equal(signal.aborted, false); assert.equal(access, 'INERT');
    assert.equal(method, 'GET'); assert.equal(body, undefined); calls.push({ path, method, body });
    if (options.failure) throw new PublicProblem('failed', options.failure);
    if (path === '/v1/people/me') return { value: options.self ?? { id: 'self' } };
    if (path === '/v1/rooms/direct') return { value: { id: 'direct', type: 'direct', title: 'Not projected', ...options.room } };
    assert.equal(path, '/v1/memberships?roomId=direct&personId=self&max=100');
    return { value: { items: options.items ?? [own] }, ...(options.link ? { link: options.link } : {}) };
  } };
  mocks.track(rest);
  const api = () => {
    assert.equal(typeof owner.readOwnDirectVisibility, 'function',
      'MF22 read must extend RoomMembers, not default roster visibility or a preference writer');
    return owner;
  };
  return { owner, api, own, rest, calls, abort, revoke: () => { valid = false; },
    read: () => api().readOwnDirectVisibility(rest, 'direct', token, abort.signal), token };
}
const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'members.visibility', params });
test('MF22 finite visibility RPC accepts only the exact selected room, with no caller actor/member/preferences', () => {
  assert.deepEqual(parse({ roomId: 'direct' }), { method: 'members.visibility', params: { roomId: 'direct' } });
});
test('MF22 visibility RPC cannot authorize write/paging/favorite/mute/hidden fields or an arbitrary self override', () => {
  assert.equal(parse({ roomId: 'direct' }).method, 'members.visibility');
  for (const patch of [{ roomId: '' }, { personId: 'other' }, { membershipId: 'other' }, { isRoomHidden: false },
    { isModerator: false }, { favorite: true }, { mute: true }, { confirmed: true }, { more: true },
    { revision: 1 }, { body: { isRoomHidden: true } }, { url: 'https://evil.invalid' }]) {
    assert.throws(() => parse({ roomId: 'direct', ...patch }));
  }
});
for (const isRoomHidden of [true, false]) test(`MF22 raw own-direct hidden=${isRoomHidden} is an isolated three-GET observation, not local filtering or notification policy`, async () => {
  const f = fixture({ own: { isRoomHidden } }), before = f.owner.snapshot(), value = await f.read();
  assert.deepEqual(value, { roomId: 'direct', isRoomHidden });
  assert.deepEqual(f.calls.map(c => c.path), ['/v1/people/me', '/v1/rooms/direct', '/v1/memberships?roomId=direct&personId=self&max=100']);
  assert.deepEqual(f.owner.snapshot(), before, 'fresh private own-member proof never fills/replaces the roster');
  assert.doesNotMatch(JSON.stringify(value), /INERT|private@|isModerator|own|self|unsafe/);
});
test('MF22 omitted hidden flag is not provided/null, never false/visible or an invitation to write a default', async () => {
  const f = fixture(); delete f.own.isRoomHidden;
  assert.deepEqual(await f.read(), { roomId: 'direct', isRoomHidden: null }); assert.equal(f.calls.length, 3);
});
test('MF22 raw null/string/number/object hidden values refuse instead of becoming a provided boolean', async () => {
  const required = fixture(); required.api();
  for (const isRoomHidden of [null, 'false', 0, [], {}]) {
    const f = fixture({ own: { isRoomHidden } }); await assert.rejects(f.read()); assert.equal(f.calls.length, 3);
  }
});
test('MF22 group/Team/foreign/error Room proof refuses even if loaded labels or own hidden flags suggest support', async () => {
  const required = fixture(); required.api();
  for (const room of [{ type: 'group' }, { type: null }, { id: 'foreign' }, { teamId: null }, { errors: [] }]) {
    const f = fixture({ room }); await assert.rejects(f.read()); assert.equal(f.calls.length, 2);
  }
});
test('MF22 authenticated self proof cannot come from labels, a roster row, errors or a configured account', async () => {
  const required = fixture(); required.api();
  for (const self of [{}, { id: '' }, { id: 'self', errors: [] }, [], 'self']) {
    const f = fixture({ self }); await assert.rejects(f.read()); assert.equal(f.calls.length, 1);
  }
});
test('MF22 own-membership identity must be exact and unique; missing/foreign/duplicate rows never supply a flag', async () => {
  const required = fixture(); required.api();
  for (const items of [[], [{ id: 'own', roomId: 'direct', personId: 'other', isRoomHidden: true }],
    [{ id: 'own', roomId: 'foreign', personId: 'self', isRoomHidden: true }],
    [{ roomId: 'direct', personId: 'self', isRoomHidden: true }],
    [{ ...required.own, roomType: 'group' }], [{ ...required.own, errors: [] }], [required.own, required.own]]) {
    const f = fixture({ items }); await assert.rejects(f.read()); assert.equal(f.calls.length, 3);
  }
});
test('MF22 optional membership roomType may be absent only after fresh exact direct Room proof', async () => {
  const f = fixture(); delete f.own.roomType;
  assert.deepEqual(await f.read(), { roomId: 'direct', isRoomHidden: true });
});
test('MF22 visibility rejects every paging link instead of scanning people or counting a partial own-membership response', async () => {
  const required = fixture(); required.api();
  for (const link of ['<https://webexapis.com/v1/memberships?cursor=next>; rel="next"',
    '<https://evil.invalid/read>; rel="next"', '<https://webexapis.com/v1/memberships>; rel="prev"', 'malformed']) {
    const f = fixture({ link }); await assert.rejects(f.read()); assert.equal(f.calls.length, 3);
  }
});
test('MF22 invalid room/aborted/physically busy visibility reads dispatch no requests', async () => {
  const f = fixture(); f.api();
  await assert.rejects(f.api().readOwnDirectVisibility(f.rest, '', f.token, f.abort.signal));
  f.abort.abort(); await assert.rejects(f.read()); assert.equal(f.calls.length, 0);
  const busy = fixture(); busy.rest.busy = () => true;
  await assert.rejects(busy.read()); assert.equal(busy.calls.length, 0);
});
test('MF22 token/context rechecks after every GET prevent old own-flag publication with no fallback read', async () => {
  const required = fixture(); required.api();
  for (const step of [1, 2, 3]) {
    const f = fixture(), original = f.rest.call;
    f.rest.call = async (...args) => { const value = await original(...args); if (f.calls.length === step) f.revoke(); return value; };
    await assert.rejects(f.read()); assert.equal(f.calls.length, step);
  }
});
test('MF22 cancellation during an own-membership read cannot publish or trigger a retry', async () => {
  const f = fixture(); f.api(); const original = f.rest.call, held = deferred<any>(), started = deferred<void>();
  f.rest.call = async (...args) => { const value = await original(...args); if (f.calls.length !== 3) return value; started.resolve(); return held.promise; };
  const pending = f.read(); await started.promise; f.abort.abort(); held.resolve({ value: { items: [f.own] } });
  await assert.rejects(pending); assert.equal(f.calls.length, 3); assert.equal(f.owner.snapshot().state, 'empty');
});
test('MF22 role/favorite/mute/labels are not visibility authority or projected personal fields', async () => {
  const f = fixture({ own: { isModerator: true, favorite: true, muted: true, notificationMode: 'off', token: 'PRIVATE' } });
  assert.deepEqual(await f.read(), { roomId: 'direct', isRoomHidden: true });
  const missing = fixture({ own: { favorite: true, muted: true } }); delete missing.own.isRoomHidden;
  assert.deepEqual(await missing.read(), { roomId: 'direct', isRoomHidden: null });
});
test('MF22 explicit reread gets a new own flag and cannot reuse a prior hidden observation as current policy', async () => {
  const f = fixture(); assert.equal((await f.read()).isRoomHidden, true);
  f.own.isRoomHidden = false; assert.equal((await f.read()).isRoomHidden, false); assert.equal(f.calls.length, 6);
});
test('MF22 visibility service refusal does not mean visible, absent membership or mutation recovery eligibility', async () => {
  const required = fixture(); required.api();
  for (const failure of [401, 403, 404, 429, 500]) {
    const f = fixture({ failure }); await assert.rejects(f.read()); assert.equal(f.calls.length, 1);
  }
});
test('MF22 actual demo engine reports only an own-direct API flag observation without main state or events', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-alex');
    assert.equal(typeof engine.memberVisibility, 'function', 'MF22 belongs in the existing engine read owner');
    const before = engine.snapshot(), events: string[] = [];
    for (const name of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(name, () => events.push(name));
    const value = await engine.memberVisibility('demo-alex');
    assert.deepEqual(Object.keys(value).sort(), ['sessionId', 'coverage', 'roomId', 'observedAt', 'isRoomHidden'].sort());
    assert.equal(value.roomId, 'demo-alex'); assert.equal(value.sessionId, before.localContext!.sessionId);
    assert.equal(value.coverage, 'own-direct-membership-flag'); assert.equal(value.isRoomHidden, null, 'demo absent field stays not provided, not invented false');
    assert.ok(value.observedAt <= Date.now() && value.observedAt > Date.now() - 10000);
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(events, []);
    await engine.select('demo-general');
    await assert.rejects(engine.memberVisibility('demo-general'));
  } finally { engine.stop(); }
});
test('MF22 engine selected-room leave-return fences a held own-visibility result', async t => {
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-alex');
    assert.equal(typeof engine.memberVisibility, 'function');
    const rest: ActionREST = (engine as any).actionREST, original = rest.call.bind(rest), held = deferred<any>(), started = deferred<void>();
    rest.call = async (...args) => { const result = await original(...args); if (!args[0].startsWith('/v1/memberships?')) return result;
      started.resolve(); return held.promise; };
    const pending = engine.memberVisibility('demo-alex');
    await started.promise; await engine.select('demo-general'); await engine.select('demo-alex');
    const before = engine.snapshot(); held.resolve({ value: { items: [{ id: 'own', roomId: 'demo-alex', personId: 'demo-self', isRoomHidden: true }] } });
    await assert.rejects(pending); assert.deepEqual(engine.snapshot(), before);
  } finally { engine.stop(); }
});
test('MF22 engine missing existing known read grants refuses before any transport read or grant expansion', async () => {
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-alex');
    assert.equal(typeof engine.memberVisibility, 'function');
    let calls = 0;
    Object.assign(engine, { mode: 'live', token: 'INERT', grantedScope: 'spark:memberships_read', expiresAt: Date.now() + 600000 });
    (engine as any).actionREST.call = async () => { calls++; assert.fail('Missing people/rooms grants must refuse before reads'); };
    await assert.rejects(engine.memberVisibility('demo-alex')); assert.equal(calls, 0);
  } finally { engine.stop(); }
});
