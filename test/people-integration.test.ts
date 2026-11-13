import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { parseEditorOperation, parseEditorRequest } from '../src/editor-protocol.js';
import { WebexSelectedPeopleProvider, validSelectedPeopleStatus, emptyPeopleStatus } from '../src/people-selected.js';
import { PEOPLE_LIMITS } from '../src/people-status.js';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const rooms = [{ id: 'direct-1', type: 'direct' as const, title: 'Synthetic One', lastActivity: '' },
  { id: 'direct-2', type: 'direct' as const, title: 'Synthetic Two', lastActivity: '' },
  { id: 'group-1', type: 'group' as const, title: 'Synthetic Group', lastActivity: '' }];
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const wire = (id: number, method: string, params: object = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
const openRoom = async (engine: EditorEngine, id: string) => { await engine.select(id); return engine.lookupPeople(); };
function response(url: string): Response {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://webexapis.com');
  if (parsed.pathname === '/v1/people/me') return json({ id: 'self-1', type: 'person', customStatus: 'PRIVATE-SELF' });
  if (parsed.pathname === '/v1/memberships') {
    assert.equal(parsed.searchParams.get('max'), '3');
    const roomId = parsed.searchParams.get('roomId')!;
    assert.ok(['direct-1', 'direct-2'].includes(roomId));
    return json({ items: [{ roomId, personId: 'self-1', roomType: 'direct' }, { roomId, personId: roomId === 'direct-1' ? 'peer-1' : 'peer-2', roomType: 'direct' }] });
  }
  if (parsed.pathname === '/v1/people') return json({ items: parsed.searchParams.get('id')!.split(',').map(id =>
    ({ id, type: 'person', status: 'active', displayName: 'Synthetic Name' })) });
  assert.match(parsed.pathname, /^\/v1\/people\/peer-[12]$/);
  return json({ id: parsed.pathname.split('/').at(-1), type: 'person', status: 'active', displayName: 'Synthetic\nName\u202e',
    lastActivity: '2026-11-09T11:59:00Z', customStatus: 'PRIVATE-CUSTOM', emails: ['PRIVATE-EMAIL'] });
}
async function fixture(t: TestContext, options: { enabled?: boolean; scopes?: string; fetcher?: typeof fetch; timeoutMs?: number;
  clock?: () => number; lifetimeMs?: number } = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-people-fixture-'), config = join(directory, 'fixture.json');
  // Only a private synthetic test document, never installed/user configuration.
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-fixture-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  let factories = 0, now = NOW, forbidden = 0;
  const access = { token: 'SYNTHETIC-PRIVATE-TOKEN', expiresAt: Date.now() + (options.lifetimeMs ?? 3600_000), scope: options.scopes ?? 'spark:people_read spark:memberships_read' };
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('ACTUAL NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rooms }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async (room: string) => ({ items: [{ id: `message-${room}`, author: 'Synthetic', created: '2026-11-09T11:00:00Z', text: 'Synthetic message' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { throw new Error('MUTATION FORBIDDEN'); });
  const calls: { url: string; signal: AbortSignal }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(init!.method, 'GET'); assert.equal(init!.redirect, 'error'); assert.equal(init!.body, undefined);
    calls.push({ url: String(input), signal: init!.signal as AbortSignal });
    return options.fetcher ? options.fetcher(input, init) : response(String(input));
  };
  const engine = new EditorEngine(async () => { throw new Error('BROWSER FORBIDDEN'); }, () => { throw new Error('SDK FORBIDDEN'); }, settings => {
    factories++; return new WebexSelectedPeopleProvider({ ...settings, fetcher, now: options.clock ?? (() => now), timeoutMs: options.timeoutMs });
  }, undefined, undefined, undefined, { now: options.clock ?? (() => now) });
  const states: ReturnType<EditorEngine['snapshot']>[] = [];
  engine.on('state', state => { assert.equal(validSelectedPeopleStatus(state.peopleStatus), true, JSON.stringify(state.peopleStatus)); states.push(state); });
  t.after(async () => { engine.stop(); assert.equal(forbidden, 0); await rm(directory, { recursive: true, force: true }); });
  await engine.start('live', config, false, options.enabled ?? true);
  return { engine, calls, access, states, config, factories: () => factories, advance: (ms: number) => { now += ms; } };
}

test('session opt-in and no-argument lookup are strictly parsed; arbitrary identity/room/grant parameters are rejected', () => {
  const start = (params: object) => parseEditorOperation(parseEditorRequest(wire(1, 'session.start', { mode: 'demo', ...params })));
  assert.deepEqual(start({}), { method: 'session.start', params: { mode: 'demo', config: undefined, readStatus: false, peopleStatus: false, upcomingMeetings: false, spacesCache: false } });
  assert.equal(start({ peopleStatus: true }).method, 'session.start');
  for (const value of [null, 0, 1, 'true', [], {}]) assert.throws(() => start({ peopleStatus: value }));
  assert.deepEqual(parseEditorOperation(parseEditorRequest(wire(2, 'people.lookup'))), { method: 'people.lookup', params: {} });
  for (const params of [{ personId: 'peer-2' }, { roomId: 'direct-2' }, { scopes: ['spark:all'] }, { token: 'PRIVATE' }, { refresh: true }]) {
    assert.throws(() => parseEditorOperation(parseEditorRequest(wire(2, 'people.lookup', params))));
  }
});

test('presence is off by default, creates no provider, and never reads identity even with spark:all', async t => {
  const f = await fixture(t, { enabled: false, scopes: 'spark:all' });
  const before = f.engine.snapshot();
  f.engine.setPeopleSpaces(['direct-1']); f.engine.setPeopleSpaces([]);
  assert.deepEqual(f.engine.snapshot(), before, 'disabled relevance reports must not manufacture state revisions');
  await openRoom(f.engine, 'direct-1'); assert.equal((await f.engine.lookupPeople()).capability, 'off');
  assert.equal(f.factories(), 0); assert.equal(f.calls.length, 0); assert.equal(f.engine.snapshot().peopleStatus.customStatus, 'unsupported');
  await assert.rejects(f.engine.start('live', f.config, false, true), /Disconnect/);
});

test('missing people/membership grants expose exact required scope and never probe identity', async t => {
  const f = await fixture(t, { scopes: 'spark:people_read' });
  await openRoom(f.engine, 'direct-1'); const value = await f.engine.lookupPeople();
  assert.equal(value.capability, 'scope-required'); assert.equal(value.requiredScope, 'spark:memberships_read'); assert.equal(f.calls.length, 0);
  const p = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:memberships_read'], token: () => { throw new Error('FORBIDDEN'); },
    fetcher: async () => { throw new Error('FORBIDDEN'); } });
  p.selectRoom(rooms[0]); assert.equal((await p.lookup()).requiredScope, 'spark:people_read'); p.close();
});

