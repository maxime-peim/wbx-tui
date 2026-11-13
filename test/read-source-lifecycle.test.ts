import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadSourceLifecycle, type ReadSourceSession } from '../src/read-source-lifecycle.js';
import type { ReadStatusSource } from '../src/read-status.js';
import { MESSAGE_EVENT_LIMITS, type RoomReadStatus, type ReadChange } from '../src/read-status-protocol.js';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; };
const at = '2026-11-18T12:00:00.000Z', before = '2026-11-18T11:00:00.000Z';
const row = (id = 'room'): RoomReadStatus => ({ id, title: 'Synthetic', type: 'direct', lastActivity: at, lastSeen: before });
function fixture() {
  const sources: (ReadStatusSource & { closes: number; calls: string[] })[] = [];
  const retained = new Map<string, RoomReadStatus>(), observations: { rooms: RoomReadStatus[]; at: number; changed: boolean }[] = [];
  let gate: Promise<void> | undefined, phase: 'connecting' | 'ready' | 'inactive' = 'ready', valid = true;
  let invalidations = 0, changes = 0, eventChanges = 0, overflows = 0;
  const applied: ReadChange[] = [], revoked = new Set<string>();
  const reads = new ReadSourceLifecycle({
    create: () => {
      const pending = gate; gate = undefined;
      const source = { closes: 0, calls: [] as string[], onRooms() {}, onFailure() {},
        async start(...args: unknown[]) { source.calls.push('start/' + args.length); await pending; },
        async markRead() { source.calls.push('receipt'); },
        async reaction() { source.calls.push('reaction'); return {}; },
        async reactions() { source.calls.push('batch'); return {}; },
        close() { source.closes++; source.onRooms([row('late-close')]); },
      } as ReadStatusSource & { closes: number; calls: string[] };
      sources.push(source); return source;
    },
    observed: (rooms, at, changed) => {
      observations.push({ rooms, at, changed });
      for (const room of rooms) retained.set(room.id, { ...room });
    },
    started: () => { changes++; }, changed: () => { changes++; }, eventsChanged: () => { eventChanges++; },
    revoked: id => revoked.has(id), invalidated: () => { invalidations++; }, changes: values => applied.push(...values),
    overflow: () => { overflows++; reads.sessionFailed(true); },
  });
  const session: ReadSourceSession = { credentials: { token: 'SYNTHETIC', expiresAt: Date.now() + 3600_000, scope: 'spark:all' },
    preview: false, senderNames: false, current: () => valid, phase: () => phase };
  return { reads, sources, retained, observations, applied, revoked, session, hold: (pending: Promise<void>) => { gate = pending; },
    phase: (value: typeof phase) => { phase = value; }, valid: (value: boolean) => { valid = value; },
    counts: () => ({ invalidations, changes, eventChanges, overflows }) };
}

