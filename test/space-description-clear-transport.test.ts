/** MF23 existing engine/PublicREST composition: loopback only, no live clearing. */
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

const title = 'Exact résumé 😀 | inert', previous = 'Exact nonblank preimage\n  Literal | :let g:unsafe=1';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => boolean) {
  const end = performance.now() + 3000;
  while (!check() && performance.now() < end) await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(check(), 'bounded physical boundary reached');
}
async function fixture(t: TestContext, options: {
  locked?: boolean; room?: Record<string, unknown>; membership?: Record<string, unknown>;
  status?: number; ack?: (raw: Record<string, unknown>) => unknown; hold?: 'self' | 'room' | 'member' | 'put'; scopes?: string;
} = {}) {
  const locked = options.locked ?? false;
  const directory = await mkdtemp('/tmp/opencode/wbx-clear-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'INERT', scope: options.scopes ?? 'spark:all', expiresAt: Date.now() + 600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => assert.fail('No automatic refresh/replay'));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK call'));
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
    const room = { ...listed, creatorId: 'self', description: previous, isLocked: locked,
      isPublic: false, isAnnouncementOnly: false, ...options.room };
    if (path === '/v1/people/me') { step = 'self'; raw = { id: 'self' }; }
    else if (path === '/v1/rooms/group' && method === 'GET') { step = 'room'; raw = room; }
    else if (path === '/v1/memberships?roomId=group&personId=self&max=100') {
      step = 'member'; raw = { items: [{ id: 'own', personId: 'self', roomId: 'group', isModerator: locked, ...options.membership }] };
    } else {
      assert.equal(path, '/v1/rooms/group'); assert.equal(method, 'PUT'); step = 'put';
      const payload = JSON.parse(body.toString()); assert.deepEqual(Object.keys(payload), ['title', 'description']);
      assert.deepEqual(payload, { title, description: ' ' }); assert.deepEqual(Buffer.from(payload.description), Buffer.from([0x20]));
      assert.equal(req.headers['content-type'], 'application/json'); assert.equal(Number(req.headers['content-length']), body.length);
      status = options.status ?? 200;
      // Synthetic explicit empty, never a canonical real-service ACK claim.
      const ack = { ...room, description: '', privateProviderData: 'x'.repeat(20000) };
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
    markRead: async () => assert.fail('Description clear cannot issue a receipt') };
  const engine = new EditorEngine(undefined, () => source, undefined, undefined, undefined, undefined, { publicRequest: native });
  t.after(async () => {
    engine.stop(); for (const reply of replies.splice(0)) reply(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, readStatus: true, notificationPreview: true });
  await engine.select('group'); source.onHealth?.('live');
  const publications: string[] = [];
  for (const event of ['state', 'delivery', 'direct.delivery', 'notice', 'message.event']) engine.on(event, () => publications.push(event));
  return { engine, calls, publications, held: held.promise, release: () => { for (const reply of replies.splice(0)) reply(); },
    puts: () => calls.filter(c => c.method === 'PUT'),
    submit: (id = 'clear') => engine.clearSpaceDescription(id, 'group', title, previous) };
}
for (const locked of [false, true]) test(`MF23 physical ${locked ? 'moderated' : 'unmoderated'} clear uses three GETs and exact title/single-space PUT with explicit empty ACK only`, async t => {
  const f = await fixture(t, { locked }), before = f.engine.snapshot(), result = await f.submit();
  assert.equal(result.status, 'changed'); assert.equal(result.action, 'description-clear'); assert.equal(Object.hasOwn(result, 'description'), false);
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), [
    'GET /v1/people/me', 'GET /v1/rooms/group', 'GET /v1/memberships?roomId=group&personId=self&max=100', 'PUT /v1/rooms/group',
  ]);
  assert.deepEqual(f.puts()[0]!.body, Buffer.from(JSON.stringify({ title, description: ' ' })));
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.publications, []);
  await f.submit(); assert.equal(f.calls.length, 4); assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.publications, []);
});
for (const [kind, room] of Object.entries({
  public: { isPublic: true }, missingPrivate: { isPublic: undefined }, missingLock: { isLocked: undefined },
  announcement: { isAnnouncementOnly: true }, missingMode: { isAnnouncementOnly: undefined },
  team: { teamId: null }, direct: { type: 'direct' }, readonly: { isReadOnly: true },
  missingDescription: { description: undefined }, empty: { description: '' }, sentinel: { description: ' ' },
  title: { title: 'Concurrent rename' }, description: { description: 'Concurrent replacement' },
})) test(`MF23 physical ${kind} clear preflight has zero sentinel PUTs and no conversion fallback`, async t => {
  const f = await fixture(t, { room }), result = await f.submit();
  assert.equal(result.status, ['title', 'description'].includes(kind) ? 'conflict' : 'failed');
  assert.equal(f.calls.length, 2); assert.equal(f.puts().length, 0);
});
for (const locked of [false, true]) test(`MF23 physical ${locked ? 'moderated' : 'unmoderated'} clear refuses missing role, never creator authority`, async t => {
  const f = await fixture(t, { locked, membership: { isModerator: undefined } });
  assert.equal((await f.submit()).status, 'failed'); assert.equal(f.calls.length, 3); assert.equal(f.puts().length, 0);
});
for (const [kind, patch] of Object.entries({
  omitted: { description: undefined }, null: { description: null }, sentinel: { description: ' ' },
  whitespace: { description: '\n ' }, nonempty: { description: previous },
  id: { id: 'foreign' }, type: { type: 'direct' }, title: { title: title + ' ' }, lockChanged: { isLocked: true },
  missingLock: { isLocked: undefined }, public: { isPublic: true }, missingPrivate: { isPublic: undefined },
  announcement: { isAnnouncementOnly: true }, missingMode: { isAnnouncementOnly: undefined }, team: { teamId: null },
  readonly: { isReadOnly: true }, errors: { errors: [] },
})) test(`MF23 physical ${kind} clear ACK stays unknown and interlocks every metadata action without alternate empty/sentinel replay`, async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, ...patch }) }), before = f.engine.snapshot();
  assert.equal((await f.submit()).status, 'unknown'); assert.deepEqual(f.engine.snapshot(), before);
  const count = f.calls.length;
  await assert.rejects(f.engine.renameSpace('rename', 'group', title, 'Other'));
  await assert.rejects(f.engine.describeSpace('describe', 'group', title, previous, 'Other'));
  await assert.rejects(f.engine.setSpaceLocked('lock', 'group', title, false, true));
  await assert.rejects(f.engine.setSpaceAnnouncementOnly('announcement', 'group', title, false, true));
  await assert.rejects(f.engine.prepareSpaceDescription('group')); await assert.rejects(f.submit('fresh'));
  assert.equal(f.calls.length, count);
  assert.throws(() => f.engine.resolveConversationAction('description-clear', 'group', 'forged'));
  f.engine.resolveConversationAction('description-clear', 'group', 'clear');
  assert.equal((await f.submit()).status, 'unknown'); assert.equal(f.puts().length, 1); assert.deepEqual(f.publications, []);
});
for (const status of [204, 302, 401, 403, 409, 429, 500]) test(`MF23 clear HTTP ${status} is classified once without verification GET/refresh/redirect/retry`, async t => {
  const f = await fixture(t, { status }), result = await f.submit();
  assert.equal(result.status, [401, 403, 409, 429].includes(status) ? 'failed' : 'unknown');
  assert.equal((await f.submit()).status, result.status); assert.equal(f.calls.length, 4); assert.equal(f.puts().length, 1);
});
for (const step of ['self', 'room', 'member', 'put'] as const) test(`MF23 clear ${step} grant loss is refused before admission or unknown after sentinel PUT`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.submit();
  await f.held; Object.assign(f.engine, { grantedScope: 'spark:rooms_write' }); f.release();
  assert.equal((await pending).status, step === 'put' ? 'unknown' : 'failed'); assert.equal(f.puts().length, step === 'put' ? 1 : 0);
});
test('MF23 clear missing known-grant set refuses before physical reads', async t => {
  const f = await fixture(t, { scopes: 'spark:rooms_read spark:rooms_write' });
  await assert.rejects(f.submit()); assert.equal(f.calls.length, 0);
});
for (const step of ['member', 'put'] as const) test(`MF23 clear selection leave-return at ${step} invalidates without late main state/role publication`, async t => {
  const f = await fixture(t, { hold: step }), pending = f.submit();
  await f.held; await f.engine.select('other'); await f.engine.select('group'); f.release();
  await assert.rejects(pending); assert.equal(f.puts().length, step === 'put' ? 1 : 0);
  if (step === 'put') await assert.rejects(f.submit('fresh'));
});
test('MF23 clear session replacement after sentinel PUT cannot install late empty state/roles/alerts', async t => {
  const f = await fixture(t, { hold: 'put' }), pending = f.submit();
  await f.held; f.engine.stop(); await f.engine.start('demo'); f.release();
  await assert.rejects(pending); assert.equal(f.engine.snapshot().rooms.some(r => r.id === 'group'), false); assert.equal(f.puts().length, 1);
});
test('MF23 clear retained results discard raw provider profile and credentials', async t => {
  const f = await fixture(t); await f.submit();
  const retained = JSON.stringify((f.engine as any).conversations.requests.get('clear'));
  assert.ok(Buffer.byteLength(retained) < 16384); assert.doesNotMatch(retained, /privateProviderData|INERT/);
});
test('MF23 clear response overflow stays unknown without fallback PUT or main publication', async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, oversize: 'x'.repeat(262145) }) }), before = f.engine.snapshot();
  assert.equal((await f.submit()).status, 'unknown'); assert.deepEqual(f.engine.snapshot(), before);
  await assert.rejects(f.submit('fresh')); assert.equal(f.puts().length, 1);
});
for (const phase of ['GET', 'PUT']) test(`MF23 physical clear ${phase} deadline retains PublicREST admission through stubborn native close/reset`, async t => {
  let consumed = false, client!: EventEmitter, puts = 0;
  const rest = new PublicREST((options: any, receive: any) => {
    if (options.method === 'PUT') puts++;
    if (options.method === phase) {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
        destroy() { response.emit('close'); return response; },
        async *[Symbol.asyncIterator]() { consumed = true; yield Buffer.from('{"id":'); },
      });
      client = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => receive(response)); return client; }, destroy() { return client; } });
      return client as any;
    }
    const value = options.path === '/v1/people/me' ? { id: 'self' } : options.path === '/v1/rooms/group'
      ? { id: 'group', type: 'group', title, description: previous, isLocked: false, isPublic: false, isAnnouncementOnly: false }
      : { items: [{ id: 'own', roomId: 'group', personId: 'self', isModerator: false }] };
    return new Writable({ write(_chunk, _encoding, done) { done(); },
      final(done) { queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }))); done(); },
    }) as any;
  });
  const owner = new ConversationActions(rest, new RoomMembers(), () => ({ token: 'INERT', scopes: ['spark:all'], expiresAt: Date.now() + 600000 }),
    (signal, token) => authenticatedSelf(rest, signal, token));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = owner.clearDescription('physical', 'group', title, previous, () => true);
    await until(() => consumed); t.mock.timers.tick(20000);
    assert.equal((await pending).outcome.status, phase === 'PUT' ? 'unknown' : 'failed');
    assert.equal(puts, phase === 'PUT' ? 1 : 0); assert.equal(rest.busy(), true); assert.equal(owner.busy(), true);
    assert.throws(() => owner.resolve('description-clear:group', 'physical')); owner.reset();
    await assert.rejects(owner.prepareDirect('peer', () => true));
  } finally { client?.emit('close'); t.mock.timers.reset(); }
  await rest.settled(); await until(() => !owner.busy());
});
