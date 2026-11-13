/** MF22 actual engine/PublicREST composition: injected loopback only, never preference/role writes. */
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
import type { PublicRequest } from '../src/public-rest.js';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(check(), 'bounded physical boundary reached');
}
async function session(t: TestContext, publicRequest: PublicRequest, scope = 'spark:people_read spark:rooms_read spark:memberships_read') {
  const directory = await mkdtemp('/tmp/opencode/wbx-visibility-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'INERT', scope, expiresAt: Date.now() + 600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => assert.fail('No auth refresh/replay'));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK call'));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [
    { id: 'direct', type: 'direct' as const, title: 'Retained exact destination', lastActivity: '' },
    { id: 'group', type: 'group' as const, title: 'Other room', lastActivity: '' },
  ] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [
    { id: 'history', author: 'Peer', text: 'Retained history', created: '2026-11-15T00:00:00Z' },
  ] }));
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { publicRequest });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  await engine.startSession({ mode: 'live', config, readStatus: false });
  await engine.select('direct');
  const events: string[] = [];
  for (const name of ['state', 'notice', 'message.event', 'delivery', 'direct.delivery']) engine.on(name, () => events.push(name));
  return { engine, events, access };
}
type Step = 'self' | 'room' | 'member';
async function fixture(t: TestContext, options: {
  own?: Record<string, unknown>; room?: Record<string, unknown>; status?: number;
  memberBody?: unknown; link?: string; hold?: Step; scope?: string;
} = {}) {
  const held = deferred<void>(), replies: (() => void)[] = [], calls: string[] = [];
  const own = { id: 'own', roomId: 'direct', personId: 'self', roomType: 'direct', isRoomHidden: true,
    isModerator: true, personEmail: 'private@example.invalid', privateProfile: 'x'.repeat(20000), ...options.own };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).length, 0); assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, 'Bearer INERT'); calls.push(req.method + ' ' + req.url);
    let step: Step, value: unknown;
    if (req.url === '/v1/people/me') { step = 'self'; value = { id: 'self' }; }
    else if (req.url === '/v1/rooms/direct') { step = 'room'; value = { id: 'direct', type: 'direct', ...options.room }; }
    else {
      assert.equal(req.url, '/v1/memberships?roomId=direct&personId=self&max=100'); step = 'member';
      value = options.memberBody ?? { items: [own] };
    }
    const send = () => {
      const status = step === 'member' ? options.status ?? 200 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay',
        ...(step === 'member' && options.link ? { Link: options.link } : {}) });
      res.end(status === 204 ? undefined : JSON.stringify(value));
    };
    if (options.hold === step) { replies.push(send); held.resolve(); } else send();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(async () => {
    for (const reply of replies.splice(0)) reply(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const f = await session(t, (options: any, receive: any) => {
    assert.equal(options.protocol, 'https:'); assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.agent, false);
    return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, receive);
  }, options.scope);
  return { ...f, calls, own, held: held.promise, release: () => { for (const reply of replies.splice(0)) reply(); },
    read: () => f.engine.memberVisibility('direct') };
}
for (const flag of [true, false, undefined]) test(`MF22 physical own-direct flag ${flag} uses exactly three GETs and no main-state/cache/role/alert publication`, async t => {
  const f = await fixture(t, { own: { isRoomHidden: flag } }), before = f.engine.snapshot();
  const roster = (f.engine as any).members.snapshot(), result = await f.read();
  assert.equal(result.isRoomHidden, flag ?? null); assert.equal(result.coverage, 'own-direct-membership-flag');
  assert.equal(result.roomId, 'direct'); assert.equal(result.sessionId, before.localContext!.sessionId);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 4096);
  assert.doesNotMatch(JSON.stringify(result), /privateProfile|private@|isModerator|INERT/);
  assert.deepEqual(f.calls, ['GET /v1/people/me', 'GET /v1/rooms/direct', 'GET /v1/memberships?roomId=direct&personId=self&max=100']);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual((f.engine as any).members.snapshot(), roster);
  assert.equal((f.engine as any).conversations.requests.size, 0); assert.equal((f.engine as any).conversations.uncertain.size, 0);
  assert.deepEqual(f.events, []);
  f.own.isRoomHidden = false; assert.equal((await f.read()).isRoomHidden, false); assert.equal(f.calls.length, 6);
});
for (const [kind, patch] of Object.entries({
  group: { type: 'group' }, foreign: { id: 'other' }, missingType: { type: undefined }, team: { teamId: null }, errors: { errors: [] },
})) test(`MF22 physical ${kind} direct Room proof refuses before any membership scan`, async t => {
  const f = await fixture(t, { room: patch }), before = f.engine.snapshot();
  await assert.rejects(f.read()); assert.equal(f.calls.length, 2); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const [kind, own] of Object.entries({
  foreignPerson: { personId: 'other' }, foreignRoom: { roomId: 'other' }, invalidId: { id: '' },
  groupType: { roomType: 'group' }, nullType: { roomType: null }, nullFlag: { isRoomHidden: null },
  stringFlag: { isRoomHidden: 'false' }, numberFlag: { isRoomHidden: 0 }, errors: { errors: [] },
})) test(`MF22 physical ${kind} own-membership flag refuses instead of inferring false or another person's preference`, async t => {
  const f = await fixture(t, { own }), before = f.engine.snapshot();
  await assert.rejects(f.read()); assert.equal(f.calls.length, 3); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const memberBody of [{ items: [] }, { items: [{}, {}] }, { items: null }, { items: [], errors: [] }]) {
  test('MF22 physical empty/duplicate/malformed membership response cannot supply a hidden flag', async t => {
    const f = await fixture(t, { memberBody }); await assert.rejects(f.read()); assert.equal(f.calls.length, 3);
  });
}
for (const link of ['<https://webexapis.com/v1/memberships?cursor=next>; rel="next"',
  '<https://evil.invalid/read>; rel="next"', '<https://webexapis.com/v1/memberships>; rel="prev"', 'malformed']) {
  test('MF22 physical visibility links are rejected, not followed or converted into a complete preference snapshot', async t => {
    const f = await fixture(t, { link }); await assert.rejects(f.read()); assert.equal(f.calls.length, 3);
  });
}
for (const status of [204, 302, 401, 403, 404, 429, 500]) test(`MF22 visibility HTTP ${status} never means visible or triggers redirect/auth replay/verification GET`, async t => {
  const f = await fixture(t, { status }), before = f.engine.snapshot();
  await assert.rejects(f.read()); assert.equal(f.calls.length, 3); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
});
for (const step of ['self', 'room', 'member'] as const) test(`MF22 physical visibility ${step} grant loss refuses without further reads or stale output`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.read();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:memberships_read' }); f.release();
  await assert.rejects(pending); assert.equal(f.calls.length, ['self', 'room', 'member'].indexOf(step) + 1);
});
for (const scope of ['spark:rooms_read spark:memberships_read', 'spark:people_read spark:memberships_read',
  'spark:people_read spark:rooms_read']) test('MF22 each missing known read grant refuses before physical reads; no write grant needed', async t => {
  const f = await fixture(t, { scope }); await assert.rejects(f.read()); assert.equal(f.calls.length, 0);
});
for (const step of ['self', 'room', 'member'] as const) test(`MF22 physical visibility ${step} selection leave-return invalidates the old observation`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.read();
  await f.held; await f.engine.select('group'); await f.engine.select('direct'); const before = f.engine.snapshot(); f.release();
  await assert.rejects(pending); assert.deepEqual(f.engine.snapshot(), before);
  assert.equal(f.calls.length, ['self', 'room', 'member'].indexOf(step) + 1);
});
test('MF22 physical visibility session replacement cannot refill a new account/session view', async t => {
  const f = await fixture(t, { hold: 'member' }), pending = f.read();
  await f.held; f.engine.stop(); await f.engine.start('demo'); const before = f.engine.snapshot(); f.release();
  await assert.rejects(pending); assert.deepEqual(f.engine.snapshot(), before); assert.equal(f.calls.length, 3);
});
test('MF22 physical visibility response overflow is unavailable, not missing/false or a retry', async t => {
  const f = await fixture(t, { memberBody: { items: [], oversize: 'x'.repeat(262145) } });
  await assert.rejects(f.read()); assert.equal(f.calls.length, 3); assert.deepEqual(f.events, []);
});
test('MF22 physical visibility engine refuses group/unselected/cached/revoked targets without extra reads', async t => {
  const f = await fixture(t);
  await assert.rejects(f.engine.memberVisibility('group')); await assert.rejects(f.engine.memberVisibility('unknown'));
  const store = (f.engine as any).store, rooms = store.rooms;
  store.rooms = []; // No current loaded membership; cache/list labels cannot restore admission.
  await assert.rejects(f.read()); store.rooms = rooms;
  store.revokeRoom('direct'); await assert.rejects(f.read());
  assert.equal(f.calls.length, 0);
});
for (const step of ['self', 'room', 'member'] as const) test(`MF22 physical visibility ${step} timeout/reset retains stubborn native admission until close`, async t => {
  let consumed = false, client!: EventEmitter;
  const calls: string[] = [];
  const f = await session(t, (options: any, receive: any) => {
    assert.equal(options.method, 'GET'); calls.push(options.path);
    const phase = options.path === '/v1/people/me' ? 'self' : options.path === '/v1/rooms/direct' ? 'room' : 'member';
    if (phase === step) {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
        destroy() { response.emit('close'); return response; },
        async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from('{"id":'); },
      });
      client = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => receive(response)); return client; }, destroy() { return client; } });
      return client as any;
    }
    const value = phase === 'self' ? { id: 'self' } : phase === 'room' ? { id: 'direct', type: 'direct' }
      : { items: [{ id: 'own', roomId: 'direct', personId: 'self', isRoomHidden: true }] };
    return new Writable({ write(_chunk, _encoding, done) { done(); },
      final(done) { queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done(); },
    }) as any;
  });
  const before = f.engine.snapshot();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.engine.memberVisibility('direct'); await until(() => consumed); t.mock.timers.tick(20000);
    await assert.rejects(pending); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.events, []);
    const count = calls.length; assert.equal((f.engine as any).publicREST.busy(), true);
    await assert.rejects(f.engine.memberVisibility('direct')); assert.equal(calls.length, count);
    f.engine.stop(); await f.engine.start('demo'); await f.engine.select('demo-alex');
    await assert.rejects(f.engine.memberVisibility('demo-alex')); assert.equal(calls.length, count, 'reset cannot bypass physical admission');
  } finally { client?.emit('close'); t.mock.timers.reset(); }
  await (f.engine as any).publicREST.settled();
  assert.equal((await f.engine.memberVisibility('demo-alex')).isRoomHidden, null);
});
