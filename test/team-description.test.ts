/** MF24 Team-description contract-first assertions now exercised offline, not service/tenant acceptance. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ConversationActions } from '../src/conversation-actions.js';
import { authenticatedSelf, RoomMembers } from '../src/room-members.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());

const expectedName = 'Exact raw Team', old = 'Prior Team description\nRaw LF second line', replacement = 'Changed résumé 😀\n| let g:not_executed=1';
const scopes = ['spark:people_read', 'spark:teams_read', 'spark:team_memberships_read', 'spark:teams_write'];
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
function fixture(options: { team?: Record<string, unknown>; own?: Record<string, unknown>; items?: unknown[]; link?: string;
  ack?: (v: Record<string, unknown>) => unknown; status?: number } = {}) {
  const calls: { path: string; method: PublicMethod; body?: object }[] = [];
  const team: Record<string, unknown> = { id: 'team', name: expectedName, description: old, ...options.team };
  const own: Record<string, unknown> = { id: 'own', teamId: 'team', personId: 'self', isModerator: true, ...options.own };
  const access = { token: 'INERT', scopes: [...scopes], expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, async call(path, method, token, signal, body) {
    assert.equal(token, 'INERT'); assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') { assert.equal(method, 'GET'); return { value: { id: 'self' } }; }
    if (path === '/v1/team/memberships?teamId=team&max=100') {
      assert.equal(method, 'GET'); assert.equal(body, undefined);
      return { value: { items: options.items ?? [own] }, ...(options.link ? { link: options.link } : {}) };
    }
    if (path === '/v1/rooms' && method === 'POST') return { value: { id: 'created', type: 'group', title: (body as any).title } };
    assert.equal(path, '/v1/teams/team', 'no description query workaround, person filter, fallback, Room endpoint or membership writer');
    if (method === 'GET') return { value: { ...team } };
    assert.equal(method, 'PUT');
    assert.ok(body && Object.keys(body).every(k => ['name', 'description'].includes(k)));
    if (Object.hasOwn(body, 'description')) assert.equal((body as any).name, expectedName);
    else assert.deepEqual(body, { name: 'New name' }, 'only the separately reviewed rename regression omits description');
    if (options.status) throw new PublicProblem([400, 401, 403, 404, 409, 429].includes(options.status) ? 'failed' : 'unknown', options.status);
    const ack = { id: 'team', ...(body as Record<string, unknown>) };
    return { value: options.ack ? options.ack(ack) : ack };
  } };
  mocks.track(rest);
  const members = new RoomMembers(), owner = new ConversationActions(rest, members, () => access,
    (signal, token) => authenticatedSelf(rest, signal, token));
  const api = () => {
    assert.equal(typeof owner.readTeamDescription, 'function', 'MF24 Team description must reuse the existing conversation read owner');
    assert.equal(typeof owner.describeTeam, 'function', 'MF24 Team description must reuse the shared mutation/uncertainty ledger');
    return owner;
  };
  return { api, owner, members, rest, team, own, access, calls,
    read: (valid = () => true) => api().readTeamDescription('team', valid),
    send: (id = 'describe-team', preimage = old, text = replacement, valid = () => true) =>
      api().describeTeam(id, 'team', expectedName, preimage, text, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF24 finite Team-description RPC requires exact joined identity/preimages/confirmation and no replacement name or actor', () => {
  const prep = { teamId: 'team', revision: 1 };
  assert.deepEqual(parse('teams.descriptionPrepare', prep), { method: 'teams.descriptionPrepare', params: prep });
  const params = { ...prep, requestId: 'one', expectedName, expectedDescription: old, description: replacement, confirmed: true };
  assert.deepEqual(parse('teams.describe', params), { method: 'teams.describe', params });
  for (const patch of [{ name: 'not an allowed rename' }, { roomId: 'room' }, { personId: 'self' }, { membershipId: 'own' },
    { isModerator: true }, { body: {} }, { url: '/v1/teams/team' }, { more: true }, { revision: 0 }, { confirmed: false },
    { expectedDescription: undefined }, { description: '' }, { description: ' ' }]) assert.throws(() => parse('teams.describe', { ...params, ...patch }));
});
test('MF24 Team-description recovery RPC is original action/Team/request only, never a generic settings repair', () => {
  const params = { action: 'team-describe', teamId: 'team', requestId: 'original', checked: true };
  assert.deepEqual(parse('conversations.resolve', params), { method: 'conversations.resolve', params });
  for (const patch of [{ roomId: 'team' }, { requestId: undefined }, { teamId: undefined }, { checked: false }, { description: old }]) {
    assert.throws(() => parse('conversations.resolve', { ...params, ...patch }));
  }
});
test('MF24 private Team-description preparation is exact raw name/description plus fresh self/moderator, three GETs and no ledger/roster', async () => {
  const f = fixture(), roster = f.members.snapshot();
  assert.deepEqual(await f.read(), { teamId: 'team', expectedName, expectedDescription: old });
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), ['GET /v1/people/me', 'GET /v1/teams/team', 'GET /v1/team/memberships?teamId=team&max=100']);
  assert.equal((f.owner as any).requests.size, 0); assert.deepEqual(f.members.snapshot(), roster);
});
test('MF24 one Team-description PUT uses required exact name echo and replacement only, exact ACK and no verification read', async () => {
  const f = fixture(), before = f.members.snapshot(), result = await f.send();
  assert.deepEqual(f.puts()[0]?.body, { name: expectedName, description: replacement });
  assert.deepEqual(result.outcome, { requestId: 'describe-team', action: 'team-describe', status: 'changed', notice: result.outcome.notice,
    teamId: 'team', expectedName, expectedDescription: old, description: replacement });
  assert.equal(f.calls.length, 4); assert.deepEqual(f.members.snapshot(), before);
});
test('MF24 empty/blank/no-op/unsafe/oversized Team description is refused before reading or reserving a request', async () => {
  const f = fixture(); f.api();
  for (const text of [old, '', ' ', '\n', 'a\r\nb', '\tbad', '\u202eunsafe', '\ud800', 'x'.repeat(1001), '😀'.repeat(501)]) {
    await assert.rejects(f.send('invalid', old, text));
  }
  await assert.rejects(f.api().describeTeam('bad!', 'team', expectedName, old, replacement, () => true));
  await assert.rejects(f.api().describeTeam('invalid', 'bad..id', expectedName, old, replacement, () => true));
  assert.equal(f.calls.length, 0); assert.equal((f.owner as any).requests.size, 0);
});
test('MF24 omitted/null/coerced Team-description preimage is not empty and cannot enable write or prep', async () => {
  const required = fixture(); required.api();
  for (const description of [undefined, null, false, 0, [], {}]) {
    const f = fixture({ team: { description } }); await assert.rejects(f.read());
    assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF24 explicit empty old description is a valid replacement preimage; LF/UTF-16 bound is exact, never a clear sentinel', async () => {
  const f = fixture({ team: { description: '' } });
  assert.deepEqual(await f.read(), { teamId: 'team', expectedName, expectedDescription: '' });
  const text = '😀'.repeat(499) + '\nX'; assert.equal(text.length, 1000);
  assert.equal((await f.send('bounded', '', text)).outcome.status, 'changed');
  assert.deepEqual(f.puts()[0]?.body, { name: expectedName, description: text });
});
test('MF24 concurrent Team name or description preimage change is conflict, no name-echo overwrite or automatic reprepare', async () => {
  const required = fixture(); required.api();
  for (const team of [{ name: 'Concurrent rename' }, { description: 'Concurrent description' }]) {
    const f = fixture({ team }); assert.equal((await f.send()).outcome.status, 'conflict'); assert.equal(f.puts().length, 0); assert.ok(f.calls.length <= 3);
  }
});
test('MF24 Team description requires explicit fresh Team moderator, not creator/Room role or truthy label', async () => {
  const required = fixture(); required.api();
  for (const isModerator of [false, undefined, null, 'true', 1]) {
    const f = fixture({ own: { isModerator }, team: { creatorId: 'self', isModerator: true } });
    await assert.rejects(f.read()); assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF24 Team-description complete one-page proof refuses paging/overflow/duplicate/foreign membership even with self first', async () => {
  const required = fixture(); required.api();
  for (const items of [[], [required.own, required.own], [{ ...required.own, teamId: 'other' }],
    [{ ...required.own, personId: 'other' }], [{ ...required.own, errors: [] }], [{ ...required.own, id: '' }],
    [required.own, { id: 'other', teamId: 'team', personId: 'self' }],
    Array.from({ length: 101 }, (_, i) => ({ ...required.own, id: 'm-' + i, personId: i ? 'p-' + i : 'self' }))]) {
    const f = fixture({ items }); assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
  const linked = fixture({ link: '<https://webexapis.com/v1/team/memberships?after=next>; rel="next"' });
  assert.equal((await linked.send()).outcome.status, 'failed'); assert.equal(linked.calls.length, 3);
});
test('MF24 Team-description preparation does not lend role or raw preimage permission to a later submission', async () => {
  const f = fixture(); await f.read(); f.own.isModerator = false;
  assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.calls.length, 6); assert.equal(f.puts().length, 0);
});
test('MF24 every current known grant and credential freshness is checked before Team-description reads; no new grants', async () => {
  const required = fixture(); required.api();
  for (const scope of scopes) {
    const f = fixture(); f.access.scopes = scopes.filter(v => v !== scope);
    await assert.rejects(f.read()); await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
  }
  const expired = fixture(); expired.access.expiresAt = 0; await assert.rejects(expired.send()); assert.equal(expired.calls.length, 0);
  const all = fixture(); all.access.scopes = ['spark:all']; assert.equal((await all.send()).outcome.status, 'changed');
});
test('MF24 Team-description context/grant checks repeat after each GET and cannot echo a name after invalidation', async () => {
  const required = fixture(); required.api();
  for (const stop of [1, 2, 3]) {
    const f = fixture(), original = f.rest.call; let valid = true;
    f.rest.call = async (...args) => { const value = await original(...args); if (f.calls.length === stop) valid = false; return value; };
    assert.equal((await f.send('invalidated', old, replacement, () => valid)).outcome.status, 'failed');
    assert.equal(f.calls.length, stop); assert.equal(f.puts().length, 0);
  }
});
test('MF24 only exact raw Team ID/name/description ACK confirms, never omitted/null/sanitized/space/coerced/error fields', async () => {
  const required = fixture(); required.api();
  for (const ack of [{}, { id: 'other', name: expectedName, description: replacement }, { id: 'team', description: replacement },
    { id: 'team', name: 'Concurrent rename', description: replacement }, { id: 'team', name: expectedName },
    { id: 'team', name: expectedName, description: null }, { id: 'team', name: expectedName, description: replacement.trim() + ' ' },
    { id: 'team', name: expectedName, description: ' ' }, { id: 'team', name: expectedName, description: replacement, errors: [] }]) {
    const f = fixture({ ack: () => ack }); assert.equal((await f.send()).outcome.status, 'unknown');
    await assert.rejects(f.send('new-id')); assert.equal(f.calls.length, 4);
  }
});
test('MF24 Team-description explicit refusal is failed and ambiguous post-dispatch service failure is unknown, without retries', async () => {
  const required = fixture(); required.api();
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    const f = fixture({ status }); assert.equal((await f.send()).outcome.status, status === 500 ? 'unknown' : 'failed');
    assert.equal(f.calls.length, 4); assert.equal(f.puts().length, 1);
  }
});
test('MF24 exact Team-description replay returns retained evidence, changed preimages/text under one ID refuse without IO', async () => {
  const f = fixture(); const result = await f.send();
  assert.equal((await f.send()).replayed, true); assert.deepEqual((await f.send()).outcome, result.outcome); assert.equal(f.calls.length, 4);
  await assert.rejects(f.send('describe-team', old, 'Different intent')); assert.equal(f.calls.length, 4);
});
test('MF24 Team description uses the existing shared 256-request ledger and never evicts unknown evidence', async () => {
  const f = fixture({ status: 500 }); await f.send('unknown'); f.access.scopes.push('spark:rooms_write');
  for (let i = 1; i < 256; i++) await f.owner.create('room-' + i, 'Separate room', () => true);
  const count = f.calls.length; f.owner.resolve('team-describe:team', 'unknown');
  await assert.rejects(f.send('over-limit')); assert.equal(f.calls.length, count);
  assert.equal((await f.send('unknown')).outcome.status, 'unknown');
});
test('MF24 Team rename and description uncertainty interlock BOTH ways across writes/preparations, not just same-action keys', async () => {
  const f = fixture({ status: 500 }); await f.send('description-unknown'); const count = f.calls.length;
  await assert.rejects(f.owner.prepareTeamRename('team', () => true));
  await assert.rejects(f.owner.renameTeam('blocked-rename', 'team', expectedName, 'New name', () => true));
  assert.equal(f.calls.length, count);
  const reverse = fixture({ status: 500 }); reverse.api();
  assert.equal((await reverse.owner.renameTeam('rename-unknown', 'team', expectedName, 'New name', () => true)).outcome.status, 'unknown');
  const previous = reverse.calls.length; await assert.rejects(reverse.read()); await assert.rejects(reverse.send());
  assert.equal(reverse.calls.length, previous);
});
test('MF24 Team-description recovery binds original action/Team/request; older ACK or other Team metadata cannot clear newer uncertainty', async () => {
  const f = fixture({ status: 500 }); await f.send('older');
  assert.throws(() => f.owner.resolve('team-describe:team'));
  assert.throws(() => f.owner.resolve('team-describe:other', 'older'));
  assert.throws(() => f.owner.resolve('team-rename:team', 'older'));
  f.owner.resolve('team-describe:team', 'older'); await f.send('newer');
  assert.throws(() => f.owner.resolve('team-describe:team', 'older'));
  await assert.rejects(f.send('still-blocked')); assert.equal(f.puts().length, 2);
  assert.equal((await f.send('older')).outcome.status, 'unknown');
});
test('MF24 Team-description preflight logical deadline/reset retains unsettled work and cannot later dispatch name echo', async t => {
  const f = fixture(); f.api(); const held = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? (started.resolve(), held.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send(); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'failed'); assert.equal(f.owner.busy(), true);
    f.owner.reset(); await assert.rejects(f.owner.prepareTeamRename('team', () => true));
  } finally { held.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(r => setImmediate(r));
  assert.equal(f.puts().length, 0); assert.equal(f.owner.busy(), false);
});
test('MF24 Team-description post-PUT deadline remains unknown; original resolution waits for physical settlement and late ACK cannot promote', async t => {
  const f = fixture(); f.api(); const held = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), held.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown');
    assert.throws(() => f.owner.resolve('team-describe:team', 'physical'));
    await assert.rejects(f.owner.prepareTeamRename('team', () => true));
  } finally { held.resolve({ value: { id: 'team', name: expectedName, description: replacement } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(r => setImmediate(r));
  assert.equal((await f.send('physical')).outcome.status, 'unknown');
});
test('MF24 Team-description reset fences old ACK/ledger completion and never fills a replacement session with old metadata', async t => {
  const f = fixture(); f.api(); const held = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), held.promise) : original(...args);
  const pending = f.send(); await started.promise; f.owner.reset();
  held.resolve({ value: { id: 'team', name: expectedName, description: replacement } });
  assert.equal((await pending).outcome.status, 'unknown'); assert.equal((f.owner as any).requests.size, 0);
  assert.equal((f.owner as any).uncertain.size, 0);
});
test('MF24 actual demo engine Team-description ACK changes no main state, Team name/cache/query/roles or delivery', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live provider'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), api = engine;
  try {
    await engine.start('demo'); assert.equal(typeof api.prepareTeamDescription, 'function', 'MF24 extends existing engine/ServerTeams description preparation');
    const joined = await engine.joinedTeams(), before = engine.snapshot(), events: string[] = [];
    for (const event of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(event, () => events.push(event));
    const prep = await api.prepareTeamDescription('demo-team', joined.revision);
    assert.deepEqual(Object.keys(prep).sort(), ['sessionId', 'teamId', 'revision', 'observedAt', 'expectedName', 'expectedDescription'].sort());
    assert.ok(Buffer.byteLength(JSON.stringify(prep)) <= 16384);
    assert.equal((await api.describeTeam('demo-description', 'demo-team', joined.revision, prep.expectedName, prep.expectedDescription, replacement)).status, 'changed');
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(events, []);
    assert.equal((await engine.prepareTeamRename('demo-team', joined.revision)).expectedName, prep.expectedName, 'description ACK never resets/renews the joined query');
    assert.equal((await api.prepareTeamDescription('demo-team', joined.revision)).expectedDescription, replacement, 'explicit reread only, not published/cache authority');
  } finally { engine.stop(); }
});
test('MF24 Team-description engine refuses missing/foreign/replaced joined-row proof before protected reads', async t => {
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), api = engine;
  try {
    await engine.start('demo'); assert.equal(typeof api.prepareTeamDescription, 'function');
    let calls = 0; const rest = (engine as any).actionREST as ActionREST, original = rest.call;
    rest.call = async (...args) => { calls++; return original(...args); };
    await assert.rejects(api.prepareTeamDescription('demo-team', 1)); assert.equal(calls, 0);
    const joined = await engine.joinedTeams(); calls = 0;
    await assert.rejects(api.prepareTeamDescription('foreign', joined.revision)); assert.equal(calls, 0);
    await engine.joinedTeams(); calls = 0;
    await assert.rejects(api.prepareTeamDescription('demo-team', joined.revision)); assert.equal(calls, 0);
  } finally { engine.stop(); }
});
