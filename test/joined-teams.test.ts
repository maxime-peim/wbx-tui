import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { ServerTeams } from '../src/server-teams.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { PublicREST, PublicProblem, type ActionREST, type PublicResponse } from '../src/public-rest.js';

const session = 'a'.repeat(32);
const team = (id = 'team-a', name: unknown = 'Same Name') => ({ id, name, description: 'PRIVATE DESCRIPTION',
  created: '2026-11-15T10:00:00.000Z', roles: ['PRIVATE ADMIN'], members: ['PRIVATE MEMBER'], accessToken: 'PRIVATE TOKEN' });
function fixture() {
  let now = 10000, next: PublicResponse = { value: { items: [team()] } };
  const teams = new ServerTeams(() => now), calls: string[] = [];
  const rest: ActionREST = { busy: () => false, async call(path, method, token, _signal, body) {
    calls.push(path); assert.equal(method, 'GET'); assert.equal(token, 'INERT'); assert.equal(body, undefined); return next;
  } };
  return { teams, rest, calls, setNow: (value: number) => { now = value; }, setNext: (value: PublicResponse) => { next = value; },
    run: (more = false, revision?: number, sessionId = session) => teams.joined(sessionId, rest, new AbortController().signal, () => 'INERT', more, revision) };
}
test('joined Team RPC is a finite session-owned read, never caller actors/org/Team/URL/grant selectors', () => {
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'teams.joined', params: {} }),
    { method: 'teams.joined', params: { more: false } });
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'teams.joined', params: { more: true, revision: 2 } }),
    { method: 'teams.joined', params: { more: true, revision: 2 } });
  for (const params of [{ teamId: 'other' }, { personId: 'other' }, { orgId: 'other' }, { token: 'secret' }, { url: 'https://evil.invalid' },
    { cursor: 'next' }, { max: 1000 }, { more: true }, { more: true, revision: 0 }, { more: 'true' }, { revision: 1 }]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'teams.joined', params }));
  }
});
test('one explicit joined-Team GET projects only exact IDs/labels and pages without details or loaded-label cache enrichment', async () => {
  const f = fixture();
  f.setNext({ value: { items: [team(), team('team-b')] }, link: '<https://webexapis.com/v1/teams?max=50&after=next>; rel="next"' });
  const first = await f.run();
  assert.deepEqual(first.items, [{ teamId: 'team-a', label: 'Same Name' }, { teamId: 'team-b', label: 'Same Name' }]);
  assert.equal(first.coverage, 'joined-teams'); assert.equal(first.sessionId, session);
  assert.equal(first.partial, true); assert.equal(first.more, true); assert.equal(first.limit, 'none');
  assert.equal(f.calls.length, 1); assert.equal(f.teams.diagnostics().cached, 0);
  first.items[0]!.teamId = 'foreign';
  f.setNext({ value: { items: [team('team-c')] } });
  const next = await f.run(true, first.revision);
  assert.equal(next.items[0]!.teamId, 'team-a'); assert.equal(next.items.length, 3);
  assert.equal(next.observedAt, first.observedAt); assert.equal(next.partial, false); assert.equal(next.more, false);
  assert.equal(f.calls.length, 2);
  for (const path of f.calls) {
    const url = new URL(path); assert.equal(url.origin, 'https://webexapis.com'); assert.equal(url.pathname, '/v1/teams');
    assert.equal(url.searchParams.get('max'), '50');
  }
  assert.doesNotMatch(JSON.stringify(next), /PRIVATE|description|created|roles|members|accessToken/);
});
test('names are sanitized presentation only, while malformed/duplicate identities fail closed', async () => {
  const f = fixture(); f.setNext({ value: { items: [team('a', '  A\nB\u202e '), team('b', null), team('c', '😀'.repeat(200))] } });
  const value = await f.run();
  assert.equal(value.items[0]!.label, 'A B'); assert.equal(value.items[1]!.label, 'Unnamed Team');
  assert.equal([...value.items[2]!.label].length, 120);
  for (const raw of [{ items: [team(), team()] }, { items: [team('../other')] }, { items: [{}] },
    { items: null }, { items: [team()], errors: [] }, { items: Array.from({ length: 51 }, (_, i) => team('t' + i)) }]) {
    const bad = fixture(); bad.setNext({ value: raw }); await assert.rejects(bad.run()); assert.equal(bad.calls.length, 1);
    await assert.rejects(bad.run(true, 1)); assert.equal(bad.calls.length, 1);
  }
});
test('joined-Team links reject retargeting, duplicate/foreign/ambiguous filters and malformed cursors without following', async () => {
  const links = [
    '<https://evil.invalid/v1/teams?max=50&after=x>; rel="next"',
    '</v1/rooms?max=50&after=x>; rel="next"', '</v1/teams?max=1000&after=x>; rel="next"',
    '</v1/teams?max=50&orgId=foreign&after=x>; rel="next"', '</v1/teams?max=50&max=50&after=x>; rel="next"',
    '</v1/teams?max=50&after=x>; rel="next", </v1/teams?max=50&after=y>; rel="next"',
    '</v1/teams?max=50&after=x>; rel="next", garbage',
    '<https://user:password@webexapis.com/v1/teams?max=50>; rel="next"',
    '</v1/teams?max=50&after=' + 'x'.repeat(2049) + '>; rel="next"',
    '</v1/teams?max=50&after=%00>; rel="next"', '</v1/teams?max=50&after=>; rel="next"',
  ];
  for (const link of links) {
    const f = fixture(); f.setNext({ value: { items: [team()] }, link });
    await assert.rejects(f.run()); assert.equal(f.calls.length, 1);
    await assert.rejects(f.run(true, 1)); assert.equal(f.calls.length, 1);
  }
});
test('page/item/byte/cycle limits stay explicitly partial and never drain another page', async () => {
  const f = fixture();
  for (let page = 0, revision: number | undefined; page < 5; page++) {
    f.setNext({ value: { items: Array.from({ length: 50 }, (_, i) => team(`p-${page}-${i}`)) },
      link: `<https://webexapis.com/v1/teams?max=50&after=page-${page}>; rel="next"` });
    const value = await f.run(page > 0, revision); revision = value.revision;
    assert.equal(value.partial, true); assert.equal(value.more, page < 4);
    if (page === 4) { assert.equal(value.items.length, 250); assert.notEqual(value.limit, 'none'); await assert.rejects(f.run(true, revision)); }
  }
  assert.equal(f.calls.length, 5);
  const sparse = fixture(); let pageRevision: number | undefined;
  for (let page = 0; page < 5; page++) {
    sparse.setNext({ value: { items: [team('sparse-' + page)] }, link: `</v1/teams?max=50&after=s-${page}>; rel="next"` });
    const value = await sparse.run(page > 0, pageRevision); pageRevision = value.revision;
    if (page === 4) { assert.equal(value.limit, 'pages'); assert.equal(value.more, false); assert.equal(value.items.length, 5); }
  }
  assert.equal(sparse.calls.length, 5);
  const cycle = fixture(); cycle.setNext({ value: { items: [] }, link: '</v1/teams?max=50>; rel="next"' });
  const stopped = await cycle.run(); assert.equal(stopped.limit, 'cycle'); assert.equal(stopped.partial, true); assert.equal(stopped.more, false);
  const bytes = fixture(); let revision: number | undefined;
  for (let page = 0; page < 2; page++) {
    bytes.setNext({ value: { items: Array.from({ length: 50 }, (_, i) => team(`${page}-${i}-` + 'x'.repeat(500), '😀'.repeat(120))) },
      link: `<https://webexapis.com/v1/teams?max=50&after=page-${page}>; rel="next"` });
    const value = await bytes.run(page > 0, revision); revision = value.revision;
    if (page === 1) {
      assert.equal(value.limit, 'bytes'); assert.equal(value.partial, true); assert.equal(value.more, false);
      assert.ok(Buffer.byteLength(JSON.stringify(value.items)) <= 65536);
    }
  }
  assert.equal(bytes.calls.length, 2);
});
test('query revision, expiry, reset and session replacement cannot resume old paging or free unsettled physical work', async () => {
  const f = fixture(); f.setNext({ value: { items: [team()] }, link: '</v1/teams?max=50&after=next>; rel="next"' });
  const first = await f.run();
  await assert.rejects(f.run(true, first.revision - 1)); await assert.rejects(f.run(true, first.revision, 'b'.repeat(32)));
  f.setNow(130001); await assert.rejects(f.run(true, first.revision)); assert.equal(f.calls.length, 1);
  f.teams.reset(); await assert.rejects(f.run(true, first.revision));
  let release!: (value: PublicResponse) => void, count = 0;
  const rest: ActionREST = { busy: () => false, async call() { count++; return new Promise(resolve => { release = resolve; }); } };
  const abort = new AbortController();
  const pending = f.teams.joined(session, rest, abort.signal, () => 'INERT');
  f.teams.reset(); abort.abort();
  await assert.rejects(f.teams.joined('b'.repeat(32), rest, new AbortController().signal, () => 'INERT'));
  release({ value: { items: [team()] } }); await assert.rejects(pending); assert.equal(count, 1);
});
test('a page that completes after the query lifetime cannot refill its expired joined slot', async () => {
  const f = fixture();
  f.setNext({ value: { items: [team()] }, link: '</v1/teams?max=50&after=next>; rel="next"' });
  const first = await f.run();
  const slow: ActionREST = { busy: () => false, async call() {
    f.setNow(130001); return { value: { items: [team('late')] } };
  } };
  await assert.rejects(f.teams.joined(session, slow, new AbortController().signal, () => 'INERT', true, first.revision));
  f.setNow(10001);
  await assert.rejects(f.run(true, first.revision), 'the expired completion must invalidate the cursor, not merely return stale display data');
  assert.equal(f.calls.length, 1);
});
test('loaded labels cannot overwrite joined cursors; a failed later page invalidates only paging, without retry', async () => {
  const f = fixture();
  f.setNext({ value: { items: [team()] }, link: '</v1/teams?max=50&after=next>; rel="next"' });
  const first = await f.run();
  let details = 0;
  await f.teams.list([{ id: 'room', teamId: 'team-a' }], { busy: () => false, async call(path) {
    details++; assert.equal(path, '/v1/teams/team-a'); return { value: { id: 'team-a', name: 'Different loaded label' } };
  } }, new AbortController().signal, () => 'INERT');
  assert.equal(details, 1); assert.equal(f.teams.diagnostics().cached, 1);
  let rejected = 0;
  await assert.rejects(f.teams.joined(session, { busy: () => false, async call() {
    rejected++; throw new PublicProblem('failed', 429);
  } }, new AbortController().signal, () => 'INERT', true, first.revision));
  await assert.rejects(f.run(true, first.revision));
  assert.equal(f.calls.length, 1); assert.equal(rejected, 1); assert.equal(f.teams.diagnostics().cached, 1);
  assert.equal(first.items[0]!.label, 'Same Name', 'loaded-label cache does not rewrite observed joined identities/labels');
});
for (const status of [200, 302, 401, 403, 404, 429]) test(`fixed joined-Team public boundary ${status}: exactly one physical GET, no redirects/replay`, async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++; assert.equal(req.method, 'GET'); assert.equal(req.url, '/v1/teams?max=50'); assert.equal(req.headers.authorization, 'Bearer INERT');
    const chunks = []; for await (const chunk of req) chunks.push(chunk); assert.equal(Buffer.concat(chunks).length, 0);
    res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
    res.end(JSON.stringify({ items: [team()] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const rest = new PublicREST((options, listener) => {
    assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.protocol, 'https:'); assert.equal(options.agent, false);
    return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  });
  try {
    const pending = new ServerTeams().joined(session, rest, new AbortController().signal, () => 'INERT');
    if (status === 200) assert.equal((await pending).items[0]!.teamId, 'team-a'); else await assert.rejects(pending);
    assert.equal(calls, 1); assert.equal(rest.busy(), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('engine joined-Team reads need known grants and never seed rooms/history/notifications or borrow old sessions', async () => {
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined,
    { publicRequest: () => assert.fail('Missing/expired known grant must refuse before any GET') });
  try {
    await assert.rejects(engine.joinedTeams());
    await engine.start('demo'); const before = engine.snapshot();
    const value = await engine.joinedTeams();
    assert.equal(value.sessionId, before.localContext!.sessionId);
    assert.equal(value.items.length, 2); assert.equal(value.items[0]!.label, value.items[1]!.label);
    assert.notEqual(value.items[0]!.teamId, value.items[1]!.teamId);
    assert.deepEqual(engine.snapshot(), before);
    engine.stop(); await engine.start('demo'); await assert.rejects(engine.joinedTeams(true, value.revision));
    Object.assign(engine, { mode: 'live', token: 'INERT', expiresAt: Date.now() + 60000, grantedScope: '' });
    await assert.rejects(engine.joinedTeams(), /unavailable/);
    Object.assign(engine, { grantedScope: 'spark:teams_read', expiresAt: 0 });
    await assert.rejects(engine.joinedTeams(), /unavailable/);
  } finally { engine.stop(); }
});
test('mid-read grant loss and session replacement discard late joined results, without physical overlap or refilling old cursors', async () => {
  let calls = 0, release!: (value: PublicResponse) => void;
  const rest: ActionREST = { busy: () => false, async call() {
    calls++; return new Promise(resolve => { release = resolve; });
  } };
  const engine = new EditorEngine();
  try {
    await engine.start('demo');
    Object.assign(engine, { actionREST: rest, mode: 'live', token: 'INERT', expiresAt: Date.now() + 60000, grantedScope: 'spark:teams_read' });
    const revoked = engine.joinedTeams();
    Object.assign(engine, { grantedScope: '' });
    release({ value: { items: [team()] } }); await assert.rejects(revoked);
    assert.equal(calls, 1);
    engine.stop(); await engine.start('demo');
    const oldSession = engine.snapshot().localContext!.sessionId;
    const pending = engine.joinedTeams();
    engine.stop(); await engine.start('demo');
    assert.notEqual(engine.snapshot().localContext!.sessionId, oldSession);
    await assert.rejects(engine.joinedTeams());
    assert.equal(calls, 2, 'reset cannot free unsettled feature/physical admission');
    release({ value: { items: [team()] } }); await assert.rejects(pending);
    const fresh = engine.joinedTeams();
    release({ value: { items: [team('fresh')] } });
    assert.equal((await fresh).items[0]!.teamId, 'fresh');
    assert.equal(calls, 3, 'only a fresh explicit query can read again after settlement');
  } finally { engine.stop(); }
});