test('an opted-in selected direct open reads only self, the exact membership pair, and that peer; no custom text/IDs leak', async t => {
  const f = await fixture(t, { scopes: 'spark:all' }); assert.equal(f.calls.length, 0);
  await openRoom(f.engine, 'group-1'); assert.equal(f.calls.length, 0); assert.equal(f.engine.snapshot().peopleStatus.reason, 'not-direct');
  await openRoom(f.engine, 'direct-1'); const value = f.engine.snapshot().peopleStatus;
  assert.equal(value.state, 'fresh'); assert.equal(value.presence, 'active'); assert.equal(value.roomId, 'direct-1');
  assert.equal(value.displayName, 'Synthetic Name'); assert.equal(value.customStatus, 'unsupported');
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/v1/people/me', '/v1/memberships', '/v1/people/peer-1']);
  assert.equal(new URL(f.calls[1]!.url).searchParams.get('roomId'), 'direct-1');
  assert.ok(!JSON.stringify(value).includes('peer-1')); assert.ok(!JSON.stringify(f.states).includes('PRIVATE'));
  assert.equal(f.engine.snapshot().historyLatest, true, 'existing known-latest snapshot remains intact');
  await f.engine.lookupPeople(); await f.engine.history(); await f.engine.rooms(); assert.equal(f.calls.length, 3, 'history/list/cache reads never trigger people polling');
});

test('presence projection ages honestly without causing reads; a lookup respects membership/presence TTLs', async t => {
  const f = await fixture(t); await openRoom(f.engine, 'direct-1');
  f.advance(PEOPLE_LIMITS.freshMs); assert.equal(f.engine.snapshot().peopleStatus.state, 'stale'); assert.equal(f.calls.length, 3);
  await f.engine.lookupPeople(); assert.equal(f.calls.length, 4); assert.equal(f.calls.filter(c => c.url.endsWith('/me')).length, 1);
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  f.advance(PEOPLE_LIMITS.staleMs); assert.equal(f.engine.snapshot().peopleStatus.presence, 'unknown');
  assert.equal(f.engine.snapshot().peopleStatus.reason, 'expired'); assert.equal(f.calls.length, 4);
});

test('same-grant token renewal preserves selected/viewport observations and their scheduled refresh without another viewport report', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  await openRoom(f.engine, 'direct-1');
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(2000); await tick();
  const before = f.engine.snapshot(), reads = f.calls.length, factories = f.factories();
  assert.ok(before.peopleViewport!.every(value => value.state === 'fresh'));
  f.access.token = 'RENEWED-SYNTHETIC-TOKEN';
  f.access.expiresAt += 3600_000;
  f.access.scope = ' spark:memberships_read  spark:people_read ';
  await f.engine.refreshAuth();
  assert.deepEqual(f.engine.snapshot().peopleViewport, before.peopleViewport, 'renewal must not lose an unchanged native viewport');
  assert.deepEqual(f.engine.snapshot().peopleStatus, before.peopleStatus, 'renewal must not flicker the selected peer to unknown');
  assert.equal(f.factories(), factories, 'same-account/grant renewal is not a new People data lifetime');
  assert.equal(f.calls.length, reads, 'renewal itself never retries optional reads');
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  t.mock.timers.tick(2000); await tick();
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.observedAt! > before.peopleViewport![0]!.observedAt!),
    'the existing viewport keeps making progress without another native report');
});

test('a held periodic selected-peer refresh retains stale known presence instead of loading/unknown flicker', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const held = deferred<Response>();
  let hold = false;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    hold && String(input).endsWith('/peer-1') ? held.promise : response(String(input)) });
  await openRoom(f.engine, 'direct-1');
  const observedAt = f.engine.snapshot().peopleStatus.observedAt;
  hold = true;
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  assert.equal(f.engine.snapshot().peopleStatus.state, 'stale');
  assert.equal(f.engine.snapshot().peopleStatus.presence, 'active');
  assert.equal(f.engine.snapshot().peopleStatus.observedAt, observedAt);
  held.resolve(response('https://webexapis.com/v1/people/peer-1')); await tick();
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
});

test('membership incompleteness/errors/ambiguity never become a guessed peer or invoke peer details', async t => {
  let mode = 'incomplete';
  const f = await fixture(t, { fetcher: async input => {
    const url = new URL(String(input)); if (url.pathname !== '/v1/memberships') return response(String(input));
    const roomId = url.searchParams.get('roomId')!;
    if (mode === 'incomplete') return json({ items: [{ roomId, personId: 'self-1' }, { roomId, personId: 'peer-1' }] }, 200, { link: '<https://private.invalid>; rel="next"' });
    if (mode === 'ambiguous') return json({ items: [{ roomId, personId: 'self-1' }, { roomId, personId: 'peer-1' }, { roomId, personId: 'peer-2' }] });
    return json({ items: [{ roomId, personId: 'self-1' }, { roomId: 'wrong-room', personId: 'peer-1' }] });
  } });
  for (const next of ['incomplete', 'ambiguous', 'wrong-room']) {
    mode = next; f.advance(60_000); await openRoom(f.engine, 'direct-1');
    assert.equal(f.engine.snapshot().peopleStatus.presence, 'unknown');
  }
  assert.equal(f.calls.filter(c => /\/people\/peer-/.test(c.url)).length, 0);
  assert.ok(f.calls.every(c => new URL(c.url).origin === 'https://webexapis.com'));
});

test('identity denial latches unavailable without repeated self/membership probes or profile disclosure', async t => {
  const f = await fixture(t, { fetcher: async () => json({ error: 'PRIVATE-POLICY' }, 403) });
  await openRoom(f.engine, 'direct-1'); assert.equal(f.engine.snapshot().peopleStatus.capability, 'unavailable');
  assert.equal(f.engine.snapshot().peopleStatus.reason, 'denied'); await f.engine.lookupPeople();
  f.advance(60_000); await openRoom(f.engine, 'direct-2'); assert.equal(f.calls.length, 1);
  assert.ok(!JSON.stringify(f.states).includes('PRIVATE'));
});

test('concurrent explicit people reads share the selected identity/presence lookup', async t => {
  const gate = deferred<Response>(), entered = deferred<void>();
  const f = await fixture(t, { fetcher: async input => {
    if (String(input).endsWith('/people/me')) { entered.resolve(); return gate.promise; } return response(String(input));
  } });
  const selecting = f.engine.select('direct-1'); await entered.promise;
  const lookups = Array.from({ length: 12 }, () => f.engine.lookupPeople()); assert.equal(f.calls.length, 1);
  gate.resolve(response('https://webexapis.com/v1/people/me')); await Promise.all([selecting, ...lookups]);
  assert.equal(f.calls.length, 3); assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
});

test('room-open/focus response never waits for an optional people service and presence settles through separate state', async t => {
  const gate = deferred<Response>(), entered = deferred<void>();
  const f = await fixture(t, { fetcher: async input => {
    if (String(input).endsWith('/people/me')) { entered.resolve(); return gate.promise; } return response(String(input));
  } });
  const selecting = f.engine.select('direct-1'); await entered.promise; await selecting;
  assert.equal(f.engine.snapshot().ready, true); assert.equal(f.engine.snapshot().peopleStatus.state, 'loading');
  gate.resolve(response('https://webexapis.com/v1/people/me')); await tick();
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh'); assert.equal(f.calls.length, 3);
});