test('standalone startup accepts fresh metadata before readiness and settles without owning retained unread state', async () => {
  const f = fixture(), gate = deferred();
  assert.equal(f.sources.length, 0);
  f.hold(gate.promise); const starting = f.reads.start(f.session);
  assert.equal(f.reads.status, 'connecting'); assert.equal(f.sources.length, 1);
  f.sources[0]!.onRooms([row()]);
  assert.equal(f.reads.hasRoom('room'), true); assert.equal(f.reads.status, 'connecting');
  const copy = f.reads.rooms(); copy[0]!.lastSeen = at;
  assert.equal(f.reads.rooms()[0]!.lastSeen, before, 'current-source projection is detached');
  f.sources[0]!.onRooms([row()]);
  assert.deepEqual(f.observations.map(value => value.changed), [true, false]);
  assert.equal(f.retained.get('room')!.lastSeen, before);
  gate.resolve(); await starting;
  assert.equal(f.reads.status, 'ready');
  f.reads.stop();
  assert.equal(f.reads.rooms().length, 0); assert.equal(f.retained.size, 1, 'source retirement cannot erase a separate observation ledger');
});
test('joined-elsewhere observations are opt-in, source-bound, detached and expire without renewing evidence', async t => {
  const f = fixture(), value = { state: 'ready' as const, partial: true as const, observedAt: Date.now(),
    items: [{ id: 'a'.repeat(64), title: 'Joined elsewhere' }] };
  await f.reads.start(f.session);
  f.sources[0]!.onJoinedMeetings!(value);
  assert.equal(f.reads.joinedMeetings().state, 'off');
  const gate = deferred(); f.hold(gate.promise);
  const starting = f.reads.start({ ...f.session, joinedMeetings: true }), source = f.sources.at(-1)!;
  let discoveries = 0;
  source.discoverJoinedMeetings = () => { discoveries++; };
  assert.equal(f.reads.joinedMeetings().state, 'loading');
  gate.resolve(); await starting;
  assert.equal(discoveries, 1);
  source.onJoinedMeetings!(value);
  const saved = f.reads.joinedMeetings(); saved.items[0]!.title = 'Mutated';
  assert.equal(f.reads.joinedMeetings().items[0]!.title, 'Joined elsewhere');
  t.mock.method(Date, 'now', () => value.observedAt + 90_001);
  assert.equal(f.reads.joinedMeetings().state, 'unavailable');
  assert.deepEqual(f.reads.joinedMeetings().items, []);
  f.reads.stop(); source.onJoinedMeetings!(value);
  assert.equal(f.reads.joinedMeetings().state, 'off');
  assert.equal(discoveries, 1, 'projection, expiry and stop never reconnect or discover');
});
test('joined-elsewhere discovery requires the existing SDK; missing scope/provider and terminal loss never retain current cards', async () => {
  const f = fixture();
  await f.reads.start({ ...f.session, joinedMeetings: true });
  assert.equal(f.reads.joinedMeetings().state, 'unavailable', 'older/custom metadata sources do not claim support');
  const source = f.sources[0]!;
  source.onJoinedMeetings!({ state: 'ready', partial: true, observedAt: Date.now(), items: [{ id: 'a'.repeat(64), title: 'Observed' }] });
  source.onHealth!('rate-limited');
  assert.equal(f.reads.joinedMeetings().state, 'unavailable');
  source.onJoinedMeetings!({ state: 'ready', partial: true, observedAt: Date.now(), items: [{ id: 'a'.repeat(64), title: 'Late blocked result' }] });
  source.onHealth!('live');
  assert.equal(f.reads.joinedMeetings().state, 'unavailable', 'health recovery cannot revive an observation rejected during backoff');
  source.onFailure!('worker-exit');
  assert.equal(f.reads.joinedMeetings().state, 'unavailable');
  await f.reads.start({ ...f.session, joinedMeetings: true, credentials: { ...f.session.credentials, scope: 'meeting:schedules_read' } });
  assert.equal(f.sources.length, 1, 'meeting schedule scope cannot start the messaging SDK');
  assert.equal(f.reads.joinedMeetings().state, 'unavailable');
  f.reads.stop();
});

test('same-source failure/recovery preserves degradation evidence but health alone cannot freshen rooms', async () => {
  const f = fixture(), gate = deferred(); f.hold(gate.promise);
  const starting = f.reads.start(f.session), source = f.sources[0]!, initial = f.reads.evidence();
  source.onRooms([row()]); source.onHealth!('refresh-unavailable'); source.onHealth!('refresh-unavailable');
  assert.deepEqual(f.reads.evidence(), { ...initial, revision: 1, degraded: true });
  gate.resolve(); await starting;
  assert.equal(f.reads.status, 'failed', 'startup settlement cannot overwrite known degradation');
  assert.equal(f.reads.available(), false); assert.equal(f.retained.size, 1);
  source.onHealth!('polling');
  assert.equal(f.reads.status, 'ready'); assert.equal(f.reads.rooms().length, 0, 'ready health is not an observed room');
  source.onRooms([{ ...row(), lastSeen: at }]);
  assert.equal(f.reads.hasRoom('room'), true); assert.equal(f.retained.get('room')!.lastSeen, at);
  assert.equal(f.sources.length, 1);
  f.reads.stop();
});
test('unread discovery and reaction transport have separate readiness; backoff denies reads and never queues writes', async () => {
  const f = fixture();
  await f.reads.start(f.session);
  const source = f.sources[0]!;
  source.onHealth!('rate-limited');
  assert.equal(f.reads.available(), false); assert.equal(f.reads.readable(), false);
  assert.throws(() => f.reads.reactions({ roomId: 'room', messageIds: ['message'] }));
  assert.throws(() => f.reads.markRead('room', 'message'));
  source.onHealth!('refresh-unavailable');
  assert.equal(f.reads.available(), false); assert.equal(f.reads.readable(), true);
  await f.reads.reactions({ roomId: 'room', messageIds: ['message'] });
  assert.throws(() => f.reads.reaction({ roomId: 'room', messageId: 'message', action: 'add', reaction: 'heart' }));
  assert.equal(f.reads.hasRoom('room'), false);
  assert.deepEqual(source.calls, ['start/1', 'batch']);
  f.reads.stop();
});

