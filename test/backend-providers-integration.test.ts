import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession, type OAuthConfig } from '../src/oauth.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexSelectedPeopleProvider } from '../src/people-selected.js';
import { WebexUpcomingMeetingsProvider } from '../src/upcoming-meetings.js';
import { SenderNames } from '../src/sender-names.js';
import type { PeopleProviderOptions } from '../src/people-status.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { AccessCredentials } from '../src/auth-protocol.js';
import { spacesCacheAccount } from '../src/spaces-cache.js';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
async function eventually(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await turn();
  assert.ok(check(), 'bounded synthetic provider work settled');
}
const room = { id: 'direct', title: 'Synthetic direct', type: 'direct' as const, lastActivity: '' };
const scope = 'spark:all spark:kms meeting:schedules_read';
interface Source extends ReadStatusSource { closes: number; access?: AccessCredentials }
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-backend-providers-'), config = join(directory, 'config.json');
  const profile: OAuthConfig = { clientId: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: scope.split(' ') };
  await writeFile(config, JSON.stringify({ oauth: { ...profile, clientSecret: 'synthetic-secret' } }), { mode: 0o600 });
  let now = Date.now(), access = { token: 'SYNTHETIC-FIRST', expiresAt: Date.now() + 3600_000, scope };
  let failedAuth = false, failedFactory = false, forbidden = 0, cacheCreates = 0, senderReads = 0, authorizations = 0;
  let nextSource: { gate: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> } | undefined;
  const pending: ReturnType<typeof deferred>[] = [], sources: Source[] = [], people: WebexSelectedPeopleProvider[] = [];
  const peopleOptions: PeopleProviderOptions[] = [], agenda: WebexUpcomingMeetingsProvider[] = [], stores: MessagingStore[] = [];
  const oauths: OAuthSession[] = [], requests: { path: string; token: string }[] = [], failures = new Set<string>();
  const holds = new Map<string, { gate: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> }>();
  t.mock.method(net.Socket.prototype, 'connect', function () { forbidden++; throw Error('SOCKET FORBIDDEN'); });
  const fetcher = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), path = url.pathname;
    assert.equal(url.origin, 'https://webexapis.com'); assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined);
    requests.push({ path, token: new Headers(init?.headers).get('Authorization')! });
    const held = holds.get(path); holds.delete(path); held?.started.resolve(); if (held) await held.gate.promise;
    if (failures.has(path)) return new Response('', { status: 503 });
    if (path === '/v1/rooms') return Response.json({ items: [room] });
    if (path === '/v1/messages') return Response.json({ items: [{ id: 'message', roomId: 'direct', personId: 'author',
      text: 'Synthetic history', created: new Date(now).toISOString() }] });
    if (path === '/v1/people/me') return Response.json({ id: 'self', type: 'person' });
    if (path === '/v1/memberships') return Response.json({ items: [{ roomId: 'direct', personId: 'self' }, { roomId: 'direct', personId: 'peer' }] });
    if (path === '/v1/people/peer') return Response.json({ id: 'peer', type: 'person', status: 'active', displayName: 'Synthetic Peer' });
    assert.equal(path, '/v1/meetings');
    return Response.json({ items: [{ id: 'meeting', title: 'Synthetic agenda', meetingType: 'meetingSeries', state: 'active',
      start: new Date(now + 120_000).toISOString(), end: new Date(now + 3600_000).toISOString(), webLink: 'https://example.webex.com/meet/synthetic' }] });
  });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => {
    authorizations++; if (failedAuth) throw Error('PRIVATE synthetic authorization failure'); return access;
  });
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  const peopleClose = t.mock.method(WebexSelectedPeopleProvider.prototype, 'close');
  const agendaClose = t.mock.method(WebexUpcomingMeetingsProvider.prototype, 'close');
  const agendaSession = t.mock.method(WebexUpcomingMeetingsProvider.prototype, 'setSession');
  const namesSession = t.mock.method(SenderNames.prototype, 'setSession');
  const names: SenderNames[] = [];
  const namesObserve = SenderNames.prototype.observe;
  t.mock.method(SenderNames.prototype, 'observe', function (this: SenderNames, ids: readonly unknown[]) {
    if (!names.includes(this)) names.push(this); return namesObserve.call(this, ids);
  });
  const owners = { now: () => now, senderFetch: (async () => {
    senderReads++; return Response.json({ id: 'author', displayName: 'Synthetic Author' });
  }) as typeof fetch, messaging(api: ConstructorParameters<typeof MessagingStore>[0], poll: number, mode: 'demo' | 'live') {
    assert.equal(this, owners); assert.equal(poll, 4000);
    if (failedFactory) throw Error('PRIVATE synthetic store construction failure');
    const store = new MessagingStore(api, poll, mode); stores.push(store); return store;
  } };
  const authorization = { create(value: OAuthConfig, secret: string) {
    assert.equal(this, authorization); const oauth = new OAuthSession(value, secret); oauths.push(oauth); return oauth;
  }, share: async () => assert.fail('SHARING FORBIDDEN') };
  const cache = { create() { cacheCreates++; return assert.fail('CACHE OPTED OUT'); }, account: spacesCacheAccount };
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), function () {
    const plan = nextSource; nextSource = undefined;
    const source: Source = { closes: 0, onRooms() {}, onFailure() {},
      async start(value) {
        source.access = value; plan?.started.resolve(); if (plan) await plan.gate.promise;
        source.onRooms([{ ...room, lastActivity: '2026-11-01T12:00:00.000Z', lastSeen: '2026-11-01T11:00:00.000Z' }]);
      },
      async markRead() { assert.fail('RECEIPT FORBIDDEN'); }, close() { source.closes++; } };
    sources.push(source); return source;
  }, options => { peopleOptions.push(options); assert.equal(options.fetcher, fetcher);
    const provider = new WebexSelectedPeopleProvider(options); people.push(provider); return provider;
  }, options => { assert.equal(options.fetcher, fetcher); const provider = new WebexUpcomingMeetingsProvider(options); agenda.push(provider); return provider;
  }, authorization, cache, owners);
  const packets: any[] = [], deliveries: unknown[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  engine.on('delivery', value => deliveries.push(value)); let id = 0;
  const call = async (method: string, params = {}) => {
    const key = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }));
    const reply = packets.find(value => value.id === key); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  t.after(async () => { for (const gate of pending) gate.resolve(); engine.stop(); await rpc.close(); await rm(directory, { recursive: true, force: true }); });
  await send('hello', { version: 1 });
  return { engine, config, send, call, people, peopleOptions, agenda, stores, oauths, sources, names, requests, failures, deliveries,
    peopleClose, agendaClose, agendaSession, namesSession, profile,
    start: (options = {}) => send('session.start', { mode: 'live', config, readStatus: true, peopleStatus: true,
      upcomingMeetings: true, senderNames: true, ...options }),
    renew() { access = { ...access, token: 'SYNTHETIC-RENEWED' }; return send('auth.refresh'); },
    advance(ms: number) { now += ms; },
    counts: () => ({ forbidden, cacheCreates, senderReads, authorizations }),
    failAuth(value: boolean) { failedAuth = value; }, failFactory(value: boolean) { failedFactory = value; },
    hold(path: string) { const gate = deferred(), started = deferred(); pending.push(gate); holds.set(path, { gate, started });
      return { started: started.promise, release: gate.resolve }; },
    holdSource() { const gate = deferred(), started = deferred(); pending.push(gate); nextSource = { gate, started };
      return { started: started.promise, release: gate.resolve }; },
  };
}

