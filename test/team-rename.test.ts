/** MF24 contract-first assertions exercised offline, NOT service/tenant acceptance. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ConversationActions } from '../src/conversation-actions.js';
import { authenticatedSelf, RoomMembers } from '../src/room-members.js';
import { PublicProblem, PublicREST, publicURL, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { StrictMocks } from './strict-mocks.js';
const mocks = new StrictMocks();
afterEach(() => mocks.verify());

const oldName = 'Exact raw Team name', newName = 'Planning résumé 😀 | literal';
const scopes = ['spark:people_read', 'spark:teams_read', 'spark:team_memberships_read', 'spark:teams_write'];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
function fixture(options: { team?: Record<string, unknown>; own?: Record<string, unknown>; items?: unknown[];
  link?: string; ack?: (raw: Record<string, unknown>) => unknown; status?: number } = {}) {
  const calls: { path: string; method: PublicMethod; body?: object }[] = [];
  const own: Record<string, unknown> = { id: 'own-team-membership', teamId: 'team', personId: 'self', isModerator: true, ...options.own };
  const team: Record<string, unknown> = { id: 'team', name: oldName, description: 'Never echoed', ...options.team };
  const access = { token: 'INERT', scopes: [...scopes], expiresAt: Date.now() + 600000 };
  const rest: ActionREST = { busy: () => false, async call(path, method, token, signal, body) {
    assert.equal(token, 'INERT'); assert.equal(signal.aborted, false); calls.push({ path, method, body });
    if (path === '/v1/people/me') { assert.equal(method, 'GET'); return { value: { id: 'self' } }; }
    if (path === '/v1/rooms' && method === 'POST') return { value: { id: 'created-room', type: 'group', title: (body as { title: string }).title } };
    if (path === '/v1/team/memberships?teamId=team&max=100') {
      assert.equal(method, 'GET'); assert.equal(body, undefined);
      return { value: { items: options.items ?? [own] }, ...(options.link ? { link: options.link } : {}) };
    }
    assert.equal(path, '/v1/teams/team', 'no invented personId filter, membership-ID derivation, Room endpoint or roster drain');
    if (method === 'GET') return { value: { ...team } };
    assert.equal(method, 'PUT'); assert.deepEqual(body, { name: newName }, 'name only; never description/roles/preferences echo');
    if (options.status) throw new PublicProblem([400, 401, 403, 404, 409, 429].includes(options.status) ? 'failed' : 'unknown', options.status);
    return { value: options.ack ? options.ack({ id: 'team', name: newName }) : { id: 'team', name: newName } };
  } };
  mocks.track(rest);
  const members = new RoomMembers(), owner = new ConversationActions(rest, members, () => access,
    (signal, token) => authenticatedSelf(rest, signal, token));
  const api = () => {
    assert.equal(typeof owner.renameTeam, 'function', 'MF24 extends the shared conversation mutation/uncertainty owner');
    assert.equal(typeof owner.prepareTeamRename, 'function', 'fresh raw Team proof is not a cached/sanitized Team label');
    return owner;
  };
  return { api, owner, rest, members, calls, own, team, access,
    prepare: (valid = () => true) => api().prepareTeamRename('team', valid),
    send: (id = 'rename-team', expected = oldName, name = newName, valid = () => true) => api().renameTeam(id, 'team', expected, name, valid),
    puts: () => calls.filter(c => c.method === 'PUT') };
}
test('MF24 finite Team rename preparation and submit accept exact joined-Team revision/ID/name intent only', () => {
  assert.deepEqual(parse('teams.renamePrepare', { teamId: 'team', revision: 1 }),
    { method: 'teams.renamePrepare', params: { teamId: 'team', revision: 1 } });
  const params = { requestId: 'one', teamId: 'team', revision: 1, expectedName: oldName, name: newName, confirmed: true };
  assert.deepEqual(parse('teams.rename', params), { method: 'teams.rename', params });
  for (const patch of [{ personId: 'self' }, { membershipId: 'cached-own' }, { role: 'moderator' }, { isModerator: true },
    { description: 'echo' }, { roomId: 'room' }, { body: {} }, { url: '/v1/teams/team' }, { more: true }, { confirmed: false }, { revision: 0 }]) {
    assert.throws(() => parse('teams.rename', { ...params, ...patch }));
  }
});
test('MF24 Team recovery RPC binds original request/Team and cannot borrow room metadata or generic action fields', () => {
  const params = { action: 'team-rename', teamId: 'team', requestId: 'original', checked: true };
  assert.deepEqual(parse('conversations.resolve', params), { method: 'conversations.resolve', params });
  for (const patch of [{ roomId: 'team' }, { requestId: undefined }, { teamId: undefined }, { checked: false }, { name: newName }]) {
    assert.throws(() => parse('conversations.resolve', { ...params, ...patch }));
  }
});
test('MF24 path review admits only the exact bounded Team-memberships GET, not membership-ID reads/writes or extra filters', async () => {
  assert.equal(publicURL('/v1/team/memberships?teamId=team&max=100').pathname, '/v1/team/memberships');
  for (const path of ['/v1/team/memberships/own', '/v1/team/memberships', '/v1/team/memberships?teamId=team&max=101',
    '/v1/team/memberships?teamId=team&max=100&personId=self', '/v1/team/memberships?teamId=team&max=100&cursor=next',
    '/v1/team/memberships?teamId=team&max=100&teamId=other', 'https://evil.invalid/v1/team/memberships?teamId=team&max=100']) {
    assert.throws(() => publicURL(path));
  }
  let physical = 0;
  const rest = new PublicREST(() => { physical++; assert.fail('The new path is GET-only, not a Team-membership mutation tunnel'); });
  for (const method of ['POST', 'PUT', 'DELETE'] as const) {
    await assert.rejects(rest.call('/v1/team/memberships?teamId=team&max=100', method, 'INERT', new AbortController().signal));
  }
  assert.equal(physical, 0);
});
test('MF24 private raw-name preparation proves fresh self/Team/moderator with three GETs and retains no roles or roster', async () => {
  const f = fixture(), before = f.members.snapshot();
  assert.deepEqual(await f.prepare(), { teamId: 'team', expectedName: oldName });
  assert.deepEqual(f.calls.map(c => [c.method, c.path]), [['GET', '/v1/people/me'], ['GET', '/v1/teams/team'],
    ['GET', '/v1/team/memberships?teamId=team&max=100']]);
  assert.equal((f.owner as any).requests.size, 0); assert.deepEqual(f.members.snapshot(), before);
});
test('MF24 confirmed Team rename rechecks three GETs then sends one exact name-only PUT without membership/preference writes', async () => {
  const f = fixture(), before = f.members.snapshot(), result = await f.send();
  assert.deepEqual(result.outcome, { requestId: 'rename-team', action: 'team-rename', teamId: 'team',
    expectedName: oldName, name: newName, status: 'changed', notice: result.outcome.notice });
  assert.equal(f.calls.length, 4); assert.deepEqual(f.puts()[0]?.body, { name: newName });
  assert.deepEqual(f.members.snapshot(), before); assert.equal((f.owner as any).requests.size, 1);
  assert.equal((f.owner as any).uncertain.size, 0);
});
test('MF24 raw Team name mismatch is conflict, never comparison against sanitized/clipped cached labels', async () => {
  const f = fixture({ team: { name: 'Another exact raw preimage' } }), result = await f.send();
  assert.equal(result.outcome.status, 'conflict'); assert.equal(f.puts().length, 0); assert.ok(f.calls.length <= 3);
  const malformed = fixture({ team: { name: 'noncanonical  Team' } });
  await assert.rejects(malformed.prepare()); assert.equal(malformed.puts().length, 0);
});
test('MF24 name validation refuses no-op, truncation, unsafe controls/Unicode and invalid identities before ledger/read admission', async () => {
  const f = fixture(); f.api();
  for (const name of [oldName, '', ' padded', 'padded ', 'a  b', 'x\n', '\u200eunsafe', '\ud800', 'x'.repeat(81)]) {
    await assert.rejects(f.send('bad', oldName, name));
  }
  await assert.rejects(f.api().renameTeam('bad!', 'team', oldName, newName, () => true));
  await assert.rejects(f.api().renameTeam('bad', 'bad..id', oldName, newName, () => true));
  assert.equal(f.calls.length, 0); assert.equal((f.owner as any).requests.size, 0);
});
test('MF24 Team moderator must be an explicit fresh self boolean, not creator/Room-moderator/cached truthiness', async () => {
  const required = fixture(); required.api();
  for (const isModerator of [false, undefined, null, 'true', 1]) {
    const f = fixture({ own: { isModerator }, team: { creatorId: 'self', isModerator: true } });
    assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
});
test('MF24 complete bounded Team roster refuses missing/foreign/duplicate/error self proof and never projects other preferences', async () => {
  const required = fixture(); required.api();
  for (const items of [[], [{ ...required.own, personId: 'other' }], [required.own, required.own],
    [{ ...required.own, teamId: 'other' }], [{ ...required.own, id: '' }], [{ ...required.own, errors: [] }],
    [required.own, { ...required.own, id: 'duplicate-person' }], [required.own, { id: 'other', personId: 'peer' }]]) {
    const f = fixture({ items }); assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.puts().length, 0);
  }
  const f = fixture({ own: { favorite: true, isRoomHidden: true, personEmail: 'private@example.invalid' } });
  assert.doesNotMatch(JSON.stringify(await f.prepare()), /private@|Moderator|Hidden|favorite/);
});
test('MF24 one complete page may contain 100 identities but any Link/overflow refuses even when self appears first', async () => {
  const required = fixture(); required.api();
  const others = Array.from({ length: 99 }, (_, i) => ({ id: 'm-' + i, teamId: 'team', personId: 'p-' + i }));
  const full = fixture({ items: [required.own, ...others] });
  assert.equal((await full.send()).outcome.status, 'changed'); assert.equal(full.calls.length, 4);
  for (const link of ['<https://webexapis.com/v1/team/memberships?teamId=team&max=100&after=x>; rel="next"', 'malformed']) {
    const f = fixture({ link }); assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.calls.length, 3);
  }
  const overflow = fixture({ items: [required.own, ...others, { id: 'over', teamId: 'team', personId: 'over' }] });
  assert.equal((await overflow.send()).outcome.status, 'failed'); assert.equal(overflow.calls.length, 3);
});
test('MF24 preparation cannot lend role permission to submission after Team moderator removal', async () => {
  const f = fixture(); await f.prepare(); f.own.isModerator = false;
  assert.equal((await f.send()).outcome.status, 'failed'); assert.equal(f.calls.length, 6); assert.equal(f.puts().length, 0);
});
test('MF24 every missing known grant/expired access refuses before reads; spark:all is compatible without grant acquisition', async () => {
  const required = fixture(); required.api();
  for (const scope of scopes) {
    const f = fixture(); f.access.scopes = scopes.filter(v => v !== scope);
    await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
  }
  const expired = fixture(); expired.access.expiresAt = 0; await assert.rejects(expired.send()); assert.equal(expired.calls.length, 0);
  const all = fixture(); all.access.scopes = ['spark:all']; assert.equal((await all.send()).outcome.status, 'changed');
});
test('MF24 permission/context rechecks after every preflight GET prevent PUT and cannot use old Team-list/session proof', async () => {
  const required = fixture(); required.api();
  for (const stop of [1, 2, 3]) {
    const f = fixture(), original = f.rest.call; let valid = true;
    f.rest.call = async (...args) => { const response = await original(...args); if (f.calls.length === stop) valid = false; return response; };
    assert.equal((await f.send('invalidated', oldName, newName, () => valid)).outcome.status, 'failed');
    assert.equal(f.puts().length, 0); assert.equal(f.calls.length, stop);
  }
});
test('MF24 only exact raw Team ID/name ACK confirms; omitted/coerced/sanitized/error ACKs stay unknown without verification GET', async () => {
  const required = fixture(); required.api();
  for (const ack of [{}, { id: 'other', name: newName }, { id: 'team', name: newName + ' ' },
    { id: 'team', name: null }, { id: 'team', name: newName, errors: [] }]) {
    const f = fixture({ ack: () => ack }); assert.equal((await f.send()).outcome.status, 'unknown');
    assert.equal(f.calls.length, 4); await assert.rejects(f.send('fresh-id')); assert.equal(f.calls.length, 4);
  }
});
test('MF24 explicit service refusal is failed, ambiguous post-dispatch failure is unknown, neither retries or changes Room state', async () => {
  const required = fixture(); required.api();
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    const f = fixture({ status }); assert.equal((await f.send()).outcome.status, status === 500 ? 'unknown' : 'failed');
    assert.equal(f.puts().length, 1); assert.equal(f.calls.length, 4);
  }
});
test('MF24 exact request replay returns retained evidence only; changing Team intent with the same ID never repeats PUT', async () => {
  const f = fixture(); assert.equal((await f.send()).outcome.status, 'changed');
  assert.equal((await f.send()).replayed, true); assert.equal(f.calls.length, 4);
  await assert.rejects(f.send('rename-team', oldName, 'Different intent')); assert.equal(f.calls.length, 4);
});
test('MF24 uncertainty recovery requires original Team/request and an older resolution cannot clear newer uncertainty', async () => {
  const f = fixture({ status: 500 }); assert.equal((await f.send('older')).outcome.status, 'unknown');
  assert.throws(() => f.owner.resolve('team-rename:team'));
  assert.throws(() => f.owner.resolve('team-rename:other', 'older'));
  f.owner.resolve('team-rename:team', 'older'); assert.equal((await f.send('newer')).outcome.status, 'unknown');
  assert.throws(() => f.owner.resolve('team-rename:team', 'older'));
  await assert.rejects(f.send('must-remain-blocked')); assert.equal(f.puts().length, 2);
  assert.equal((await f.send('older')).outcome.status, 'unknown'); assert.equal(f.puts().length, 2);
});
test('MF24 preflight deadline/reset retains stubborn shared physical work and late self proof cannot submit', async t => {
  const f = fixture(); f.api(); const held = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[0] === '/v1/people/me' ? (started.resolve(), held.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send(); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'failed'); assert.equal(f.owner.busy(), true);
    f.owner.reset(); await assert.rejects(f.owner.create('blocked-create', 'Separate room', () => true));
  } finally { held.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.puts().length, 0); assert.equal(f.owner.busy(), false);
});
test('MF24 post-PUT deadline stays unknown through physical settlement; late exact ACK cannot promote or resolve it', async t => {
  const f = fixture(); f.api(); const held = deferred<any>(), started = deferred<void>(), original = f.rest.call;
  f.rest.call = async (...args) => args[1] === 'PUT' ? (started.resolve(), held.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send('physical'); await started.promise; t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown'); assert.equal(f.owner.busy(), true);
    assert.throws(() => f.owner.resolve('team-rename:team', 'physical'));
    await assert.rejects(f.owner.create('blocked', 'Separate room', () => true));
  } finally { held.resolve({ value: { id: 'team', name: newName } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal((await f.send('physical')).outcome.status, 'unknown');
});
test('MF24 Team rename shares the 256-request ledger with room metadata and never evicts unknown evidence', async () => {
  const f = fixture({ status: 500 }); await f.send('unknown');
  f.access.scopes.push('spark:rooms_write'); // Only this existing room-create regression needs its already supported grant.
  for (let i = 1; i < 256; i++) {
    const result = await f.owner.create('room-' + i, 'Separate room', () => true).catch(() => undefined);
    assert.ok(result, 'a failed admitted room attempt still occupies the SAME ledger');
  }
  const count = f.calls.length; f.owner.resolve('team-rename:team', 'unknown');
  await assert.rejects(f.send('over-budget')); assert.equal(f.calls.length, count);
  assert.equal((await f.send('unknown')).outcome.status, 'unknown');
});
test('MF24 actual engine binds Team rename to fresh exact joined-row revision without borrowing selected-room identity or publishing main state', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), api = engine;
  try {
    await engine.start('demo');
    assert.equal(typeof api.prepareTeamRename, 'function', 'MF24 extends the existing engine/ServerTeams admission');
    assert.equal(typeof api.renameTeam, 'function');
    const page = await engine.joinedTeams(), before = engine.snapshot(), events: string[] = [];
    for (const event of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(event, () => events.push(event));
    const prepared = await api.prepareTeamRename(page.items[0]!.teamId, page.revision);
    assert.deepEqual(Object.keys(prepared).sort(), ['sessionId', 'teamId', 'revision', 'observedAt', 'expectedName'].sort());
    assert.equal(prepared.sessionId, before.localContext!.sessionId); assert.equal(prepared.revision, page.revision);
    assert.ok(Buffer.byteLength(JSON.stringify(prepared)) <= 4096);
    assert.equal((await api.renameTeam('engine-team', prepared.teamId, prepared.revision, prepared.expectedName, newName)).status, 'changed');
    assert.deepEqual(engine.snapshot(), before); assert.deepEqual(events, []);
    await assert.rejects(api.prepareTeamRename(prepared.teamId, page.revision), 'ACK invalidates joined selection, not a main Room title');
    const fresh = await engine.joinedTeams(); assert.equal(fresh.items[0]?.label, newName);
  } finally { engine.stop(); }
});
test('MF24 engine rejects absent/stale/foreign joined-row proof before protected reads; refreshed labels confer no role permission', async t => {
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), api = engine;
  try {
    await engine.start('demo'); assert.equal(typeof api.prepareTeamRename, 'function');
    let calls = 0; const rest = (engine as any).actionREST as ActionREST, original = rest.call;
    rest.call = async (...args) => { calls++; return original(...args); };
    await assert.rejects(api.prepareTeamRename('demo-team', 1)); assert.equal(calls, 0);
    const page = await engine.joinedTeams(); calls = 0;
    await assert.rejects(api.prepareTeamRename('foreign', page.revision)); assert.equal(calls, 0);
    await engine.joinedTeams(); calls = 0;
    await assert.rejects(api.prepareTeamRename(page.items[0]!.teamId, page.revision)); assert.equal(calls, 0);
  } finally { engine.stop(); }
});