test('RPC A -> B -> A navigation returns fresh A while optional B presence HTTP is still physically held', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>(); let held = false, released = false;
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    if (String(input).endsWith('/people/peer-2')) { held = true; return gate.promise; }
    return response(String(input));
  } });
  await openRoom(f.engine, 'direct-1');
  f.engine.setPeopleSpaces(['direct-1']); // Keep A relevant while selecting B.
  t.mock.timers.tick(1000); await tick();
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id;
    await rpc.receive(wire(request, method, params));
    const reply = output.find(value => value.id === request);
    assert.ok(reply && !reply.error, method + ': ordinary correlated response succeeds');
    return reply.result;
  };
  await send('hello', { version: 1 });
  const timings: { room: string; milliseconds: number }[] = [];
  for (const room of ['direct-2', 'direct-1']) {
    const started = performance.now();
    await send('rooms.select', { roomId: room });
    timings.push({ room, milliseconds: performance.now() - started });
    await tick();
    const state = await send('state.get');
    assert.equal(held, true); assert.equal(released, false, 'navigation completes before releasing B service data');
    assert.equal(state.room.id, room); assert.equal(state.ready, true);
    assert.equal(state.messages[0].id, 'message-' + room);
  }
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  assert.equal(f.engine.snapshot().peopleStatus.roomId, 'direct-1');
  assert.equal(f.calls.filter(call => call.url.endsWith('/peer-1')).length, 1, 'fresh A does not need another HTTP read');
  const revision = f.engine.snapshot().revision;
  released = true; gate.resolve(response('https://webexapis.com/v1/people/peer-2')); await tick();
  assert.equal(f.engine.snapshot().room?.id, 'direct-1');
  assert.equal(f.engine.snapshot().revision, revision, 'late B cannot republish against selected A');
  t.diagnostic(JSON.stringify({ workflow: 'RPC presence A -> B -> A', timings, returnAReads: 0, BPhysicallyHeldAtReturn: held }));
});

test('RPC presence failure/backoff/recovery leaves ready history and navigation independent', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  let failed = false;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    failed && String(input).endsWith('/people/peer-1') ? json({}, 503) : response(String(input)) });
  await openRoom(f.engine, 'direct-1');
  const fresh = f.engine.snapshot();
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  await rpc.receive(wire(1, 'hello', { version: 1 }));
  failed = true;
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  const stale = f.engine.snapshot();
  assert.equal(stale.peopleStatus.state, 'stale'); assert.equal(stale.peopleStatus.reason, 'failed');
  assert.equal(stale.peopleStatus.observedAt, fresh.peopleStatus.observedAt);
  assert.equal(stale.ready, true); assert.deepEqual(stale.messages, fresh.messages);
  const reads = f.calls.length;
  await rpc.receive(wire(2, 'people.lookup'));
  assert.equal(output.find(value => value.id === 2).result.state, 'stale');
  assert.equal(f.calls.length, reads, 'an explicit read is not a negative-cache bypass');
  failed = false;
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  await rpc.receive(wire(3, 'state.get'));
  const recovered = output.find(value => value.id === 3).result;
  assert.equal(recovered.peopleStatus.state, 'fresh');
  assert.ok(recovered.peopleStatus.observedAt > fresh.peopleStatus.observedAt!);
  assert.equal(recovered.room.id, 'direct-1'); assert.deepEqual(recovered.messages, fresh.messages);
  assert.equal(f.factories(), 1);
  assert.equal(f.calls.length, reads + 1, 'recovery reuses the verified roster, without a retry burst');
  t.diagnostic(JSON.stringify({ workflow: 'RPC presence source recovery', states: ['fresh', 'stale', 'fresh'],
    backoffBypassReads: f.calls.length - reads - 1, providerOwners: f.factories() }));
});

test('bounded REST room-list refresh does not revoke selected-DM presence refresh authority', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  await openRoom(f.engine, 'direct-1');
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rooms.filter(room => room.id !== 'direct-1') }));
  await f.engine.rooms();
  assert.equal(f.engine.snapshot().rooms.some(room => room.id === 'direct-1'), false);
  assert.equal(f.engine.snapshot().room?.id, 'direct-1');
  assert.equal(f.calls.length, 3);
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  assert.equal(f.calls.length, 4);
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  assert.equal(f.engine.snapshot().peopleStatus.roomId, 'direct-1');
  assert.equal(f.engine.snapshot().ready, true);
});

test('RPC session replacement clears observations, retains draining admission, then new viewport progresses', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gates = [deferred<Response>(), deferred<Response>()]; let memberships = 0;
  const f = await fixture(t, { clock: Date.now, fetcher: async input => String(input).includes('/memberships?') && memberships++ < 2
    ? gates[memberships - 1]!.promise : response(String(input)) });
  const output: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(wire(request, method, params));
    const reply = output.find(value => value.id === request);
    assert.ok(reply && !reply.error, method); return reply.result;
  };
  await send('hello', { version: 1 });
  await send('people.viewport', { roomIds: ['direct-1', 'direct-2'] });
  t.mock.timers.tick(1); await tick();
  const oldSession = f.engine.snapshot().localContext!.sessionId;
  assert.equal(f.calls.length, 3);
  await send('session.stop');
  f.access.token = 'OTHER-SYNTHETIC-TOKEN';
  await send('session.start', { mode: 'live', config: f.config, peopleStatus: true });
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, oldSession);
  assert.equal(f.engine.snapshot().peopleViewport, undefined);
  t.mock.timers.tick(2000);
  await send('people.viewport', { roomIds: ['direct-1', 'direct-2'] });
  t.mock.timers.tick(1); await tick();
  assert.equal(f.calls.length, 3, 'replacement cannot start HTTP through two draining slots');
  const revision = f.engine.snapshot().revision;
  gates.forEach((gate, i) => gate.resolve(response(`https://webexapis.com/v1/memberships?roomId=direct-${i + 1}&max=3`)));
  await tick();
  assert.equal(f.engine.snapshot().revision, revision, 'old physical settlement is not new-session observation evidence');
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.observedAt === undefined));
  t.mock.timers.tick(PEOPLE_LIMITS.failureMs + 1); await tick();
  const current = await send('state.get');
  assert.ok(current.peopleViewport.every((value: { state: string }) => value.state === 'fresh'));
  assert.equal(current.room, null); assert.deepEqual(current.messages, []);
  t.diagnostic(JSON.stringify({ workflow: 'RPC presence session replacement', drainingReads: 2,
    latePublications: 0, recoveredRows: current.peopleViewport.length, providerSources: f.factories() }));
});

test('room switch cancels stale identity read and ignores its late success without affecting the new room', async t => {
  const gate = deferred<Response>(), entered = deferred<void>();
  const f = await fixture(t, { fetcher: async input => {
    if (String(input).endsWith('/people/me')) { entered.resolve(); return gate.promise; } return response(String(input));
  } });
  const selecting = f.engine.select('direct-1'); await entered.promise;
  await f.engine.select('group-1'); await selecting;
  assert.equal(f.calls[0]!.signal.aborted, true); const revision = f.engine.snapshot().revision;
  gate.resolve(response('https://webexapis.com/v1/people/me')); await tick();
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.engine.snapshot().peopleStatus.roomId, 'group-1');
  assert.equal(f.engine.snapshot().peopleStatus.reason, 'not-direct'); assert.equal(f.calls.length, 1);
});

