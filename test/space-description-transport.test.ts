/** MF23 existing engine/PublicREST composition with loopback-only transport injection. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers, authenticatedSelf } from '../src/room-members.js';
import { PublicREST } from '../src/public-rest.js';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import type { ReadStatusSource } from '../src/read-status.js';

const title = 'Unchanged résumé 😀', previous = 'Exact old description\n  Indentation';
const text = 'New description 😀\n  Literal <@all> | :let g:unsafe=1';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await tick();
  assert.ok(check(), 'bounded inert boundary reached');
}
async function fixture(t: TestContext, options: {
  status?: number; ack?: (raw: Record<string, unknown>) => unknown; room?: Record<string, unknown>;
  hold?: 'self' | 'room' | 'member' | 'put'; scopes?: string;
} = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-description-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'INERT', scope: options.scopes ?? 'spark:all', expiresAt: Date.now() + 600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK calls'));
  const listed = { id: 'group', type: 'group' as const, title, lastActivity: '2026-11-01T12:00:00Z' };
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ ...listed },
    { id: 'other', title: 'Other', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{
    id: 'history', author: 'Peer', text: 'Retained history', created: listed.lastActivity,
  }] }));
  const calls: { path: string; method: string; body: Buffer }[] = [], held = deferred<void>(), replies: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), path = req.url!, method = req.method!;
    calls.push({ path, method, body }); assert.equal(req.headers.authorization, 'Bearer INERT');
    let step: 'self' | 'room' | 'member' | 'put', raw: unknown, status = 200;
    if (path === '/v1/people/me') { step = 'self'; raw = { id: 'self' }; }
    else if (path === '/v1/rooms/group' && method === 'GET') {
      step = 'room'; raw = { ...listed, isLocked: false, description: previous, ...options.room };
    } else if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      step = 'member'; raw = { items: [{ id: 'own', roomId: 'group', personId: 'self', isModerator: false }] };
    } else {
      assert.equal(path, '/v1/rooms/group'); assert.equal(method, 'PUT'); step = 'put';
      const payload = JSON.parse(body.toString());
      assert.deepEqual(Object.keys(payload), ['title', 'description']); assert.equal(payload.title, title);
      assert.equal(req.headers['content-type'], 'application/json'); assert.equal(Number(req.headers['content-length']), body.length);
      status = options.status ?? 200;
      const ack = { ...listed, title: payload.title, description: payload.description, ignoredPrivateProfile: 'x'.repeat(20000) };
      raw = options.ack ? options.ack(ack) : ack;
    }
    if (method === 'GET') assert.equal(body.length, 0);
    const reply = () => {
      res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
      res.end(status === 204 ? undefined : JSON.stringify(raw));
    };
    if (options.hold === step) { replies.push(reply); held.resolve(); } else reply();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const native = (input: any, receive: (value: any) => void) => {
    assert.equal(input.protocol, 'https:'); assert.equal(input.hostname, 'webexapis.com'); assert.equal(input.agent, false);
    return request({ ...input, protocol: 'http:', hostname: '127.0.0.1', port }, receive);
  };
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {}, close() {},
    markRead: async () => assert.fail('Description edit cannot issue a receipt') };
  const engine = new EditorEngine(undefined, () => source, undefined, undefined, undefined, undefined, { publicRequest: native });
  t.after(async () => {
    engine.stop(); for (const reply of replies.splice(0)) reply(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, readStatus: true, notificationPreview: true });
  await engine.select('group'); source.onHealth?.('live');
  const deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  return { engine, calls, deliveries, source, listed, held: held.promise, release: () => { for (const reply of replies.splice(0)) reply(); },
    puts: () => calls.filter(c => c.method === 'PUT'), prepare: () => engine.prepareSpaceDescription('group'),
    submit: (id = 'description', value = text) => engine.describeSpace(id, 'group', title, previous, value) };
}
test('MF23 physical description preparation is three reads; submit repeats proof then one exact two-field UTF-8 PUT', async t => {
  const f = await fixture(t), before = f.engine.snapshot(), snapshot = await f.prepare();
  assert.equal(snapshot.expectedDescription, previous); assert.equal(snapshot.expectedTitle, title);
  assert.equal(snapshot.sessionId, before.localContext!.sessionId); assert.equal(f.puts().length, 0);
  const result = await f.submit();
  assert.equal(result.status, 'changed'); assert.equal(result.description, text);
  const preflight = ['GET /v1/people/me', 'GET /v1/rooms/group', 'GET /v1/memberships?roomId=group&personId=self&max=100'];
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), [...preflight, ...preflight, 'PUT /v1/rooms/group']);
  assert.deepEqual(f.puts()[0]!.body, Buffer.from(JSON.stringify({ title, description: text })));
  assert.deepEqual(f.engine.snapshot(), before, 'preparation/ACK install no main state, title, history, cache, activity or notifications');
  assert.deepEqual(f.deliveries, []);
  const count = f.calls.length; await f.submit(); assert.equal(f.calls.length, count, 'exact replay returns evidence without publication or request');
});
for (const [kind, patch] of Object.entries({
  id: { id: 'foreign' }, group: { type: 'direct' }, title: { title: 'Concurrent rename' }, missing: { description: undefined },
  normalized: { description: text.replace('\n  ', '\n') }, errors: { errors: [] },
})) test(`MF23 physical ${kind} description ACK is unknown before installation and interlocks rename`, async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, ...patch }) }), before = f.engine.snapshot();
  assert.equal((await f.submit()).status, 'unknown');
  assert.deepEqual(f.engine.snapshot(), before);
  await assert.rejects(f.submit('fresh', 'Different text'));
  await assert.rejects(f.engine.renameSpace('bypass', 'group', title, 'Must not rename'));
  assert.equal(f.puts().length, 1);
  assert.throws(() => f.engine.resolveConversationAction('describe', 'group', 'forged'));
  f.engine.resolveConversationAction('describe', 'group', 'description');
  assert.equal((await f.submit()).status, 'unknown', 'resolution never rewrites evidence');
});
for (const [kind, room] of Object.entries({
  missing: { description: undefined }, null: { description: null }, oversized: { description: 'x'.repeat(1001) },
  unsafe: { description: 'bad\rline' }, title: { title: 'Changed title' }, description: { description: 'Changed description' },
})) test(`MF23 physical ${kind} preimage is refused/conflicted without a title-echo PUT`, async t => {
  const f = await fixture(t, { room });
  assert.equal((await f.submit()).status, ['title', 'description'].includes(kind) ? 'conflict' : 'failed');
  assert.equal(f.puts().length, 0); assert.equal(f.calls.length, 2);
});
for (const status of [204, 302, 401, 403, 409, 429, 500]) test(`MF23 physical description HTTP ${status} is classified once with no redirect/refresh/retry`, async t => {
  const f = await fixture(t, { status }), result = await f.submit();
  assert.equal(result.status, [401, 403, 409, 429].includes(status) ? 'failed' : 'unknown');
  assert.equal((await f.submit()).status, result.status); assert.equal(f.puts().length, 1);
});
for (const step of ['self', 'room', 'member', 'put'] as const) test(`MF23 description ${step} grant loss refuses before admission or stays unknown after PUT`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.submit();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:rooms_write' }); f.release();
  assert.equal((await pending).status, step === 'put' ? 'unknown' : 'failed');
  assert.equal(f.puts().length, step === 'put' ? 1 : 0);
});
test('MF23 description selection leave-and-return after PUT cannot publish success or release its interlock', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.submit();
  await f.held; await f.engine.select('other'); await f.engine.select('group'); f.release();
  await assert.rejects(pending); assert.equal(f.engine.snapshot().room!.title, title);
  await assert.rejects(f.engine.renameSpace('bypass', 'group', title, 'No new title')); assert.equal(f.puts().length, 1);
});
test('MF23 description session replacement after PUT cannot install late data into the new session', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.submit();
  await f.held; f.engine.stop(); await f.engine.start('demo'); f.release();
  await assert.rejects(pending);
  assert.equal(f.engine.snapshot().rooms.some(room => room.id === 'group'), false); assert.equal(f.puts().length, 1);
});
test('MF23 description snapshots become unavailable on selection changes during read preparation, without PUT', async t => {
  const f = await fixture(t, { hold: 'member' }), pending = f.prepare();
  await f.held; await f.engine.select('other'); f.release();
  await assert.rejects(pending); assert.equal(f.puts().length, 0);
});
test('MF23 retained description results drop full provider profile data and credentials before retention', async t => {
  const f = await fixture(t); await f.submit();
  const retained = JSON.stringify((f.engine as any).conversations.requests.get('description'));
  assert.ok(Buffer.byteLength(retained) <= 16384); assert.doesNotMatch(retained, /ignoredPrivateProfile|INERT/);
});
test('MF23 actual title-echo response byte overflow is unknown; its room interlock prevents another mutation', async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, tooLarge: 'x'.repeat(262145) }) });
  assert.equal((await f.submit()).status, 'unknown');
  await assert.rejects(f.engine.renameSpace('bypass', 'group', title, 'No mutation'));
  assert.equal(f.puts().length, 1);
});
test('MF23 physical title-echo deadline retains PublicREST/conversation admission through stubborn native close and reset', async t => {
  let put = false, consumed = false, client!: EventEmitter;
  const rest = new PublicREST((options: any, receive: any) => {
    if (options.method === 'PUT') {
      put = true;
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
        destroy() { response.emit('close'); return response; },
        async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from('{"id":'); },
      });
      client = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => receive(response)); return client; }, destroy() { return client; } });
      return client as any;
    }
    const value = options.path === '/v1/people/me' ? { id: 'self' } : options.path === '/v1/rooms/group'
      ? { id: 'group', type: 'group', title, description: previous, isLocked: false }
      : { items: [{ id: 'own', roomId: 'group', personId: 'self', isModerator: false }] };
    return new Writable({ write(_chunk, _encoding, done) { done(); },
      final(done) { queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done(); },
    }) as any;
  });
  const owner = new ConversationActions(rest, new RoomMembers(), () => ({ token: 'INERT', scopes: ['spark:all'], expiresAt: Date.now() + 600000 }),
    (signal, token) => authenticatedSelf(rest, signal, token));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = owner.describe('physical', 'group', title, previous, text, () => true);
    await until(() => put && consumed); t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, 'unknown');
    assert.equal(rest.busy(), true); assert.equal(owner.busy(), true);
    assert.throws(() => owner.resolve('describe:group', 'physical'));
    owner.reset(); await assert.rejects(owner.prepareDirect('peer', () => true));
  } finally { client?.emit('close'); t.mock.timers.reset(); }
  await rest.settled(); await until(() => !owner.busy());
});
