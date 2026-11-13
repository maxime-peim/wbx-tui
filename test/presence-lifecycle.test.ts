import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PresenceLifecycle, type PresenceContext, type PresenceSession } from '../src/presence-lifecycle.js';
import { WebexSelectedPeopleProvider, validSelectedPeopleStatus } from '../src/people-selected.js';
import { PEOPLE_LIMITS, type PeopleReadOwner } from '../src/people-status.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function response(input: string): Response {
  const url = new URL(input), room = url.searchParams.get('roomId');
  assert.equal(url.origin, 'https://webexapis.com');
  if (url.pathname.endsWith('/me')) return Response.json({ id: 'self', type: 'person' });
  if (room) return Response.json({ items: [{ roomId: room, personId: 'self' }, { roomId: room, personId: 'peer-' + room }] });
  if (url.pathname === '/v1/people') return Response.json({ items: url.searchParams.get('id')!.split(',').map(id =>
    ({ id, type: 'person', status: 'active', displayName: 'Synthetic peer' })) });
  return Response.json({ id: url.pathname.split('/').at(-1), type: 'person', status: 'active', displayName: 'Synthetic peer' });
}
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('ACTUAL NETWORK FORBIDDEN'); });
  const reads: string[] = [], physical: PeopleReadOwner[] = [], changes: ReturnType<PresenceLifecycle['snapshot']>[] = [];
  let reply = async (input: string) => response(input);
  const presence = new PresenceLifecycle({
    create: (session, readOwner) => {
      physical.push(readOwner);
      return new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: session.grantedScopes,
        token: session.token, readOwner, now: Date.now, fetcher: async (input, init) => {
          assert.equal(init?.method, 'GET'); reads.push(String(input)); return reply(String(input));
        } });
    }, now: Date.now, changed: () => {
      const value = presence.snapshot();
      for (const status of [value.peopleStatus, ...value.peopleViewport ?? [], ...value.peopleSpaces ?? []])
        assert.ok(validSelectedPeopleStatus(status));
      changes.push(value);
    },
  });
  const context: PresenceContext = { directRooms: Array.from({ length: 16 }, (_, i) => 'room-' + i) };
  const session: PresenceSession = { token: () => 'SYNTHETIC', grantedScopes: ['spark:all'], expiresAt: NOW + 3600_000, active: () => true };
  presence.reset(true, 'live'); presence.start(session, context);
  t.after(() => presence.stop());
  return { presence, reads, physical, changes, context, session, reply: (next: typeof reply) => { reply = next; } };
}

test('standalone presence loads whole viewport batches and returns offscreen observations synchronously', async t => {
  const f = fixture(t), first = f.context.directRooms.slice(0, 8), second = f.context.directRooms.slice(8);
  f.presence.setViewport([...first]);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  const observed = f.presence.snapshot().peopleViewport!;
  assert.ok(observed.every(value => value.state === 'fresh' && value.presence === 'active'));
  f.presence.setViewport([...second]);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  assert.ok(f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh'));
  const reads = f.reads.length;
  f.presence.setViewport([...first]);
  assert.deepEqual(f.presence.snapshot().peopleViewport, observed, 'return is local, not held behind identity relevance/refetch');
  const publications = f.changes.length;
  f.presence.setViewport([...first]);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.changes.length, publications, 'unchanged reports do not reset or publish');
  assert.equal(f.reads.length, reads);
  assert.equal(f.physical.length, 1);
  t.diagnostic(JSON.stringify({ workflow: 'standalone viewport return', observedRows: 16, returnReads: f.reads.length - reads }));
});