test('disconnect cancels a selected peer read and late provider data cannot republish or resurrect presence', async t => {
  const gate = deferred<Response>(), entered = deferred<void>();
  const f = await fixture(t, { fetcher: async input => {
    if (String(input).endsWith('/people/peer-1')) { entered.resolve(); return gate.promise; } return response(String(input));
  } });
  const selecting = f.engine.select('direct-1'); await entered.promise; f.engine.stop(); await selecting;
  const revision = f.engine.snapshot().revision; gate.resolve(response('https://webexapis.com/v1/people/peer-1')); await tick();
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.engine.snapshot().peopleStatus.capability, 'off');
  assert.equal(f.calls.at(-1)!.signal.aborted, true);
});

test('identity deadline returns unavailable rather than remaining loading and keeps abandoned native admission bounded', async t => {
  const pending: ReturnType<typeof deferred<Response>>[] = [];
  const f = await fixture(t, { timeoutMs: 10, fetcher: async () => { const gate = deferred<Response>(); pending.push(gate); return gate.promise; } });
  await openRoom(f.engine, 'direct-1'); assert.equal(f.engine.snapshot().peopleStatus.reason, 'timeout');
  assert.equal(f.engine.snapshot().peopleStatus.state, 'unavailable');
  f.advance(1000); await openRoom(f.engine, 'direct-2'); assert.equal(f.engine.snapshot().peopleStatus.reason, 'timeout');
  f.advance(1000); await openRoom(f.engine, 'direct-1'); assert.equal(f.engine.snapshot().peopleStatus.reason, 'busy'); assert.equal(f.calls.length, 2);
  pending.forEach(gate => gate.resolve(response('https://webexapis.com/v1/people/me'))); await tick();
});

test('identity Retry-After cooldown survives selection changes without an early read', async t => {
  const f = await fixture(t, { fetcher: async () => json({}, 429, { 'retry-after': '3600' }) });
  await openRoom(f.engine, 'direct-1'); const retryAt = f.engine.snapshot().peopleStatus.retryAt!;
  f.advance(60_000); await openRoom(f.engine, 'direct-2'); assert.equal(f.calls.length, 1);
  assert.equal(f.engine.snapshot().peopleStatus.retryAt, retryAt);
});

test('periodic presence refresh reads only the selected direct peer and stops on group selection/disconnect', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now }); await openRoom(f.engine, 'direct-1');
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs - 1); await tick(); assert.equal(f.calls.length, 3);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.calls.length, 4); assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  assert.ok(f.calls.every(c => !c.url.includes('peer-2')));
  assert.equal(f.calls.filter(c => c.url.includes('/memberships')).length, 1);
  assert.equal(f.calls.filter(c => c.url.endsWith('/me')).length, 1);
  await f.engine.select('group-1'); const count = f.calls.length;
  t.mock.timers.tick(300_000); await tick(); assert.equal(f.calls.length, count);
  await openRoom(f.engine, 'direct-2'); const selected = f.calls.length;
  t.mock.timers.tick(60_000); await tick(); assert.equal(f.calls.length, selected + 1);
  assert.equal(f.engine.snapshot().peopleStatus.roomId, 'direct-2');
  f.engine.stop(); const stopped = f.calls.length, revision = f.engine.snapshot().revision;
  t.mock.timers.tick(300_000); await tick();
  assert.equal(f.calls.length, stopped); assert.equal(f.engine.snapshot().revision, revision);
});

test('visible direct-space presence loads without selecting a room, reading history, sending or acknowledging', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  f.engine.setPeopleSpaces(['direct-1', 'direct-2']);
  assert.equal(f.engine.snapshot().room, null); assert.equal(f.calls.length, 0);
  const revision = f.engine.snapshot().revision;
  t.mock.timers.tick(500); await tick();
  f.engine.setPeopleSpaces(['direct-1', 'direct-2']);
  assert.equal(f.engine.snapshot().revision, revision, 'an identical viewport does not publish or postpone its refresh');
  t.mock.timers.tick(500); await tick(); assert.equal(f.calls.length, 3);
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 5);
  const state = f.engine.snapshot();
  assert.equal(state.room, null); assert.deepEqual(state.messages, []);
  assert.deepEqual(state.peopleSpaces!.map(value => [value.roomId, value.presence, value.state]),
    [['direct-1', 'active', 'fresh'], ['direct-2', 'active', 'fresh']]);
  assert.ok(!JSON.stringify(state.peopleSpaces).includes('peer-'));
  assert.ok(!JSON.stringify(f.states).includes('PRIVATE'));
  t.mock.timers.tick(59_000); await tick(); assert.equal(f.calls.length, 6);
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 7, 'both visible peers reuse verified rosters while refreshing');
  f.engine.setPeopleSpaces([]); const count = f.calls.length;
  t.mock.timers.tick(180_000); await tick(); assert.equal(f.calls.length, count, 'hidden list stops its reads');
});

test('the whole cold visible viewport gets one status batch beyond the legacy eight-peer window', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/people/me') return json({ id: 'self-1', type: 'person' });
    if (url.pathname === '/v1/memberships') {
      const roomId = url.searchParams.get('roomId')!;
      return json({ items: [{ roomId, personId: 'self-1', roomType: 'direct' },
        { roomId, personId: 'peer-' + roomId, roomType: 'direct' }] });
    }
    return json({ items: url.searchParams.get('id')!.split(',').map(id => ({ id, type: 'person', status: 'active' })) });
  } });
  const visible = Array.from({ length: 14 }, (_, i) => ({ id: 'visible-' + i, title: 'Visible ' + i, type: 'direct' as const, lastActivity: '' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: visible }));
  await f.engine.rooms();
  f.engine.setPeopleViewport(visible.map(room => room.id));
  const revision = f.engine.snapshot().revision;
  f.engine.setPeopleViewport(visible.map(room => room.id));
  assert.equal(f.engine.snapshot().revision, revision);
  for (let i = 0; i < 14; i++) { t.mock.timers.tick(1000); await tick(); }
  assert.equal(f.engine.snapshot().peopleViewport!.length, 14);
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.state === 'fresh' && value.presence === 'active'));
  assert.equal(f.engine.snapshot().room, null);
  assert.deepEqual(f.engine.snapshot().messages, []);
  const count = f.calls.length;
  f.engine.setPeopleViewport([]);
  t.mock.timers.tick(300_000); await tick();
  assert.equal(f.calls.length, count, 'hiding the viewport stops its reads');
});
test('a pending whole-viewport status batch is not duplicated or canceled by reordered reports', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>(), starts: number[] = [];
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = String(input);
    if (new URL(url).pathname === '/v1/people') {
      starts.push(Date.now());
      return gate.promise;
    }
    if (url.includes('direct-3')) return json({ items: [{ roomId: 'direct-3', personId: 'self-1' },
      { roomId: 'direct-3', personId: 'peer-3' }] });
    if (url.endsWith('/peer-3')) return json({ id: 'peer-3', type: 'person', status: 'active' });
    return response(url);
  } });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [...rooms,
    { id: 'direct-3', type: 'direct' as const, title: 'Third', lastActivity: '' }] }));
  await f.engine.rooms();
  f.engine.setPeopleViewport(['direct-1', 'direct-2', 'direct-3']);
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 5);
  const active = f.calls.find(call => new URL(call.url).pathname === '/v1/people')!;
  f.engine.setPeopleViewport(['direct-2', 'direct-1', 'direct-3']);
  f.engine.setPeopleViewport(['direct-1', 'direct-2', 'direct-3']);
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, 5, 'all three statuses share one GET after the three rosters and self bootstrap');
  assert.deepEqual(starts, [NOW + 1000], 'one batch, not per-person starts');
  assert.equal(active.signal.aborted, false, 'a still-visible slow peer is not canceled by relevance bookkeeping');
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, 5, 'the pending batch cannot be submitted again');
  gate.resolve(response(active.url)); await tick();
  t.mock.timers.tick(1000); await tick();
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.state === 'fresh'));
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls.filter(call => call.url.endsWith('/me')).length, 1);
  assert.equal(f.calls.filter(call => new URL(call.url).pathname === '/v1/people').length, 1);
});