test('terminal failure and replacement fence all old callbacks, settlement and source leases', async () => {
  const f = fixture(), gate = deferred(); f.hold(gate.promise);
  const oldStart = f.reads.start(f.session), old = f.sources[0]!, lease = f.reads.lease();
  old.onRooms([row()]); old.onFailure('sdk-error');
  assert.equal(f.reads.status, 'failed'); assert.equal(old.closes, 1); assert.equal(lease(), false);
  const counts = f.counts(), epoch = f.reads.evidence().epoch;
  old.onRooms([row('foreign')]); old.onHealth!('live'); old.onMessages!([]); old.onChanges!([]);
  gate.resolve(); await oldStart;
  assert.deepEqual(f.counts(), counts); assert.equal(f.reads.evidence().epoch, epoch);
  await f.reads.start(f.session);
  const source = f.sources[1]!;
  assert.equal(f.reads.status, 'ready'); assert.equal(f.reads.rooms().length, 0);
  old.onRooms([row('foreign')]); source.onRooms([row('current')]);
  assert.deepEqual(f.reads.rooms().map(room => room.id), ['current']);
  f.reads.stop(); assert.equal(source.closes, 1);
});

test('startup invalidations stay bounded, survive source failure and filter fresh rows before domain activation', async () => {
  const f = fixture(); f.phase('connecting');
  await f.reads.start(f.session);
  const source = f.sources[0]!;
  source.onChanges!([{ kind: 'room-revoked', roomId: 'room' }]);
  source.onRooms([row()]);
  assert.equal(f.reads.hasRoom('room'), false);
  source.onFailure('sdk-error');
  assert.deepEqual(f.reads.takeChanges(), [{ kind: 'room-revoked', roomId: 'room' }], 'terminal source failure cannot lose already-verified startup revocation');
  await f.reads.start(f.session);
  const next = f.sources[1]!;
  const batch = Array.from({ length: MESSAGE_EVENT_LIMITS.batch }, (_, i) => ({ kind: 'room-revoked' as const, roomId: 'bounded-' + i }));
  next.onChanges!(batch); next.onChanges!(batch);
  assert.equal(f.reads.diagnostics().pendingChanges, 64); assert.equal(f.counts().overflows, 0);
  next.onChanges!([{ kind: 'room-revoked', roomId: 'overflow' }]);
  assert.equal(f.counts().overflows, 1); assert.equal(f.reads.status, 'failed');
});

test('events keep exact privacy, freshness, retention and revocation bounds without becoming unread authority', async t => {
  const f = fixture();
  t.mock.method(Date, 'now', () => Date.parse(at));
  await f.reads.start(f.session); const source = f.sources[0]!;
  const event = { id: 'message', roomId: 'room', created: at, self: false };
  source.onMessages!([{ ...event, preview: 'Unconsented' }]);
  assert.equal(f.reads.eventStatus().received, 0);
  for (let i = 0; i < 1100; i++) source.onMessages!([{ ...event, id: 'message-' + i }]);
  assert.equal(f.reads.diagnostics().seenEvents, 1000); assert.equal(f.reads.messages().length, 64);
  assert.equal(f.reads.hasRoom('room'), false); assert.equal(f.retained.size, 0);
  const received = f.reads.eventStatus().received;
  f.revoked.add('room'); source.onMessages!([{ ...event, id: 'revoked' }]); f.reads.forgetRoom('room');
  assert.equal(f.reads.eventStatus().received, received); assert.equal(f.reads.messages().length, 0);
  f.reads.stop();
});
test('reader hints are ready-only, source-bound and never fill the startup revocation ledger',async()=>{
  const f=fixture();f.phase('connecting');await f.reads.start(f.session);
  const source=f.sources[0]!,hint={kind:'readers-changed' as const,roomId:'room'};
  for(let i=0;i<100;i++) source.onChanges!([{...hint,roomId:'room-'+i}]);
  assert.equal(f.reads.diagnostics().pendingChanges,0);assert.equal(f.counts().overflows,0);
  f.phase('ready');source.onChanges!([hint]);assert.deepEqual(f.applied,[hint]);
  f.reads.stop();source.onChanges!([hint]);assert.deepEqual(f.applied,[hint]);
});

test('operations use the current source exactly once and cannot restart a failed/missing-grant source', async () => {
  const f = fixture();
  await f.reads.start({ ...f.session, credentials: { ...f.session.credentials, scope: 'spark:rooms_read' } });
  assert.equal(f.sources.length, 0); assert.equal(f.reads.status, 'failed');
  await f.reads.start({ ...f.session, preview: true, senderNames: true });
  const source = f.sources[0]!;
  assert.deepEqual(source.calls, ['start/3']);
  await f.reads.markRead('room', 'message');
  await f.reads.reaction({ roomId: 'room', messageId: 'message', action: 'summary' });
  await f.reads.reactions({ roomId: 'room', messageIds: ['message'] });
  assert.deepEqual(source.calls, ['start/3', 'receipt', 'reaction', 'batch']);
  source.onFailure('worker-exit');
  assert.throws(() => f.reads.markRead('room', 'message'));
  assert.throws(() => f.reads.reactions({ roomId: 'room', messageIds: ['message'] }), /worker:unavailable/);
  assert.equal(f.sources.length, 1, 'forwarding a request is not restart/replay authority');
  f.reads.stop();
});