test('a genuinely cold sixteen-person viewport resolves below one second without publishing pairs or exceeding two HTTP readers', async t => {
  const f = fixture(t);
  let active = 0, peak = 0;
  f.reply(input => new Promise(resolve => {
    active++; peak = Math.max(peak, active);
    setTimeout(() => { active--; resolve(response(input)); }, 60);
  }));
  f.presence.setViewport([...f.context.directRooms]);
  const started = Date.now();
  for (let i = 0; i < 20; i++) {
    t.mock.timers.tick(60); await tick();
    if (f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh')) break;
  }
  const values = f.presence.snapshot().peopleViewport!;
  assert.ok(values.every(value => value.state === 'fresh'), 'the cold test must actually load all sixteen peers');
  assert.ok(Date.now() - started < 1000, 'no two-second gap or repeated two-person scheduler turns');
  assert.equal(peak, 2, 'two native HTTP requests, not sixteen workers');
  assert.equal(f.reads.filter(input => new URL(input).pathname === '/v1/memberships').length, 16);
  assert.equal(f.reads.filter(input => new URL(input).pathname === '/v1/people/me').length, 1);
  assert.equal(f.reads.filter(input => new URL(input).pathname === '/v1/people').length, 1);
  assert.equal(f.reads.length, 18, 'one self bootstrap + sixteen exact rosters + one status batch');
  for (const state of f.changes) {
    const fresh = state.peopleViewport?.filter(value => value.state === 'fresh').length ?? 0;
    assert.ok(fresh === 0 || fresh === 16, 'status publications must not trickle out as pairs');
  }
  t.diagnostic(JSON.stringify({ workflow: 'genuinely cold viewport', rows: 16, peakHTTP: peak,
    simulatedHTTPMs: 60, completionMs: Date.now() - started, statusRequests: 1, liveLatencyVerified: false }));
});

test('queueing behind slow but healthy roster reads does not expire the whole cold viewport before its status batch', async t => {
  const f = fixture(t);
  f.reply(input => new Promise(resolve => { setTimeout(() => resolve(response(input)), 1000); }));
  f.presence.setViewport([...f.context.directRooms]);
  for (let i = 0; i < 20; i++) {
    t.mock.timers.tick(1000); await tick();
    if (f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh')) break;
  }
  assert.ok(f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh'),
    'a bounded queue is not an eight-second native request; queued peers must not all time out together');
  assert.equal(f.reads.length, 18);
});

test('selected presence recovers after a finite source failure without an immediate retry or fabricated freshness', async t => {
  const f = fixture(t);
  f.presence.sync({ ...f.context, selected: { id: 'room-0', type: 'direct' } });
  const fresh = await f.presence.lookup();
  f.reply(async input => input.includes('/people/peer-') ? Response.json({}, { status: 503 }) : response(input));
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  const failed = f.presence.snapshot().peopleStatus;
  assert.equal(failed.state, 'stale'); assert.equal(failed.reason, 'failed');
  assert.equal(failed.observedAt, fresh.observedAt);
  const reads = f.reads.length;
  await f.presence.lookup();
  assert.equal(f.reads.length, reads, 'explicit lookup still respects provider negative-cache/backoff');
  assert.equal(f.presence.snapshot().peopleStatus.state, 'stale');
  f.reply(async input => response(input));
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  const recovered = f.presence.snapshot().peopleStatus;
  assert.equal(recovered.state, 'fresh'); assert.equal(recovered.presence, 'active');
  assert.ok(recovered.observedAt! > fresh.observedAt!);
  assert.equal(f.physical.length, 1, 'source failure does not create a new owner/pool');
  t.diagnostic(JSON.stringify({ workflow: 'standalone source recovery', states: [fresh.state, failed.state, recovered.state] }));
});

test('logical replacement fences observations while physical admission survives until old HTTP settles', async t => {
  const f = fixture(t), gates = [deferred<Response>(), deferred<Response>()];
  let memberships = 0;
  f.reply(async input => input.includes('/memberships?') && memberships++ < 2
    ? gates[memberships - 1]!.promise : response(input));
  f.presence.setViewport(['room-0', 'room-1']);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.reads.length, 3);
  f.presence.start({ ...f.session, token: () => 'OTHER-SYNTHETIC' }, f.context);
  assert.equal(f.presence.snapshot().peopleViewport, undefined);
  assert.equal(f.physical[0], f.physical[1], 'replacement must reuse physical reservations and budgets');
  t.mock.timers.tick(2000);
  f.presence.setViewport(['room-0', 'room-1']);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.reads.length, 3, 'two draining HTTP reads cannot be bypassed by a new source');
  const publications = f.changes.length;
  gates.forEach((gate, i) => gate.resolve(response('https://webexapis.com/v1/memberships?roomId=room-' + i + '&max=3')));
  await tick();
  assert.equal(f.changes.length, publications, 'retired source cannot republish');
  assert.ok(f.presence.snapshot().peopleViewport!.every(value => value.observedAt === undefined));
  t.mock.timers.tick(PEOPLE_LIMITS.failureMs + 1); await tick();
  assert.ok(f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh'), 'current owner progresses after physical settlement and backoff');
  t.diagnostic(JSON.stringify({ workflow: 'standalone session replacement', drainingReads: 2, sharedPhysicalOwner: true,
    recoveredRows: f.presence.snapshot().peopleViewport!.length }));
});

test('selected direct peer remains refreshable outside the bounded loaded-row set', async t => {
  const f = fixture(t), room = { id: 'room-0', type: 'direct' as const };
  f.presence.sync({ ...f.context, selected: room });
  assert.equal((await f.presence.lookup()).state, 'fresh');
  assert.equal(f.reads.length, 3);
  f.presence.sync({ selected: room, directRooms: [] });
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  assert.equal(f.reads.length, 4, 'row absence is not revocation of the independent selected peer; its verified roster remains cached');
  assert.equal(f.presence.snapshot().peopleStatus.state, 'fresh');
  assert.equal(f.presence.snapshot().peopleStatus.observedAt, Date.now());
  f.presence.deselect();
  assert.equal(f.presence.snapshot().peopleStatus.reason, 'not-selected', 'real revocation effect clears the provider selection');
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  assert.equal(f.reads.length, 4, 'deselection, unlike bounded-list absence, removes selected refresh authority');
});

test('returning aged visible peers share one status batch within a second, without repeating verified rosters', async t => {
  const f = fixture(t), first = f.context.directRooms.slice(0, 8), second = f.context.directRooms.slice(8);
  f.presence.setViewport([...first]);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  f.presence.setViewport([...second]);
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(1000); await tick(); }
  f.presence.setViewport([]);
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs);
  const reads = f.reads.length;
  const started = Date.now();
  f.presence.setViewport([...first]);
  t.mock.timers.tick(1); await tick();
  assert.equal(f.reads.length, reads + 1, 'one People batch replaces eight roster/status pairs');
  const request = new URL(f.reads.at(-1)!);
  assert.equal(request.pathname, '/v1/people');
  assert.deepEqual(request.searchParams.get('id')!.split(','), first.map(id => 'peer-' + id));
  assert.ok(f.presence.snapshot().peopleViewport!.every(value => value.state === 'fresh' && value.observedAt! >= started));
  assert.ok(Date.now() - started < 1000, 'no per-person pacing delay on cached/verified peers');
  f.presence.sync({ directRooms: [...second] });
  f.presence.sync(f.context);
  f.presence.setViewport([...first]);
  t.mock.timers.tick(2000); await tick();
  assert.ok(f.reads.slice(reads + 1).some(url => new URL(url).pathname.endsWith('/memberships')),
    'revocation/unloading purges cached peer relationships too');
  t.diagnostic(JSON.stringify({ workflow: 'aged viewport return', rows: first.length, statusRequests: 1, repeatedRosters: 0,
    syntheticCompletionMs: 1, liveLatencyVerified: false }));
});