test('whole viewport bootstraps self once and cancels its status batch without late publications', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const self = deferred<Response>(), peers = deferred<Response>();
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = String(input);
    if (url.endsWith('/me')) return self.promise;
    if (new URL(url).pathname === '/v1/people') return peers.promise;
    return response(url);
  } });
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1000); await tick();
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, 1, 'no duplicate identity bootstrap before self completes');
  self.resolve(response('https://webexapis.com/v1/people/me')); await tick();
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, 4);
  const pending = f.calls.filter(call => new URL(call.url).pathname === '/v1/people');
  f.engine.setPeopleViewport([]);
  assert.ok(pending.every(call => call.signal.aborted));
  const count = f.calls.length;
  peers.resolve(response(pending[0]!.url));
  await tick(); const revision = f.engine.snapshot().revision;
  t.mock.timers.tick(60_000); await tick();
  assert.equal(f.calls.length, count); assert.equal(f.engine.snapshot().revision, revision);
  assert.equal(f.engine.snapshot().peopleViewport, undefined);
});

test('whole viewport observes a batch Retry-After before starting any new peer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  let limited = true;
  const f = await fixture(t, { clock: Date.now, fetcher: async input => limited && new URL(String(input)).pathname === '/v1/people'
    ? json({}, 429, { 'retry-after': '180' }) : response(String(input)) });
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, 4, 'one self read, two rosters and one status batch');
  t.mock.timers.tick(179_999); await tick();
  assert.equal(f.calls.length, 4, 'no early reads during the shared service cooldown');
  limited = false;
  t.mock.timers.tick(1001); await tick();
  assert.equal(f.calls.length, 5, 'one exact-ID batch recovers both statuses without repeating rosters');
});

test('fast cold viewport responses load all rows in one batch, not pairs separated by artificial pauses', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const starts: { id: string; at: number }[] = [];
  const visible = Array.from({ length: 8 }, (_, i) => ({ id: `batch-${i}`, title: `Batch ${i}`, type: 'direct' as const, lastActivity: '' }));
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me')) return json({ id: 'self-1', type: 'person' });
    if (url.pathname.endsWith('/memberships')) {
      const roomId = url.searchParams.get('roomId')!;
      return json({ items: [{ roomId, personId: 'self-1' }, { roomId, personId: `peer-${roomId}` }] });
    }
    const ids = url.searchParams.get('id')!.split(',');
    starts.push({ id: ids.join(','), at: Date.now() });
    return json({ items: ids.map(id => ({ id, type: 'person', status: 'active' })) });
  } });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: visible }));
  await f.engine.rooms();
  f.engine.setPeopleViewport(visible.map(room => room.id));
  t.mock.timers.tick(1); await tick();
  assert.equal(starts.length, 1);
  assert.equal(f.engine.snapshot().peopleViewport!.filter(value => value.state === 'fresh').length, 8);
  assert.deepEqual(starts[0]!.id.split(','), visible.map(room => 'peer-' + room.id));
  t.mock.timers.tick(1999); await tick();
  assert.equal(starts.length, 1, 'no more cold pairs remain to load');
  t.mock.timers.tick(58001); await tick();
  assert.equal(starts.length, 2, 'one periodic batch refreshes all eight');
  assert.deepEqual(starts.map(start => start.at), [NOW + 1, NOW + 60001]);
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.state === 'fresh'));
  assert.equal(f.calls.filter(call => call.url.endsWith('/me')).length, 1, 'both initial readers share self bootstrap');
});

test('scrolling away and back reuses fresh session observations beyond the identity window without HTTP', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const visible = Array.from({ length: 24 }, (_, i) => ({ id: `cached-${i}`, title: `Cached ${i}`, type: 'direct' as const, lastActivity: '' }));
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me')) return json({ id: 'self-1', type: 'person' });
    if (url.pathname.endsWith('/memberships')) {
      const roomId = url.searchParams.get('roomId')!;
      return json({ items: [{ roomId, personId: 'self-1' }, { roomId, personId: `peer-${roomId}` }] });
    }
    return json({ items: url.searchParams.get('id')!.split(',').map(id => ({ id, type: 'person', status: 'active' })) });
  } });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: visible }));
  await f.engine.rooms();
  const first = visible.slice(0, 8).map(room => room.id), next = visible.slice(8, 16).map(room => room.id);
  f.engine.setPeopleViewport(first);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  const observed = f.engine.snapshot().peopleViewport!;
  assert.ok(observed.every(value => value.state === 'fresh'));
  f.engine.setPeopleViewport(next);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  const calls = f.calls.length;
  f.engine.setPeopleViewport([]);
  f.engine.setPeopleViewport(first);
  assert.deepEqual(f.engine.snapshot().peopleViewport, observed, 'cached badges return synchronously, not after a reload');
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.calls.length, calls, 'scrolling is not permission to refetch still-fresh observations');
  f.engine.setPeopleViewport([]);
  t.mock.timers.tick(60_000); await tick();
  f.engine.setPeopleViewport(first);
  assert.ok(f.engine.snapshot().peopleViewport!.every(value => value.state === 'stale'), 'cached observations retain truthful freshness');
  assert.equal(f.calls.length, calls, 'hidden cached rows were not polled');
  t.mock.timers.tick(1); await tick();
  assert.ok(f.calls.length > calls, 'only visible aged rows become eligible for background refresh');
});
test('retained observations do not erase legacy visible-room relevance on an unrelated selected-room update', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  await openRoom(f.engine, 'direct-1');
  f.engine.setPeopleSpaces(['direct-1', 'direct-2']);
  t.mock.timers.tick(1000); await tick();
  assert.ok(f.engine.snapshot().peopleSpaces!.every(value => value.state === 'fresh'));
  const calls = f.calls.length;
  await f.engine.select('group-1'); await tick();
  assert.ok(f.engine.snapshot().peopleSpaces!.every(value => value.state === 'fresh'), 'only the selected peer changed, not the visible direct rows');
  assert.equal(f.calls.length, calls);
});