test('ordinary provider RPC opt-outs and demo never construct optional sources or perform live work', async t => {
  const f = await fixture(t);
  assert.equal(f.sources.length + f.people.length + f.agenda.length + f.stores.length, 0);
  await f.start({ mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  assert.equal(f.engine.snapshot().ready, true); assert.equal(f.engine.snapshot().messages.length > 0, true);
  assert.equal(f.requests.length + f.sources.length + f.people.length + f.agenda.length, 0);
  await f.send('session.stop'); await f.start({ readStatus: false, peopleStatus: false, upcomingMeetings: false, senderNames: false });
  await f.send('rooms.select', { roomId: 'direct' });
  assert.equal(f.engine.snapshot().messages[0]!.text, 'Synthetic history');
  assert.equal(f.sources.length + f.people.length + f.agenda.length, 0); assert.equal(f.counts().senderReads, 0);
  assert.deepEqual(f.deliveries, []); assert.equal(f.counts().forbidden + f.counts().cacheCreates, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC provider demo and opt-outs', optionalProviders: 0, demoLiveRequests: 0, implicitWrites: 0 }));
});

test('ordinary provider RPC startup and renewal preserve distinct source lifetimes and current credentials', async t => {
  const f = await fixture(t); await f.start();
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  await f.send('rooms.select', { roomId: 'direct' }); await f.send('people.lookup');
  await eventually(() => f.counts().senderReads === 1);
  assert.equal(f.engine.snapshot().peopleStatus.presence, 'active'); assert.equal(f.engine.snapshot().readStatus, 'ready');
  assert.equal(f.engine.snapshot().messages[0]!.text, 'Synthetic history');
  const setNames = f.namesSession.mock.callCount(), setAgenda = f.agendaSession.mock.callCount(), oldSource = f.sources[0]!;
  const oldNames = f.names[0], owner = f.peopleOptions[0]!.readOwner;
  f.advance(61_000); await f.renew(); await eventually(() => f.sources.length === 2 && f.engine.snapshot().readStatus === 'ready');
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  assert.equal(oldSource.closes, 1); assert.equal(f.sources[1]!.access!.token, 'SYNTHETIC-RENEWED');
  assert.equal(f.people.length, 1); assert.equal(f.peopleOptions[0]!.readOwner, owner);
  assert.ok(!f.peopleClose.mock.calls.some(call => call.this === f.people[0]), 'same-grant renewal retains the People provider/cache');
  assert.equal(f.agenda.length, 1); assert.equal(f.agendaSession.mock.callCount(), setAgenda + 1);
  assert.equal(f.namesSession.mock.callCount(), setNames, 'token-only renewal does not reset name denial/cache authority');
  assert.equal(f.names[0], oldNames); assert.equal(f.peopleOptions[0]!.token(), 'SYNTHETIC-RENEWED');
  await f.send('rooms.list'); await f.send('people.lookup');
  assert.equal(f.requests.filter(request => request.path === '/v1/rooms').at(-1)!.token, 'Bearer SYNTHETIC-RENEWED');
  assert.equal(f.requests.filter(request => request.path === '/v1/people/peer').at(-1)!.token, 'Bearer SYNTHETIC-RENEWED');
  assert.equal(f.requests.filter(request => request.path === '/v1/people/me').length, 1, 'renewal does not discard the cached self identity');
  assert.equal(f.requests.filter(request => request.path === '/v1/meetings').at(-1)!.token, 'Bearer SYNTHETIC-RENEWED');
  assert.equal(f.stores.length, 1); assert.deepEqual(f.deliveries, []); assert.equal(f.counts().forbidden, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC provider startup and renewal', readSources: 2, presenceProviders: 1,
    physicalPeopleOwnerShared: true, agendaProviders: 1, tokenOnlyNameResets: 0, storeReplacements: 0 }));
});

test('ordinary provider RPC feature failures preserve ready history and explicit reads/renewal recover without new lifecycle owners', async t => {
  const f = await fixture(t); f.failures.add('/v1/people/me'); f.failures.add('/v1/meetings');
  await f.start(); await eventually(() => f.engine.snapshot().upcomingMeetings.state !== 'loading');
  await f.send('rooms.select', { roomId: 'direct' }); await f.send('people.lookup');
  f.sources[0]!.onFailure('worker-exit');
  assert.equal(f.engine.snapshot().readStatus, 'failed'); assert.equal(f.engine.snapshot().peopleStatus.presence, 'unknown');
  await f.send('rooms.select', { roomId: 'direct' }); assert.equal(f.engine.snapshot().messages[0]!.text, 'Synthetic history');
  const readCount = f.sources.length, requestCount = f.requests.length; await turn();
  assert.equal(f.sources.length, readCount); assert.equal(f.requests.length, requestCount, 'no immediate application retry on failure');
  f.failures.clear(); f.advance(61_000);
  await f.send('people.lookup'); await f.send('meetings.upcoming');
  assert.equal(f.engine.snapshot().peopleStatus.presence, 'active'); assert.equal(f.engine.snapshot().upcomingMeetings.state, 'ready');
  await f.renew(); await eventually(() => f.engine.snapshot().readStatus === 'ready');
  assert.equal(f.agenda.length, 1); assert.equal(f.stores.length, 1); assert.equal(f.sources.length, 2);
  assert.deepEqual(f.deliveries, []); assert.equal(f.counts().forbidden, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC provider feature failure recovery', readyHistory: true, explicitRecovery: true,
    agendaProviders: 1, storeReplacements: 0, implicitWrites: 0 }));
});