test('revocation/stop/opt-out remove retained data and scheduled work, never another owner authority', async t => {
  const f = fixture(t);
  f.presence.setViewport(['room-0', 'room-1']);
  t.mock.timers.tick(1); await tick();
  const original = f.presence.snapshot();
  original.peopleViewport![0]!.displayName = 'Foreign edit';
  assert.notEqual(f.presence.snapshot().peopleViewport![0]!.displayName, 'Foreign edit');
  f.presence.sync({ directRooms: ['room-1'] });
  assert.deepEqual(f.presence.snapshot().peopleViewport!.map(value => value.roomId), ['room-1']);
  f.presence.setViewport([]);
  const reads = f.reads.length;
  t.mock.timers.tick(PEOPLE_LIMITS.freshMs); await tick();
  assert.equal(f.reads.length, reads);
  f.presence.sync(f.context); f.presence.setViewport(['room-0']);
  assert.equal(f.presence.snapshot().peopleViewport![0]!.reason, 'not-loaded', 'revoked observation is not reusable');
  f.presence.reset();
  const stopped = f.presence.snapshot(), publications = f.changes.length;
  t.mock.timers.tick(600_000); await tick();
  assert.deepEqual(f.presence.snapshot(), stopped);
  assert.equal(f.changes.length, publications); assert.equal(f.reads.length, reads);
  assert.equal(stopped.peopleStatus.reason, 'off');
  f.presence.start(f.session, f.context);
  assert.equal(f.physical.length, 1, 'opt-out cannot construct a replacement source');
  f.presence.reset(true, 'demo');
  f.presence.start(f.session, f.context);
  assert.equal(f.physical.length, 1, 'demo cannot construct a live presence source');
  assert.equal(f.presence.snapshot().peopleStatus.reason, 'demo');
  f.presence.reset(true, 'live');
  assert.equal(f.presence.snapshot().peopleStatus.reason, 'not-connected');
});
