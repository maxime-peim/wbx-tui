/** MF24 real engine/PublicREST via loopback/injected native streams, never live/OAuth/grant expansion. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { PublicREST, publicURL, type PublicRequest } from '../src/public-rest.js';

const oldName = 'Exact fresh Team', name = 'Team résumé 😀 | literal';
const grants = ['spark:people_read', 'spark:teams_read', 'spark:team_memberships_read', 'spark:teams_write'];
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await new Promise<void>(r => setImmediate(r));
  assert.ok(check(), 'bounded native work reached');
}
async function session(t: TestContext, publicRequest: PublicRequest, scope = grants.join(' ')) {
  const directory = await mkdtemp('/tmp/opencode/wbx-team-rename-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:teams_read'] } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'INERT', scope: grants.join(' '), expiresAt: Date.now() + 600000 }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => assert.fail('No authorization refresh or replay'));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK'));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { publicRequest });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  await engine.startSession({ mode: 'live', config, readStatus: false });
  const page = await engine.joinedTeams(), events: string[] = [];
  Object.assign(engine, { grantedScope: scope }); // Selection was observed earlier; protected work must recheck current grants.
  for (const event of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(event, () => events.push(event));
  return { engine, page, events };
}
type Phase = 'self' | 'team' | 'members' | 'put';
const phaseFor = (path: string, method: string): Phase | 'joined' => path.startsWith('/v1/teams?') ? 'joined'
  : path === '/v1/people/me' ? 'self' : path.startsWith('/v1/team/memberships?') ? 'members' : method === 'PUT' ? 'put' : 'team';
async function fixture(t: TestContext, options: {
  own?: Record<string, unknown>; team?: Record<string, unknown>; items?: unknown[]; body?: unknown;
  link?: string; status?: number; failAt?: Phase; hold?: Phase; scope?: string; malformed?: 'utf8' | 'json';
} = {}) {
  const calls: { method: string; path: string; body: string }[] = [], held = deferred<void>(), replies: (() => void)[] = [];
  const team = { id: 'team', name: oldName, description: 'Private description is never sent back', ...options.team };
  const own = { id: 'own', teamId: 'team', personId: 'self', isModerator: true, personEmail: 'private@example.invalid', ...options.own };
  let changed = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8'), method = req.method!, path = req.url!;
    assert.equal(req.headers.authorization, 'Bearer INERT');
    const phase = phaseFor(path, method);
    calls.push({ method, path, body });
    if (method === 'PUT') {
      assert.equal(path, '/v1/teams/team'); assert.equal(body, JSON.stringify({ name }));
      assert.equal(req.headers['content-length'], String(Buffer.byteLength(body))); assert.equal(req.headers['content-type'], 'application/json');
    } else { assert.equal(method, 'GET'); assert.equal(body, ''); }
    const send = () => {
      const fail = phase === (options.failAt ?? 'put'), status = fail ? options.status ?? 200 : 200;
      let value: unknown;
      if (phase === 'joined') value = { items: [{ id: 'team', name: changed ? name : 'Sanitized navigation label' }] };
      else if (phase === 'self') value = { id: 'self' };
      else if (phase === 'team') { assert.equal(path, '/v1/teams/team'); value = team; }
      else if (phase === 'members') {
        assert.equal(path, '/v1/team/memberships?teamId=team&max=100');
        value = { items: options.items ?? [own] };
      } else { changed = true; value = { id: 'team', name }; }
      if (fail && options.body !== undefined) value = options.body;
      res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/redirect',
        ...(fail && options.link ? { Link: options.link } : {}) });
      res.end(status === 204 ? undefined : fail && options.malformed
        ? options.malformed === 'utf8' ? Buffer.from([0xff, 0xfe]) : '{'
        : JSON.stringify(value));
    };
    if (options.hold === phase) { replies.push(send); held.resolve(); } else send();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  t.after(async () => { for (const reply of replies.splice(0)) reply(); server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r())); });
  const f = await session(t, (o: any, receive: any) => {
    assert.equal(o.protocol, 'https:'); assert.equal(o.hostname, 'webexapis.com'); assert.equal(o.agent, false);
    return request({ ...o, protocol: 'http:', hostname: '127.0.0.1', port }, receive);
  }, options.scope);
  calls.length = 0;
  return { ...f, calls, own, team, held: held.promise, release: () => { for (const reply of replies.splice(0)) reply(); },
    prepare: () => f.engine.prepareTeamRename('team', f.page.revision),
    send: (id = 'physical-team') => f.engine.renameTeam(id, 'team', f.page.revision, oldName, name) };
}
test('MF24 physical preparation+submit performs six fresh GETs/one exact name-only PUT; publishes no main state/roles/alerts/receipts', async t => {
  const f = await fixture(t), before = f.engine.snapshot(), roster = (f.engine as any).members.snapshot();
  const prepared = await f.prepare();
  assert.equal(prepared.expectedName, oldName); assert.equal(prepared.sessionId, before.localContext!.sessionId);
  assert.ok(Buffer.byteLength(JSON.stringify(prepared)) <= 4096);
  assert.equal((await f.send()).status, 'changed');
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), [
    'GET /v1/people/me', 'GET /v1/teams/team', 'GET /v1/team/memberships?teamId=team&max=100',
    'GET /v1/people/me', 'GET /v1/teams/team', 'GET /v1/team/memberships?teamId=team&max=100', 'PUT /v1/teams/team',
  ]);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []); assert.deepEqual((f.engine as any).members.snapshot(), roster);
  assert.equal((f.engine as any).teams.diagnostics().cached, 0);
  assert.equal((await f.send()).status, 'changed', 'retained exact replay requires no current joined permission or IO');
  assert.equal(f.calls.length, 7);
  const fresh = await f.engine.joinedTeams(); assert.equal(fresh.items[0]?.label, name);
  const count = f.calls.length; assert.equal((await f.send()).status, 'changed'); assert.equal(f.calls.length, count);
  assert.equal((await f.engine.prepareTeamRename('team', fresh.revision)).expectedName, oldName, 'a fresh GET, never a display label, is the preimage');
});
for (const [kind, team] of Object.entries({ foreign: { id: 'other' }, missingName: { name: undefined },
  nullName: { name: null }, noncanonical: { name: ' spaced ' }, error: { errors: [] } })) {
  test(`MF24 physical ${kind} raw Team proof refuses before memberships or PUT`, async t => {
    const f = await fixture(t, { team }), before = f.engine.snapshot();
    assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 2);
    assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
  });
}
test('MF24 physical fresh raw name mismatch is conflict, zero PUT, no automatic refresh/role scan', async t => {
  const f = await fixture(t, { team: { name: 'Concurrent rename' } });
  assert.equal((await f.send()).status, 'conflict'); assert.equal(f.calls.length, 2);
});
for (const [kind, own] of Object.entries({
  member: { isModerator: false }, absentRole: { isModerator: undefined }, nullRole: { isModerator: null },
  stringRole: { isModerator: 'true' }, numericRole: { isModerator: 1 }, foreignPerson: { personId: 'other' },
  foreignTeam: { teamId: 'other' }, badId: { id: '' }, errors: { errors: [] },
})) test(`MF24 physical ${kind} membership cannot authorize Team rename`, async t => {
  const f = await fixture(t, { own }), before = f.engine.snapshot();
  assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const items of [[], [{}, {}], [{ id: 'm', teamId: 'team', personId: 'self', isModerator: true },
  { id: 'other', teamId: 'team', personId: 'self', isModerator: true }], Array.from({ length: 101 }, (_, i) => ({
    id: 'm-' + i, teamId: 'team', personId: i ? 'p-' + i : 'self', isModerator: true,
  }))]) test('MF24 physical empty/duplicate/malformed/overflow Team page cannot be truncated into own-role permission', async t => {
  const f = await fixture(t, { items }); assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
});
for (const link of ['<https://webexapis.com/v1/team/memberships?teamId=team&max=100&after=x>; rel="next"',
  '<https://evil.invalid/read>; rel="next"', 'malformed']) test('MF24 physical Team membership Link refuses even with own moderator on first page, never follows', async t => {
  const f = await fixture(t, { link, failAt: 'members' }); assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
});
for (const body of [{}, { id: 'other', name }, { id: 'team', name: null }, { id: 'team', name: name + ' ' },
  { id: 'team', name, errors: [] }]) test('MF24 physical ambiguous raw ACK stays unknown; exact replay and new-ID suppression do no IO', async t => {
  const f = await fixture(t, { body }), before = f.engine.snapshot();
  assert.equal((await f.send()).status, 'unknown'); assert.equal((await f.send()).status, 'unknown');
  await assert.rejects(f.send('new-id')); assert.equal(f.calls.length, 4);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const status of [204, 302, 400, 401, 403, 404, 409, 429, 500]) test(`MF24 physical PUT HTTP ${status} is one-shot, never redirected/refreshed/retried/verified`, async t => {
  const f = await fixture(t, { status }), before = f.engine.snapshot();
  const outcome = await f.send();
  assert.equal(outcome.status, [204, 302, 500].includes(status) ? 'unknown' : 'failed');
  assert.equal(f.calls.length, 4); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const phase of ['self', 'team', 'members'] as const) test(`MF24 physical ${phase} grant loss refuses before subsequent reads/PUT`, async t => {
  const f = await fixture(t, { hold: phase }), pending = f.send();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:teams_write' }); f.release();
  assert.equal((await pending).status, 'failed'); assert.equal(f.calls.length, ['self', 'team', 'members'].indexOf(phase) + 1);
});
test('MF24 physical post-PUT grant loss remains unknown despite exact ACK, never refreshes auth', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.send();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:teams_read' }); f.release();
  assert.equal((await pending).status, 'unknown'); assert.equal(f.calls.length, 4);
});
for (const scope of grants) test(`MF24 missing ${scope} grant refuses before any protected read or permission prompt`, async t => {
  const f = await fixture(t, { scope: grants.filter(v => v !== scope).join(' ') });
  await assert.rejects(f.prepare()); await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
});
test('MF24 preparation role cannot be reused after physical provider demotion', async t => {
  const f = await fixture(t); await f.prepare(); f.own.isModerator = false;
  assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 6);
});
for (const phase of ['self', 'team', 'members', 'put'] as const) test(`MF24 physical ${phase} replaced joined-query revision invalidates old intent without stale cache publication`, async t => {
  const f = await fixture(t, { hold: phase }), pending = f.send(), before = f.engine.snapshot();
  await f.held; (f.engine as any).teams.reset(); f.release();
  assert.equal((await pending).status, phase === 'put' ? 'unknown' : 'failed');
  assert.equal(f.calls.length, ['self', 'team', 'members', 'put'].indexOf(phase) + 1);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
test('MF24 physical old-session exact PUT ACK cannot refill or publish in replacement demo session', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.send();
  await f.held; f.engine.stop(); await f.engine.start('demo'); const before = f.engine.snapshot(); f.release();
  await assert.rejects(pending); assert.deepEqual(f.engine.snapshot(), before); assert.equal(f.calls.length, 4);
});
for (const malformed of ['json', 'utf8'] as const) test(`MF24 physical ${malformed} ACK is unknown without verification/replay`, async t => {
  const f = await fixture(t, { malformed }); assert.equal((await f.send()).status, 'unknown'); assert.equal(f.calls.length, 4);
});
for (const failAt of ['members', 'put'] as const) test(`MF24 physical ${failAt} byte overflow refuses/unknown rather than truncated authority/confirmation`, async t => {
  const f = await fixture(t, { failAt, body: { overflow: 'x'.repeat(262145) } });
  assert.equal((await f.send()).status, failAt === 'put' ? 'unknown' : 'failed');
  assert.equal(f.calls.length, failAt === 'put' ? 4 : 3);
});
test('MF24 physical original Team/request resolution never clears newer uncertainty or performs IO', async t => {
  const f = await fixture(t, { status: 500 }); await f.send('older');
  assert.throws(() => f.engine.resolveConversationAction('team-rename', 'other', 'older'));
  assert.throws(() => f.engine.resolveConversationAction('team-rename', 'team'));
  f.engine.resolveConversationAction('team-rename', 'team', 'older'); await f.send('newer');
  assert.throws(() => f.engine.resolveConversationAction('team-rename', 'team', 'older'));
  await assert.rejects(f.send('blocked')); assert.equal(f.calls.length, 8);
  assert.equal((await f.send('older')).status, 'unknown'); assert.equal(f.calls.length, 8);
});
test('MF24 Team-member path admission blocks duplicate/extra/ID paths and all mutation methods/body before native dispatch', async () => {
  let calls = 0;
  const rest = new PublicREST(() => { calls++; assert.fail('No native Team membership write/tunnel'); });
  for (const path of ['/v1/team/memberships/own', '/v1/team/memberships?teamId=team&max=100&max=100',
    '/v1/team/memberships?teamId=team&max=100&actor=self', '/v1/team/memberships?teamId=team',
    '/v1/team/memberships?teamId=bad..id&max=100', '/v1/team/memberships?teamId=team&max=50']) assert.throws(() => publicURL(path));
  for (const method of ['POST', 'PUT', 'DELETE', 'GET'] as const) await assert.rejects(rest.call(
    '/v1/team/memberships?teamId=team&max=100', method, 'INERT', new AbortController().signal, { name }));
  assert.equal(calls, 0);
});
for (const failAt of ['team', 'put'] as const) test(`MF24 physical ${failAt} Link cannot become raw preimage or exact ACK authority`, async t => {
  const f = await fixture(t, { failAt, link: '<https://evil.invalid/read>; rel="next"' });
  assert.equal((await f.send()).status, failAt === 'put' ? 'unknown' : 'failed');
  assert.equal(f.calls.length, failAt === 'put' ? 4 : 2);
});
for (const phase of ['self', 'team', 'members'] as const) test(`MF24 physical preparation ${phase} deadline/reset stays read-only and retains native admission`, async t => {
  let consumed = false, client!: EventEmitter;
  const calls: string[] = [];
  const f = await session(t, (o: any, receive: any) => {
    const step = phaseFor(o.path, o.method); calls.push(o.method + ' ' + o.path);
    assert.equal(o.method, 'GET');
    if (step === phase) {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
        destroy() { response.emit('close'); return response; },
        async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from('{"id":'); },
      });
      client = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => receive(response)); return client; }, destroy() { return client; } });
      return client as any;
    }
    const value = step === 'joined' ? { items: [{ id: 'team', name: oldName }] } : step === 'self' ? { id: 'self' }
      : { id: 'team', name: oldName };
    return new Writable({ write(_chunk, _encoding, done) { done(); }, final(done) {
      queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done();
    } }) as any;
  });
  calls.length = 0; const before = f.engine.snapshot();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.engine.prepareTeamRename('team', f.page.revision);
    await until(() => consumed); t.mock.timers.tick(20000); await assert.rejects(pending);
    const count = calls.length; assert.equal((f.engine as any).publicREST.busy(), true);
    assert.equal((f.engine as any).conversations.requests.size, 0, 'no mutation/recovery slot for preparation');
    f.engine.stop(); await f.engine.start('demo'); await assert.rejects(f.engine.joinedTeams());
    assert.equal(calls.length, count);
  } finally { client?.emit('close'); t.mock.timers.reset(); }
  await (f.engine as any).publicREST.settled(); await until(() => !(f.engine as any).conversations.busy());
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, before.localContext!.sessionId);
  assert.deepEqual(f.events.filter(event => event !== 'state'), []);
});
for (const phase of ['members', 'put'] as const) test(`MF24 physical ${phase} chunk-read overflow refuses rather than accepting partial role/ACK evidence`, async t => {
  const f = await session(t, (o: any, receive: any) => {
    const step = phaseFor(o.path, o.method);
    const value = step === 'joined' ? { items: [{ id: 'team', name: oldName }] } : step === 'self' ? { id: 'self' }
      : step === 'team' ? { id: 'team', name: oldName } : { items: [{ id: 'own', teamId: 'team', personId: 'self', isModerator: true }] };
    const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
      destroy() { response.emit('close'); return response; },
      async *[Symbol.asyncIterator]() {
        if (step === phase) { for (let i = 0; i < 1025; i++) yield Buffer.from(' '); }
        else yield Buffer.from(JSON.stringify(value));
        queueMicrotask(() => response.emit('close'));
      },
    });
    const client = Object.assign(new EventEmitter(), {
      end() { queueMicrotask(() => receive(response)); return client; },
      destroy() { queueMicrotask(() => client.emit('close')); return client; },
    });
    return client as any;
  });
  const before = f.engine.snapshot(), result = await f.engine.renameTeam('chunks', 'team', f.page.revision, oldName, name);
  assert.equal(result.status, phase === 'put' ? 'unknown' : 'failed');
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const phase of ['self', 'team', 'members', 'put'] as const) test(`MF24 physical ${phase} deadline/reset cannot release stubborn native admission or accept late ACK`, async t => {
  let consumed = false, client!: EventEmitter;
  const calls: string[] = [];
  const f = await session(t, (o: any, receive: any) => {
    const step = phaseFor(o.path, o.method); calls.push(o.method + ' ' + o.path);
    if (step === phase) {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
        destroy() { response.emit('close'); return response; },
        async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from('{"id":'); },
      });
      client = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => receive(response)); return client; }, destroy() { return client; } });
      return client as any;
    }
    const value = step === 'joined' ? { items: [{ id: 'team', name: oldName }] } : step === 'self' ? { id: 'self' }
      : step === 'team' ? { id: 'team', name: oldName } : { items: [{ id: 'own', teamId: 'team', personId: 'self', isModerator: true }] };
    return new Writable({ write(_chunk, _encoding, done) { done(); },
      final(done) { queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done(); },
    }) as any;
  });
  calls.length = 0;
  const before = f.engine.snapshot();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.engine.renameTeam('stubborn', 'team', f.page.revision, oldName, name);
    await until(() => consumed); t.mock.timers.tick(20000);
    assert.equal((await pending).status, phase === 'put' ? 'unknown' : 'failed');
    const count = calls.length; assert.equal((f.engine as any).publicREST.busy(), true);
    assert.throws(() => f.engine.resolveConversationAction('team-rename', 'team', 'stubborn'));
    await assert.rejects(f.engine.renameTeam('blocked', 'team', f.page.revision, oldName, name));
    assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
    f.engine.stop(); await f.engine.start('demo'); await assert.rejects(f.engine.joinedTeams()); assert.equal(calls.length, count);
  } finally { client?.emit('close'); t.mock.timers.reset(); }
  await (f.engine as any).publicREST.settled(); await until(() => !(f.engine as any).conversations.busy());
  const page = await f.engine.joinedTeams(), prepared = await f.engine.prepareTeamRename('demo-team', page.revision);
  assert.equal((await f.engine.renameTeam('fresh-demo', 'demo-team', page.revision, prepared.expectedName, name)).status, 'changed');
});
