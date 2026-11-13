/** Bounded MF24 Team description, real engine/PublicREST with inert loopback/native streams only. */
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
import { type PublicRequest } from '../src/public-rest.js';

const expectedName = 'Exact fresh Team', old = 'Explicit raw prior\nTeam description', description = 'Changed résumé 😀\n| literal, not Ex';
const grants = ['spark:people_read', 'spark:teams_read', 'spark:team_memberships_read', 'spark:teams_write'];
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
type Phase = 'self' | 'team' | 'members' | 'put';
const phaseFor = (path: string, method: string): Phase | 'joined' => path.startsWith('/v1/teams?') ? 'joined'
  : path === '/v1/people/me' ? 'self' : path.startsWith('/v1/team/memberships?') ? 'members' : method === 'PUT' ? 'put' : 'team';
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await new Promise<void>(r => setImmediate(r));
  assert.ok(check(), 'bounded physical state reached');
}
async function session(t: TestContext, publicRequest: PublicRequest, scope = grants.join(' ')) {
  const directory = await mkdtemp('/tmp/opencode/wbx-team-description-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:teams_read'] } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'INERT', scope: grants.join(' '), expiresAt: Date.now() + 600000 }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => assert.fail('No auth replay'));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch provider'));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { publicRequest });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  await engine.startSession({ mode: 'live', config, readStatus: false });
  const page = await engine.joinedTeams(), events: string[] = [];
  Object.assign(engine, { grantedScope: scope });
  for (const event of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(event, () => events.push(event));
  return { engine, page, events };
}
async function fixture(t: TestContext, options: { team?: Record<string, unknown>; own?: Record<string, unknown>; items?: unknown[];
  failAt?: Phase; status?: number; body?: unknown; link?: string; hold?: Phase; scope?: string; malformed?: 'json' | 'utf8';
} = {}) {
  const calls: { method: string; path: string; body: string }[] = [], held = deferred<void>(), replies: (() => void)[] = [];
  const team = { id: 'team', name: expectedName, description: old, ...options.team };
  const own = { id: 'own', teamId: 'team', personId: 'self', isModerator: true, personEmail: 'private@example.invalid', ...options.own };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8'), method = req.method!, path = req.url!, phase = phaseFor(path, method);
    calls.push({ method, path, body });
    assert.equal(req.headers.authorization, 'Bearer INERT');
    if (method === 'PUT') {
      assert.equal(path, '/v1/teams/team');
      const parsed = JSON.parse(body);
      assert.ok(JSON.stringify(parsed) === JSON.stringify({ name: expectedName, description }) || body === JSON.stringify({ name: 'Separate rename' }));
      assert.equal(req.headers['content-length'], String(Buffer.byteLength(body)));
      assert.equal(req.headers['content-type'], 'application/json');
    } else { assert.equal(method, 'GET'); assert.equal(body, ''); }
    const send = () => {
      const fail = phase === (options.failAt ?? 'put'), status = fail ? options.status ?? 200 : 200;
      let value: unknown;
      if (phase === 'joined') value = { items: [{ id: 'team', name: 'Sanitized navigation label, not raw consent' }] };
      else if (phase === 'self') value = { id: 'self' };
      else if (phase === 'team') { assert.equal(path, '/v1/teams/team'); value = team; }
      else if (phase === 'members') {
        assert.equal(path, '/v1/team/memberships?teamId=team&max=100'); value = { items: options.items ?? [own] };
      } else value = { id: 'team', ...JSON.parse(body) };
      if (fail && options.body !== undefined) value = options.body;
      res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/redirect',
        ...(fail && options.link ? { Link: options.link } : {}) });
      res.end(status === 204 ? undefined : fail && options.malformed
        ? options.malformed === 'utf8' ? Buffer.from([0xff, 0xfe]) : '{' : JSON.stringify(value));
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
    prepare: () => f.engine.prepareTeamDescription('team', f.page.revision),
    send: (id = 'description-physical') => f.engine.describeTeam(id, 'team', f.page.revision, expectedName, old, description),
    rename: (id = 'rename-physical') => f.engine.renameTeam(id, 'team', f.page.revision, expectedName, 'Separate rename') };
}
test('MF24 description physical six-GET/one-PUT flow sends exact name echo+description and leaves Team cache/query/main state intact', async t => {
  const f = await fixture(t), before = f.engine.snapshot(), owner = (f.engine as any), query = structuredClone(owner.teams.joinedSlot);
  owner.teams.labels.set('team', { label: 'Retained existing cache', state: 'known', until: Date.now() + 100000 });
  const labels = structuredClone(owner.teams.labels), roster = owner.members.snapshot();
  const prep = await f.prepare(); assert.equal(prep.expectedDescription, old); assert.equal(prep.expectedName, expectedName);
  assert.equal(Object.keys(prep).length, 6); assert.ok(Buffer.byteLength(JSON.stringify(prep)) <= 16384);
  assert.equal((await f.send()).status, 'changed');
  assert.deepEqual(f.calls.map(v => v.method + ' ' + v.path), [
    'GET /v1/people/me', 'GET /v1/teams/team', 'GET /v1/team/memberships?teamId=team&max=100',
    'GET /v1/people/me', 'GET /v1/teams/team', 'GET /v1/team/memberships?teamId=team&max=100', 'PUT /v1/teams/team',
  ]);
  assert.deepEqual(owner.teams.joinedSlot, query); assert.deepEqual(owner.teams.labels, labels);
  assert.deepEqual(owner.members.snapshot(), roster); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
  await f.engine.joinedTeams(); const fresh = structuredClone(owner.teams.joinedSlot), count = f.calls.length;
  assert.equal((await f.send()).status, 'changed'); assert.equal(f.calls.length, count);
  assert.deepEqual(owner.teams.joinedSlot, fresh, 'old retained replay cannot renew/invalidate a newer joined query');
});
for (const [kind, team] of Object.entries({ foreign: { id: 'other' }, missingName: { name: undefined }, nullName: { name: null },
  unsafeName: { name: ' padded' }, error: { errors: [] }, missingDescription: { description: undefined }, nullDescription: { description: null },
  booleanDescription: { description: false }, numericDescription: { description: 1 }, arrayDescription: { description: [] },
  objectDescription: { description: {} }, unsafeDescription: { description: 'unsafe\r\n' }, oversizedDescription: { description: 'x'.repeat(1001) } })) {
  test(`MF24 description physical ${kind} raw preimage refuses before role/PUT rather than inventing empty state`, async t => {
    const f = await fixture(t, { team }); await assert.rejects(f.prepare());
    assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 4); assert.deepEqual(f.events, []);
  });
}
for (const team of [{ name: 'Concurrent rename' }, { description: 'Concurrent description' }]) test('MF24 description physical name OR description conflict refuses name echo with zero PUT', async t => {
  const f = await fixture(t, { team }); assert.equal((await f.send()).status, 'conflict'); assert.equal(f.calls.length, 2);
});
for (const own of [{ isModerator: false }, { isModerator: undefined }, { isModerator: null }, { isModerator: 'true' }, { isModerator: 1 },
  { teamId: 'other' }, { personId: 'other' }, { id: '' }, { errors: [] }]) test('MF24 description physical non-explicit/foreign/malformed own Team role cannot authorize paired write', async t => {
  const f = await fixture(t, { own }); assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
});
for (const link of ['malformed', '<https://webexapis.com/v1/team/memberships?after=next>; rel="next"', '<https://evil.invalid/read>; rel="next"']) {
  test('MF24 description physical membership Link refuses even with own moderator first; no drain/filter/fallback', async t => {
    const f = await fixture(t, { failAt: 'members', link }); assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
  });
}
for (const items of [[], [{}, {}], [{ id: 'one', teamId: 'team', personId: 'self', isModerator: true },
  { id: 'two', teamId: 'team', personId: 'self', isModerator: true }], Array.from({ length: 101 }, (_, i) => ({
    id: 'm-' + i, teamId: 'team', personId: i ? 'p-' + i : 'self', isModerator: true,
  }))]) test('MF24 description physical incomplete/duplicate/overflow membership page is not truncated into role proof', async t => {
  const f = await fixture(t, { items }); assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 3);
});
for (const body of [{}, { id: 'other', name: expectedName, description }, { id: 'team', description },
  { id: 'team', name: expectedName + ' ', description }, { id: 'team', name: expectedName }, { id: 'team', name: expectedName, description: null },
  { id: 'team', name: expectedName, description: description + ' ' }, { id: 'team', name: expectedName, description: ' ' },
  { id: 'team', name: expectedName, description, errors: [] }]) test('MF24 description physical only exact raw ID/name/description ACK confirms; ambiguity blocks BOTH metadata operations', async t => {
  const f = await fixture(t, { body }), before = f.engine.snapshot();
  assert.equal((await f.send()).status, 'unknown'); assert.equal((await f.send()).status, 'unknown');
  await assert.rejects(f.send('new-description')); await assert.rejects(f.rename());
  await assert.rejects(f.engine.prepareTeamRename('team', f.page.revision)); await assert.rejects(f.prepare());
  assert.equal(f.calls.length, 4); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
test('MF24 description physical rename uncertainty also blocks description read/write; exact resolution is action-bound and IO-free', async t => {
  const f = await fixture(t, { status: 500 }); assert.equal((await f.rename('rename-unknown')).status, 'unknown');
  await assert.rejects(f.prepare()); await assert.rejects(f.send()); assert.equal(f.calls.length, 4);
  assert.throws(() => f.engine.resolveConversationAction('team-describe', 'team', 'rename-unknown'));
  f.engine.resolveConversationAction('team-rename', 'team', 'rename-unknown');
  assert.equal((await f.send('older-description')).status, 'unknown');
  assert.throws(() => f.engine.resolveConversationAction('team-describe', 'other', 'older-description'));
  f.engine.resolveConversationAction('team-describe', 'team', 'older-description');
  assert.equal((await f.send('newer-description')).status, 'unknown');
  assert.throws(() => f.engine.resolveConversationAction('team-describe', 'team', 'older-description'));
  await assert.rejects(f.rename('must-remain-blocked')); assert.equal(f.calls.length, 12);
  assert.equal((await f.send('older-description')).status, 'unknown'); assert.equal(f.calls.length, 12);
});
for (const status of [204, 302, 400, 401, 403, 404, 409, 429, 500]) test(`MF24 description physical PUT HTTP ${status} one-shot refusal/unknown without redirect/replay/verification`, async t => {
  const f = await fixture(t, { status }); assert.equal((await f.send()).status, [204, 302, 500].includes(status) ? 'unknown' : 'failed');
  assert.equal(f.calls.length, 4); assert.deepEqual(f.events, []);
});
for (const scope of grants) test(`MF24 description physical missing known ${scope} grant refuses before protected reads`, async t => {
  const f = await fixture(t, { scope: grants.filter(v => v !== scope).join(' ') });
  await assert.rejects(f.prepare()); await assert.rejects(f.send()); assert.equal(f.calls.length, 0);
});
test('MF24 description physical preflight role cannot be lent from preparation after demotion', async t => {
  const f = await fixture(t); await f.prepare(); f.own.isModerator = false;
  assert.equal((await f.send()).status, 'failed'); assert.equal(f.calls.length, 6);
});
for (const phase of ['self', 'team', 'members', 'put'] as const) {
  for (const invalidation of ['grant', 'query'] as const) test(`MF24 description physical ${phase} ${invalidation} loss rechecks before next step; after PUT remains unknown`, async t => {
    const f = await fixture(t, { hold: phase }), pending = f.send(), before = f.engine.snapshot();
    await f.held;
    if (invalidation === 'grant') Object.assign(f.engine, { grantedScope: 'spark:teams_read' });
    else (f.engine as any).teams.reset();
    f.release(); assert.equal((await pending).status, phase === 'put' ? 'unknown' : 'failed');
    assert.equal(f.calls.length, ['self', 'team', 'members', 'put'].indexOf(phase) + 1);
    assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
  });
}
test('MF24 description physical old-session exact ACK cannot populate new ledger/cache/query', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.send();
  await f.held; f.engine.stop(); await f.engine.start('demo'); const before = f.engine.snapshot(); f.release();
  await assert.rejects(pending); assert.deepEqual(f.engine.snapshot(), before); assert.equal(f.calls.length, 4);
  assert.equal((f.engine as any).conversations.requests.size, 0);
});
for (const malformed of ['json', 'utf8'] as const) test(`MF24 description physical ${malformed} ACK cannot settle exact description from name alone`, async t => {
  const f = await fixture(t, { malformed }); assert.equal((await f.send()).status, 'unknown'); assert.equal(f.calls.length, 4);
});
for (const phase of ['team', 'members', 'put'] as const) {
  for (const failure of ['link', 'bytes'] as const) test(`MF24 description physical ${phase} ${failure} overflow/refusal never yields truncated authority or confirmation`, async t => {
    const f = await fixture(t, { failAt: phase, ...(failure === 'link' ? { link: '<https://evil.invalid/read>; rel="next"' }
      : { body: { overflow: 'x'.repeat(262145) } }) });
    assert.equal((await f.send()).status, phase === 'put' ? 'unknown' : 'failed');
    assert.equal(f.calls.length, phase === 'put' ? 4 : phase === 'members' ? 3 : 2);
  });
}
for (const phase of ['self', 'team', 'members', 'put'] as const) {
  for (const prepare of [false, true]) {
    if (prepare && phase === 'put') continue;
    test(`MF24 description physical ${prepare ? 'preparation' : 'submission'} ${phase} logical timeout/reset retains stubborn native admission until close`, async t => {
      let consumed = false, client!: EventEmitter; const calls: string[] = [];
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
        const value = step === 'joined' ? { items: [{ id: 'team', name: expectedName }] } : step === 'self' ? { id: 'self' }
          : step === 'team' ? { id: 'team', name: expectedName, description: old } : { items: [{ id: 'own', teamId: 'team', personId: 'self', isModerator: true }] };
        return new Writable({ write(_c, _e, done) { done(); }, final(done) {
          queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done();
        } }) as any;
      });
      calls.length = 0; const owner = f.engine as any;
      t.mock.timers.enable({ apis: ['setTimeout'] });
      try {
        const pending = prepare ? f.engine.prepareTeamDescription('team', f.page.revision)
          : f.engine.describeTeam('stubborn', 'team', f.page.revision, expectedName, old, description);
        await until(() => consumed); t.mock.timers.tick(20000);
        if (prepare) await assert.rejects(pending);
        else assert.equal(((await pending) as any).status, phase === 'put' ? 'unknown' : 'failed');
        const count = calls.length;
        assert.equal(owner.publicREST.busy(), true);
        if (prepare) assert.equal(owner.conversations.requests.size, 0);
        assert.throws(() => f.engine.resolveConversationAction('team-describe', 'team', 'stubborn'));
        await assert.rejects(f.engine.prepareTeamRename('team', f.page.revision));
        await assert.rejects(f.engine.renameTeam('blocked', 'team', f.page.revision, expectedName, 'Separate rename'));
        f.engine.stop(); await f.engine.start('demo'); await assert.rejects(f.engine.joinedTeams()); assert.equal(calls.length, count);
      } finally { client?.emit('close'); t.mock.timers.reset(); }
      await owner.publicREST.settled(); await until(() => !owner.conversations.busy());
      const joined = await f.engine.joinedTeams(), prep = await f.engine.prepareTeamDescription('demo-team', joined.revision);
      assert.equal((await f.engine.describeTeam('fresh', 'demo-team', joined.revision, prep.expectedName, prep.expectedDescription, description)).status, 'changed');
    });
  }
}
for (const phase of ['team', 'members', 'put'] as const) test(`MF24 description physical ${phase} chunk-read ceiling never permits partial raw preimage/role/ACK`, async t => {
  const f = await session(t, (o: any, receive: any) => {
    const step = phaseFor(o.path, o.method);
    const value = step === 'joined' ? { items: [{ id: 'team', name: expectedName }] } : step === 'self' ? { id: 'self' }
      : step === 'team' ? { id: 'team', name: expectedName, description: old } : { items: [{ id: 'own', teamId: 'team', personId: 'self', isModerator: true }] };
    const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
      destroy() { response.emit('close'); return response; },
      async *[Symbol.asyncIterator]() {
        if (step === phase) for (let i = 0; i < 1025; i++) yield Buffer.from(' ');
        else yield Buffer.from(JSON.stringify(value));
        queueMicrotask(() => response.emit('close'));
      },
    });
    const client = Object.assign(new EventEmitter(), {
      end() { queueMicrotask(() => receive(response)); return client; }, destroy() { queueMicrotask(() => client.emit('close')); return client; },
    }); return client as any;
  });
  const before = f.engine.snapshot(), result = await f.engine.describeTeam('chunks', 'team', f.page.revision, expectedName, old, description);
  assert.equal(result.status, phase === 'put' ? 'unknown' : 'failed'); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