test('failed viewport status reads expose backoff instead of no-progress state/timer churn', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = String(input);
    return new URL(url).pathname === '/v1/people' ? json({}, 503) : response(url);
  } });
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1); await tick();
  const observed = f.engine.snapshot().peopleViewport!;
  assert.ok(observed.every(value => value.retryAt !== undefined && value.retryAt > Date.now()),
    'negative-cache deadlines must be projected to the scheduler');
  const publications = f.states.length, calls = f.calls.length;
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(2000); await tick(); }
  assert.equal(f.calls.length, calls, 'no HTTP during negative-cache backoff');
  assert.equal(f.states.length, publications, 'no-progress cached results cannot trigger repeating publications');
});

test('same-grant renewal does not duplicate cold discovery while both HTTP slots are held', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gates = [deferred<Response>(), deferred<Response>()];
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = String(input);
    if (new URL(url).pathname === '/v1/memberships') return gates[new URL(url).searchParams.get('roomId') === 'direct-1' ? 0 : 1]!.promise;
    return response(url);
  } });
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.calls.length, 3);
  await f.engine.refreshAuth();
  t.mock.timers.tick(2000);
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.calls.length, 3, 'renewal cannot create another pair of discovery requests');
  gates.forEach((gate, i) => gate.resolve(response(`https://webexapis.com/v1/memberships?roomId=direct-${i + 1}&max=3`)));
  await tick();
});

test('provider replacement retains service Retry-After without restarting optional reads', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now, fetcher: async input => {
    const url = String(input);
    return /\/people\/peer-/.test(url) ? json({}, 429, { 'retry-after': '180' }) : response(url);
  } });
  f.engine.setPeopleViewport(['direct-1']);
  t.mock.timers.tick(1); await tick();
  const calls = f.calls.length;
  await f.engine.refreshAuth();
  assert.equal(f.calls.length, calls, 'renewal starts no optional read');
  f.engine.setPeopleViewport(['direct-1']);
  t.mock.timers.tick(179_999); await tick();
  assert.equal(f.calls.length, calls, 'replacement may not reset service cooldown');
});

test('authentication failure clears room-bound viewport projection before publishing failed state', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  f.engine.setPeopleViewport(['direct-1', 'direct-2']);
  t.mock.timers.tick(1); await tick();
  t.mock.method(OAuthSession.prototype, 'refresh', async () => { throw new Error('Synthetic auth failure'); });
  await f.engine.refreshAuth();
  const state = f.engine.snapshot();
  assert.equal(state.state, 'failed'); assert.deepEqual(state.rooms, []);
  assert.equal(state.peopleViewport, undefined, 'a failed state cannot reference absent live rows');
});

for (const limited of [false, true]) test(`concurrent memberships respect status admission${limited ? ' and service cooldown' : ''}`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const slow = deferred<Response>(), calls: { url: string; at: number }[] = [];
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], now: Date.now,
    token: () => 'SYNTHETIC', fetcher: async input => {
      const url = String(input); calls.push({ url, at: Date.now() });
      if (url.includes('roomId=direct-2')) return slow.promise;
      if (url.endsWith('/peer-3')) return limited ? json({}, 429, { 'retry-after': '180' })
        : json({ id: 'peer-3', type: 'person', status: 'active' });
      if (url.includes('roomId=direct-3')) return json({ items: [
        { roomId: 'direct-3', personId: 'self-1' }, { roomId: 'direct-3', personId: 'peer-3' }] });
      return response(url);
    } });
  try {
    source.setVisibleRooms(['direct-1', 'direct-2', 'direct-3'].map(id => ({ id, type: 'direct' as const })));
    await source.lookupRoom('direct-1');
    t.mock.timers.tick(1000);
    const second = source.lookupRoom('direct-2'); await tick();
    t.mock.timers.tick(1000);
    const third = await source.lookupRoom('direct-3');
    assert.equal(third.reason, limited ? 'rate-limited' : undefined);
    slow.resolve(response('https://webexapis.com/v1/memberships?roomId=direct-2&max=3')); await tick();
    assert.equal(calls.filter(call => call.url.endsWith('/peer-2')).length, 0, 'clustered membership completion cannot bypass status pacing');
    t.mock.timers.tick(limited ? 8000 : 1000); await tick();
    const result = await second;
    assert.equal(result.reason, limited ? 'timeout' : undefined);
    const gets = calls.filter(call => /\/peer-\d$/.test(call.url));
    assert.deepEqual(gets.map(call => call.at), limited ? [NOW, NOW + 2000] : [NOW, NOW + 2000, NOW + 3000]);
    assert.ok(!gets.some(call => call.url.endsWith('/peer-2')) || !limited, 'no GET occurs during Retry-After');
  } finally { source.close(); }
});

test('visible-space protocol and engine reject arbitrary identities, duplicate/oversized sets, groups and unloaded rooms before reads', async t => {
  const parse = (params: object) => parseEditorOperation(parseEditorRequest(wire(1, 'people.spaces', params)));
  assert.deepEqual(parse({ roomIds: ['direct-1'] }), { method: 'people.spaces', params: { roomIds: ['direct-1'] } });
  for (const params of [{}, { roomIds: null }, { roomIds: ['direct-1', 'direct-1'] }, { personId: 'peer-1' },
    { roomIds: ['../secret'] }, { roomIds: Array.from({ length: 9 }, (_, i) => `direct-${i}`) }, { roomIds: [], token: 'PRIVATE' }]) {
    assert.throws(() => parse(params));
  }
  const f = await fixture(t);
  for (const ids of [['group-1'], ['unloaded'], ['direct-1', 'direct-1']]) assert.throws(() => f.engine.setPeopleSpaces(ids));
  assert.equal(f.calls.length, 0); assert.equal(f.engine.snapshot().room, null);
});

test('selected and visible identities share a bounded viewport, detach observations, and never construct a second native owner', () => {
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'],
    token: () => { throw new Error('NO TOKEN PROBE'); }, fetcher: async () => { throw new Error('NO NETWORK'); } });
  try {
    const visible = Array.from({ length: 128 }, (_, i) => ({ id: `direct-${i}`, type: 'direct' as const }));
    source.setVisibleRooms(visible); assert.equal(source.roomSnapshots().length, 128);
    source.selectRoom({ id: 'selected-outside-viewport', type: 'direct' });
    assert.equal(source.roomSnapshots().length, 129); assert.equal(source.visibleSnapshots().length, 128);
    const first = source.roomSnapshots()[0]!; first.presence = 'active';
    assert.equal(source.snapshot().presence, 'unknown', 'returned values cannot mutate cached observations');
    source.setVisibleRooms([...visible, { id: 'excess', type: 'direct' }, { id: 'excess-2', type: 'direct' }]);
    assert.equal(source.roomSnapshots().length, 129, 'oversized replacement is rejected atomically');
    source.setVisibleRooms([]); assert.equal(source.roomSnapshots().length, 1);
    source.selectRoom(undefined); assert.deepEqual(source.roomSnapshots(), []);
  } finally { source.close(); }
});