for (const failure of ['authorization', 'construction'] as const) test(`ordinary provider RPC ${failure} startup failure closes owners and explicit restart recovers`, async t => {
  const f = await fixture(t);
  if (failure === 'authorization') f.failAuth(true); else f.failFactory(true);
  const reply = await f.call('session.start', { mode: 'live', readStatus: true, peopleStatus: true,
    upcomingMeetings: true, config: f.config });
  assert.equal(reply.error.code, -32012); assert.doesNotMatch(JSON.stringify(reply), /PRIVATE/);
  assert.equal(f.engine.snapshot().state, 'failed'); const count = f.counts().authorizations; await turn();
  assert.equal(f.counts().authorizations, count);
  assert.equal(f.stores.length, 0);
  if (failure === 'construction') {
    assert.equal(f.sources[0]!.closes, 1);
    assert.ok(f.peopleClose.mock.calls.some(call => call.this === f.people[0]));
    assert.ok(f.agendaClose.mock.calls.some(call => call.this === f.agenda[0]));
  } else assert.equal(f.sources.length + f.people.length + f.agenda.length, 0);
  f.failAuth(false); f.failFactory(false); await f.start(); await f.send('rooms.select', { roomId: 'direct' });
  assert.equal(f.engine.snapshot().messages[0]!.text, 'Synthetic history');
  assert.equal(f.stores.length, 1); assert.equal(f.counts().forbidden, 0); assert.deepEqual(f.deliveries, []);
  t.diagnostic(JSON.stringify({ workflow: 'RPC provider startup recovery ' + failure, automaticRetries: 0, explicitRestart: true, implicitWrites: 0 }));
});