test('visible and selected reads for the same direct peer share one flight; removing a visible peer cancels late publication', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>(); let hold = true;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    hold && String(input).endsWith('/peer-1') ? gate.promise : response(String(input)) });
  f.engine.setPeopleSpaces(['direct-1', 'direct-2']);
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 3);
  await f.engine.select('direct-1'); const selected = f.engine.lookupPeople();
  assert.equal(f.calls.length, 3, 'selection borrows the same visible-peer lookup');
  hold = false; gate.resolve(response(f.calls.at(-1)!.url)); await selected; await tick();
  assert.equal(f.engine.snapshot().peopleStatus.presence, 'active');
  assert.equal(f.calls.length, 3);
  await f.engine.select('group-1');
  f.engine.setPeopleSpaces([]); const count = f.calls.length;
  t.mock.timers.tick(180_000); await tick(); assert.equal(f.calls.length, count);
});

test('visible-space ownership prunes canceled/removed rows and cannot publish a late peer or restart on disconnect', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>();
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    String(input).endsWith('/peer-1') ? gate.promise : response(String(input)) });
  f.engine.setPeopleSpaces(['direct-1']);
  t.mock.timers.tick(1000); await tick(); const old = f.calls.at(-1)!;
  f.engine.setPeopleSpaces(['direct-2']); assert.equal(old.signal.aborted, true);
  gate.resolve(response(old.url)); await tick();
  assert.ok(f.engine.snapshot().peopleSpaces!.every(value => value.roomId === 'direct-2'));
  t.mock.timers.tick(1000); await tick();
  assert.equal(f.engine.snapshot().peopleSpaces![0]!.presence, 'active');
  f.engine.stop(); const count = f.calls.length, revision = f.engine.snapshot().revision;
  t.mock.timers.tick(300_000); await tick();
  assert.equal(f.calls.length, count); assert.equal(f.engine.snapshot().revision, revision);
});

for (const mode of ['disabled', 'missing-grant', 'denied', 'rate-limited']) test(`visible-space polling respects ${mode} without scope/auth/transport expansion`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  let limited = true;
  const f = await fixture(t, { clock: Date.now, enabled: mode !== 'disabled', scopes: mode === 'missing-grant' ? 'spark:people_read' : undefined,
    fetcher: async input => mode === 'denied' ? json({}, 403)
      : mode === 'rate-limited' && limited ? json({}, 429, { 'retry-after': '180' }) : response(String(input)) });
  f.engine.setPeopleSpaces(['direct-1', 'direct-2']);
  t.mock.timers.tick(1000); await tick(); const count = f.calls.length;
  assert.equal(count, ['denied', 'rate-limited'].includes(mode) ? 1 : 0);
  t.mock.timers.tick(179_999); await tick(); assert.equal(f.calls.length, count);
  if (mode === 'rate-limited') {
    limited = false; t.mock.timers.tick(1); await tick();
    assert.equal(f.engine.snapshot().peopleSpaces![1]!.state, 'fresh');
  }
});

test('visible-room metadata transitions revoke presence without selecting/fetching or retaining peer identity', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  f.engine.setPeopleSpaces(['direct-1']);
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 3);
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rooms.map(room => ({ ...room, type: 'group' as const })) }));
  await f.engine.rooms(); assert.equal(f.engine.snapshot().peopleSpaces, undefined);
  t.mock.timers.tick(180_000); await tick(); assert.equal(f.calls.length, 3);
  assert.equal(f.engine.snapshot().room, null);
});

test('periodic and explicit refresh share one in-flight read without queuing a catch-up', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>(); let hold = false;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    hold && String(input).endsWith('/peer-1') ? gate.promise : response(String(input)) });
  await openRoom(f.engine, 'direct-1'); hold = true;
  t.mock.timers.tick(60_000); await tick(); assert.equal(f.calls.length, 4);
  const pending = Array.from({ length: 6 }, () => f.engine.lookupPeople());
  t.mock.timers.tick(1000); await tick(); assert.equal(f.calls.length, 4);
  hold = false; gate.resolve(response(f.calls.at(-1)!.url)); await Promise.all(pending); await tick();
  assert.equal(f.calls.length, 4);
  t.mock.timers.tick(59_999); await tick(); assert.equal(f.calls.length, 4);
  t.mock.timers.tick(1); await tick(); assert.equal(f.calls.length, 5);
});

for (const target of ['identity', 'presence']) test(`periodic refresh honors ${target} Retry-After with no early reads`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  let limited = true;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    limited && (target === 'identity' ? String(input).endsWith('/me') : String(input).endsWith('/peer-1'))
      ? json({}, 429, { 'retry-after': '180' }) : response(String(input)) });
  await openRoom(f.engine, 'direct-1'); const count = f.calls.length;
  assert.equal(f.engine.snapshot().peopleStatus.retryAt, NOW + 180_000);
  t.mock.timers.tick(179_999); await tick(); assert.equal(f.calls.length, count);
  limited = false; t.mock.timers.tick(1); await tick();
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  assert.equal(f.calls.length, count + (target === 'identity' ? 3 : 1));
});

for (const mode of ['disabled', 'missing-grant', 'denied']) test(`periodic refresh never probes a ${mode} session`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now, enabled: mode !== 'disabled',
    scopes: mode === 'missing-grant' ? 'spark:people_read' : undefined,
    fetcher: mode === 'denied' ? async () => json({}, 403) : undefined });
  await openRoom(f.engine, 'direct-1');
  const count = f.calls.length; assert.equal(count, mode === 'denied' ? 1 : 0);
  t.mock.timers.tick(600_000); await tick(); assert.equal(f.calls.length, count);
  await f.engine.refreshAuth();
  t.mock.timers.tick(600_000); await tick();
  assert.equal(f.calls.length, count, 'same-grant renewal cannot retry disabled/missing-grant/denied presence');
});

test('room changes fence a pending periodic response and only the new selection retains a timer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const gate = deferred<Response>(); let hold = false;
  const f = await fixture(t, { clock: Date.now, fetcher: async input =>
    hold && String(input).endsWith('/peer-1') ? gate.promise : response(String(input)) });
  await openRoom(f.engine, 'direct-1'); hold = true;
  t.mock.timers.tick(60_000); await tick(); const old = f.calls.at(-1)!;
  assert.match(old.url, /peer-1$/);
  const selecting = openRoom(f.engine, 'direct-2'); await tick();
  t.mock.timers.tick(1000); await selecting; assert.equal(old.signal.aborted, true);
  const revision = f.engine.snapshot().revision, count = f.calls.length;
  gate.resolve(response(old.url)); await tick(); assert.equal(f.engine.snapshot().revision, revision);
  t.mock.timers.tick(60_000); await tick();
  assert.equal(f.calls.length, count + 1); assert.equal(f.engine.snapshot().peopleStatus.roomId, 'direct-2');
});