test('ordinary provider RPC replacement fences held startup and optional results without taking feature lifecycle ownership', async t => {
  const f = await fixture(t), read = f.holdSource(), meeting = f.hold('/v1/meetings');
  const starting = f.start(); await read.started; await meeting.started;
  const oldSource = f.sources[0]!, oldPeople = f.people[0]!, oldAgenda = f.agenda[0]!;
  await f.send('session.stop'); await f.start();
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  await f.send('rooms.select', { roomId: 'direct' }); await f.send('people.lookup');
  const current = f.engine.snapshot();
  read.release(); meeting.release(); await starting; await turn();
  oldSource.onRooms([{ id: 'retired', title: 'Retired room', type: 'direct', lastActivity: '', lastSeen: '' }]); oldSource.onFailure('worker-exit');
  assert.deepEqual(f.engine.snapshot(), current, 'retired completion/callbacks cannot publish into replacement');
  assert.equal(oldSource.closes, 1); assert.ok(f.peopleClose.mock.calls.some(call => call.this === oldPeople));
  assert.ok(f.agendaClose.mock.calls.some(call => call.this === oldAgenda));
  assert.equal(f.people.length, 2); assert.equal(f.agenda.length, 2); assert.equal(f.stores.length, 2);
  assert.equal(f.peopleOptions[0]!.readOwner, f.peopleOptions[1]!.readOwner, 'engine physical People owner survives stop/start');
  assert.deepEqual(f.deliveries, []); assert.equal(f.counts().forbidden, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC provider held session replacement', retiredPublications: 0, readSources: 2,
    agendaProviders: 2, physicalPeopleOwnerShared: true, explicitHistoryWorks: true }));
});