test('same-grant renewal preserves periodic presence; explicit replacement still cancels its old timer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now });
  await openRoom(f.engine, 'direct-1'); const count = f.calls.length;
  await f.engine.refreshAuth(); assert.equal(f.calls.length, count);
  const refresh = t.mock.method(OAuthSession.prototype, 'refresh', async () => { throw new Error('AUTO REFRESH FORBIDDEN'); });
  t.mock.timers.tick(120_000); await tick(); assert.equal(f.calls.length, count + 1, 'only the normal due status observation runs');
  await f.engine.lookupPeople(); const next = f.calls.length;
  f.engine.stop(); await f.engine.start('live', f.config, false, true);
  t.mock.timers.tick(60_000); await tick(); assert.equal(f.calls.length, next, 'old session cannot read in its replacement');
  assert.equal(refresh.mock.callCount(), 0);
});

test('expired credentials stop periodic presence reads without starting auth or extending grants', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  const f = await fixture(t, { clock: Date.now, lifetimeMs: 60_000 });
  await openRoom(f.engine, 'direct-1'); const count = f.calls.length, scope = f.access.scope;
  const refresh = t.mock.method(OAuthSession.prototype, 'refresh', async () => { throw new Error('REFRESH FORBIDDEN'); });
  t.mock.timers.tick(300_000); await tick();
  assert.equal(f.calls.length, count); assert.equal(refresh.mock.callCount(), 0); assert.equal(f.access.scope, scope);
});

test('background token refresh retains observations; actual grant loss invalidates them without a lookup', async t => {
  const f = await fixture(t); await openRoom(f.engine, 'direct-1'); const count = f.calls.length, scope = f.access.scope;
  await f.engine.refreshAuth(); assert.equal(f.calls.length, count); assert.equal(f.access.scope, scope);
  assert.equal(f.engine.snapshot().peopleStatus.state, 'fresh');
  assert.equal(f.factories(), 1);
  f.access.scope = 'spark:rooms_read'; await f.engine.refreshAuth();
  assert.equal(f.engine.snapshot().peopleStatus.capability, 'scope-required'); assert.equal(f.calls.length, count);
});

test('snapshot projection never selects people ownership or starts a lookup', async t => {
  const f = await fixture(t); await openRoom(f.engine, 'direct-1');
  const selection = t.mock.method(WebexSelectedPeopleProvider.prototype, 'selectRoom'), calls = f.calls.length;
  for (let i = 0; i < 20; i++) assert.equal(f.engine.snapshot().peopleStatus.roomId, 'direct-1');
  assert.equal(selection.mock.callCount(), 0);
  assert.equal(f.calls.length, calls);
});

test('selected-room metadata transitions revoke people ownership before publication, without an implicit lookup', async t => {
  const f = await fixture(t); await openRoom(f.engine, 'direct-1');
  const count = f.calls.length, start = f.states.length;
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rooms.map(room => ({ ...room, type: 'group' as const })) }));
  await f.engine.rooms();
  const changed = f.states.slice(start).filter(state => state.room?.type === 'group');
  assert.ok(changed.length > 0);
  assert.ok(changed.every(state => state.peopleStatus.roomId === 'direct-1' && state.peopleStatus.reason === 'not-direct'));
  assert.equal(f.calls.length, count);
});

test('RPC opt-in is forwarded, rejects enumeration, and the shutdown barrier blocks people reads while leave waits', async t => {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [], gate = deferred<void>();
  const starts: unknown[][] = []; let lookups = 0, visible = 0;
  t.mock.method(engine, 'start', async (...args: Parameters<EditorEngine['start']>) => { starts.push(args); });
  t.mock.method(engine, 'lookupPeople', async () => { lookups++; return emptyPeopleStatus(); });
  t.mock.method(engine, 'setPeopleSpaces', () => { visible++; });
  t.mock.method(meetings, 'leave', () => gate.promise); t.mock.method(meetings, 'close', async () => {});
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 })); assert.ok(output.at(-1).result.capabilities.includes('people-status'));
    assert.ok(output.at(-1).result.capabilities.length <= 32, 'preserve old native hello capability bound');
    assert.deepEqual(output.at(-1).result.peopleSpaces, ['visible-v1']);
    await rpc.receive(wire(2, 'session.start', { mode: 'live', peopleStatus: true })); assert.deepEqual(starts, [['live', undefined, false, true]]);
    await rpc.receive(wire(3, 'people.lookup', { personId: 'PRIVATE' })); assert.equal(output.at(-1).error.code, -32602); assert.equal(lookups, 0);
    await rpc.receive(wire(4, 'people.lookup')); assert.equal(lookups, 1); assert.equal(output.at(-1).result.customStatus, 'unsupported');
    await rpc.receive(wire(5, 'people.spaces', { personId: 'PRIVATE' })); assert.equal(output.at(-1).error.code, -32602);
    assert.equal(visible, 0);
    await rpc.receive(wire(6, 'people.spaces', { roomIds: ['direct-1'] })); assert.equal(visible, 1);
    const stopping = rpc.receive(wire(7, 'shutdown', { leaveMeeting: true }));
    await rpc.receive(wire(8, 'people.lookup')); assert.equal(output.at(-1).error.code, -32002); assert.equal(lookups, 1);
    await rpc.receive(wire(9, 'people.spaces', { roomIds: [] })); assert.equal(output.at(-1).error.code, -32002); assert.equal(visible, 1);
    await rpc.receive(wire(10, 'state.get')); assert.equal(output.at(-1).result.state, 'idle');
    gate.resolve(); await stopping;
  } finally { gate.resolve(); await rpc.close(); }
});

test('demo opt-in never constructs a live provider or fabricates live presence', async t => {
  let factories = 0;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const engine = new EditorEngine(undefined, undefined, () => { factories++; throw new Error('LIVE PROVIDER FORBIDDEN'); });
  try {
    await engine.start('demo', undefined, false, true); await engine.select('demo-alex');
    const before = engine.snapshot();
    engine.setPeopleSpaces(['demo-alex']); engine.setPeopleSpaces([]);
    assert.deepEqual(engine.snapshot(), before, 'account-free demo must not publish a no-op presence update');
    assert.equal((await engine.lookupPeople()).reason, 'demo'); assert.equal(factories, 0);
    assert.equal(engine.snapshot().peopleStatus.customStatus, 'unsupported');
  } finally { engine.stop(); }
});

test('selected people projection validator rejects provider secrets, controls, coercions and inconsistent status shapes', () => {
  const good = { capability: 'ready', state: 'fresh', presence: 'active', customStatus: 'unsupported', roomId: 'direct-1', observedAt: NOW };
  assert.equal(validSelectedPeopleStatus(good), true);
  for (const patch of [{ token: 'PRIVATE' }, { personId: 'peer-1' }, { customStatus: 'CUSTOM' }, { presence: 'offline' }, { capability: {} },
    { observedAt: '123' }, { displayName: 'Unsafe\nName' }, { displayName: '\u202eName' }, { lastActivity: 'bad' }, { state: 'unavailable' },
    { state: 'unknown' }, { requiredScope: [] }, { roomId: '../secret' }, { reason: 'PRIVATE-ERROR' }]) {
    assert.equal(validSelectedPeopleStatus({ ...good, ...patch }), false, JSON.stringify(patch));
  }
});
