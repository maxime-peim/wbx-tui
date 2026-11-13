import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE_LIMITS, PeopleStartBudget, WebexPeopleProvider } from '../src/people-status.js';
import { WebexSelectedPeopleProvider } from '../src/people-selected.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };

test('parallel start budget allows two together per two-second window without shortening Retry-After', () => {
  let now = 10000;
  const budget = new PeopleStartBudget(() => now);
  budget.parallel(true);
  budget.take(); assert.ok(budget.nextStartAt() <= now);
  budget.take(); assert.equal(budget.nextStartAt(), 12000);
  now = 11999; assert.ok(budget.nextStartAt() > now);
  now = 12000; budget.take(); budget.take(); assert.equal(budget.nextStartAt(), 14000);
  budget.defer(200000);
  budget.parallel(false); budget.parallel(true);
  assert.equal(budget.nextStartAt(), 200000, 'mode changes cannot clear service backoff');
});
test('leaving parallel mode cannot reset already spent admission', () => {
  const budget = new PeopleStartBudget(() => 10000);
  budget.parallel(true); budget.take(); budget.take(); budget.parallel(false);
  assert.equal(budget.nextStartAt(), 12000);
});
test('staggered completions cannot squeeze three starts into a rolling two-second window', () => {
  let now = 10000;
  const budget = new PeopleStartBudget(() => now);
  budget.parallel(true); budget.take();
  now = 11999; budget.take(); assert.equal(budget.nextStartAt(), 12000);
  now = 12000; budget.take();
  assert.equal(budget.nextStartAt(), 13999, 'only one slot, not a new pair, was free');
  assert.equal(budget.nextBatchAt(), 14000, 'a new full pair waits for both slots');
});
test('parallel status admission retains two physical slots until canceled HTTP really settles', async () => {
  const gates = [deferred<Response>(), deferred<Response>()], calls: string[] = [];
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async input => { calls.push(String(input)); return gates[calls.length - 1]!.promise; } });
  source.setRelevantPeople(['one', 'two', 'three']); source.setParallelBatches(true);
  const cancel = new AbortController();
  try {
    const one = source.get('one', cancel.signal), two = source.get('two', cancel.signal);
    assert.equal(calls.length, 2, 'both physical reads start before either response');
    assert.equal((await source.get('three')).reason, 'busy');
    cancel.abort(); await Promise.all([one, two]);
    assert.equal((await source.get('three')).reason, 'busy', 'cancel does not free uncooperative HTTP admission');
    gates.forEach((gate, i) => gate.resolve(Response.json({ id: i ? 'two' : 'one', status: 'active' })));
    await tick();
  } finally { source.close(); }
});
test('canceling one peer does not abort the shared self bootstrap needed by another peer', async () => {
  const self = deferred<Response>(); let selfSignal!: AbortSignal; let identities = 0;
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/me')) { identities++; selfSignal = options!.signal as AbortSignal; return self.promise; }
      if (url.pathname.endsWith('/memberships')) {
        const roomId = url.searchParams.get('roomId')!;
        return Response.json({ items: [{ roomId, personId: 'self' }, { roomId, personId: `peer-${roomId}` }] });
      }
      return Response.json({ id: url.pathname.split('/').at(-1), status: 'active' });
    } });
  source.setParallelBatches(true);
  source.setVisibleRooms([{ id: 'one', type: 'direct' }, { id: 'two', type: 'direct' }]);
  try {
    const one = source.lookupRoom('one'), two = source.lookupRoom('two');
    assert.equal(identities, 1);
    source.setVisibleRooms([{ id: 'two', type: 'direct' }]);
    assert.equal(selfSignal.aborted, false);
    self.resolve(Response.json({ id: 'self', type: 'person' }));
    await one; assert.equal((await two).presence, 'active');
    assert.equal(identities, 1);
  } finally { source.close(); }
});
test('draining status HTTP occupies the same physical admission used by new identity reads', async () => {
  let now = 10000;
  const gates = [deferred<Response>(), deferred<Response>()], calls: string[] = [];
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], now: () => now, token: () => 'SYNTHETIC',
    fetcher: async input => {
      const url = new URL(String(input)); calls.push(url.href);
      if (url.pathname.endsWith('/me')) return Response.json({ id: 'self', type: 'person' });
      if (url.pathname.endsWith('/memberships')) {
        const roomId = url.searchParams.get('roomId')!;
        return Response.json({ items: [{ roomId, personId: 'self' }, { roomId, personId: `peer-${roomId}` }] });
      }
      return gates[url.pathname.endsWith('one') ? 0 : 1]!.promise;
    } });
  source.setParallelBatches(true);
  source.setVisibleRooms([{ id: 'one', type: 'direct' }, { id: 'two', type: 'direct' }]);
  try {
    const one = source.lookupRoom('one'), two = source.lookupRoom('two');
    await tick(); assert.equal(calls.length, 5);
    source.setVisibleRooms([{ id: 'three', type: 'direct' }]);
    await Promise.all([one, two]);
    now += 2000;
    assert.equal((await source.lookupRoom('three')).reason, 'busy');
    assert.equal(calls.length, 5, 'canceling two statuses cannot open two more membership HTTP slots');
    gates.forEach((gate, i) => gate.resolve(Response.json({ id: i ? 'peer-two' : 'peer-one', status: 'active' })));
    await tick();
  } finally { source.close(); }
});

test('85 exact relevant IDs use one bounded batch, match by ID rather than order, and cache unknown honestly', async () => {
  let calls = 0;
  const ids = Array.from({ length: 85 }, (_, i) => 'peer-' + i);
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.pathname, '/v1/people');
      assert.deepEqual(url.searchParams.get('id')!.split(','), ids);
      assert.equal(url.searchParams.get('max'), '85');
      assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
      return Response.json({ items: [...ids].reverse().slice(0, -1).map(id => ({ id, status: id === 'peer-1' ? 'unknown' : 'active',
        lastActivity: '2026-11-01T00:00:00Z', emails: ['PRIVATE'] })) });
    } });
  source.setRelevantPeople(ids);
  try {
    const values = await source.getMany(ids);
    assert.equal(calls, 1);
    assert.equal(values[0]!.reason, 'not-found', 'omitted people are not assigned another result');
    assert.equal(values[1]!.reason, 'unknown-status', 'a timestamp never fabricates online/offline');
    assert.ok(values.slice(2).every((value, i) => value.personId === ids[i + 2] && value.presence === 'active'));
    assert.ok(!JSON.stringify(values).includes('PRIVATE'));
    await source.getMany(ids); assert.equal(calls, 1);
    await assert.rejects(source.getMany([...ids, 'extra']));
    await assert.rejects(source.getMany(['peer-1', 'peer-1']));
    assert.equal(calls, 1, 'oversized/ambiguous targets never issue a request');
  } finally { source.close(); }
});

test('batch cancellation is per peer; removed peers cannot cancel survivors or accept late data', async () => {
  const gate = deferred<Response>(); let native!: AbortSignal;
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async (_input, init) => { native = init!.signal as AbortSignal; return gate.promise; } });
  source.setRelevantPeople(['one', 'two']);
  try {
    const pending = source.getMany(['one', 'two']);
    source.setRelevantPeople(['two']);
    assert.equal(native.aborted, false);
    gate.resolve(Response.json({ items: [{ id: 'one', status: 'active' }, { id: 'two', status: 'meeting' }] }));
    const values = await pending;
    assert.equal(values[0]!.reason, 'canceled');
    assert.equal(values[1]!.presence, 'meeting');
    source.setRelevantPeople(['one', 'two']);
    assert.equal(source.peek('one').reason, 'not-loaded');
  } finally { source.close(); }
});

test('batch rejects unsolicited/duplicate/malformed identities atomically and respects Retry-After', async () => {
  for (const items of [
    [{ id: 'one', status: 'active' }, { id: 'unrequested', status: 'meeting' }],
    [{ id: 'one', status: 'active' }, { id: 'one', status: 'meeting' }],
    [{ id: 'one', status: 'active' }, { id: 'two', errors: ['PRIVATE'] }],
  ]) {
    const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
      fetcher: async () => Response.json({ items }) });
    source.setRelevantPeople(['one', 'two']);
    try { assert.ok((await source.getMany(['one', 'two'])).every(value => value.reason === 'invalid-data')); }
    finally { source.close(); }
  }
  let calls = 0, now = 10000;
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC', now: () => now,
    fetcher: async () => { calls++; return Response.json({}, { status: 429, headers: { 'retry-after': '300' } }); } });
  source.setRelevantPeople(['one', 'two']);
  try {
    assert.ok((await source.getMany(['one', 'two'])).every(value => value.retryAt === 310000));
    now += PEOPLE_LIMITS.freshMs;
    await source.getMany(['one', 'two']); assert.equal(calls, 1);
  } finally { source.close(); }
});

test('two timed-out batches retain exactly two native slots until their physical reads settle', async () => {
  let now = 10000, calls = 0;
  const gates = [deferred<Response>(), deferred<Response>()];
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC', now: () => now,
    timeoutMs: 10, fetcher: async () => gates[calls++]!.promise });
  source.setRelevantPeople(['one', 'two', 'three', 'four', 'five', 'six']);
  try {
    assert.ok((await source.getMany(['one', 'two'])).every(value => value.reason === 'timeout'));
    now += 1000;
    assert.ok((await source.getMany(['three', 'four'])).every(value => value.reason === 'timeout'));
    now += 1000;
    assert.ok((await source.getMany(['five', 'six'])).every(value => value.reason === 'busy'));
    assert.equal(calls, 2);
    gates.forEach(gate => gate.resolve(Response.json({ items: [] })));
    await tick();
    assert.equal(source.peek('one').reason, 'not-loaded', 'late results cannot manufacture observations');
  } finally { source.close(); }
});

test('batch response size remains bounded and a single-target reader joins its existing batch flight', async () => {
  const gate = deferred<Response>(); let calls = 0;
  const source = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async () => { calls++; return gate.promise; } });
  source.setRelevantPeople(['one', 'two']);
  try {
    const batch = source.getMany(['one', 'two']), selected = source.get('two');
    assert.equal(calls, 1);
    gate.resolve(Response.json({ items: [{ id: 'two', status: 'call' }, { id: 'one', status: 'active' }] }));
    assert.equal((await selected).presence, 'call'); await batch;
  } finally { source.close(); }
  const oversized = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async () => new Response('x'.repeat(PEOPLE_LIMITS.batchBytes + 1)) });
  oversized.setRelevantPeople(['one', 'two']);
  try { assert.ok((await oversized.getMany(['one', 'two'])).every(value => value.reason === 'invalid-data')); }
  finally { oversized.close(); }
});

test('canceling a cold viewport settles every queued room without admitting more HTTP behind abandoned readers', async () => {
  const gates = [deferred<Response>(), deferred<Response>()], calls: string[] = [];
  const rooms = Array.from({ length: 16 }, (_, i) => ({ id: 'room-' + i, type: 'direct' as const }));
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async input => {
      const url = String(input); calls.push(url);
      if (url.endsWith('/me')) return Response.json({ id: 'self' });
      assert.equal(new URL(url).pathname, '/v1/memberships');
      return gates[calls.length - 2]!.promise;
    } });
  source.setVisibleRooms(rooms);
  try {
    const pending = source.lookupRooms(rooms.map(room => room.id));
    await tick(); assert.equal(calls.length, 3, 'one self read, then exactly two cold roster readers');
    source.setVisibleRooms([]);
    const values = await pending;
    assert.equal(values.length, 16);
    assert.ok(values.every(value => value.reason === 'canceled'));
    assert.equal(calls.length, 3, 'the remaining fourteen room reads were never admitted');
    gates.forEach(gate => gate.resolve(Response.json({ items: [] }))); await tick();
    assert.equal(calls.length, 3, 'late settlement cannot resume the retired work list');
  } finally { source.close(); }
});

test('removing some cold batch peers cancels only those room results and preserves a still-visible survivor', async () => {
  const gate = deferred<Response>(); let statusSignal!: AbortSignal, statusReads = 0;
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async (input, init) => {
      const url = new URL(String(input)), roomId = url.searchParams.get('roomId');
      if (url.pathname.endsWith('/me')) return Response.json({ id: 'self' });
      if (roomId) return Response.json({ items: [{ roomId, personId: 'self' }, { roomId, personId: 'peer-' + roomId }] });
      statusReads++; statusSignal = init!.signal as AbortSignal; return gate.promise;
    } });
  source.setVisibleRooms(['one', 'two', 'three'].map(id => ({ id, type: 'direct' })));
  try {
    const pending = source.lookupRooms(['one', 'two', 'three']);
    await tick(); assert.equal(statusReads, 1);
    source.setVisibleRooms([{ id: 'three', type: 'direct' }]);
    assert.equal(statusSignal.aborted, false);
    gate.resolve(Response.json({ items: ['one', 'two', 'three'].map(id => ({ id: 'peer-' + id, status: 'active' })) }));
    const values = await pending;
    assert.deepEqual(values.map(value => value.reason ?? value.presence), ['canceled', 'canceled', 'active']);
    assert.equal(statusReads, 1);
  } finally { source.close(); }
});

test('a cold roster Retry-After stops the remaining work list and status batch without dropping the server deadline', async () => {
  let now = 10000, calls = 0, membershipReads = 0;
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC', now: () => now,
    fetcher: async input => {
      calls++;
      const url = new URL(String(input)), roomId = url.searchParams.get('roomId');
      if (url.pathname.endsWith('/me')) return Response.json({ id: 'self' });
      assert.ok(roomId, 'status reads must not start during roster service backoff');
      if (membershipReads++ === 0) return Response.json({}, { status: 429, headers: { 'retry-after': '180' } });
      return Response.json({ items: [{ roomId, personId: 'self' }, { roomId, personId: 'peer-' + roomId }] });
    } });
  source.setVisibleRooms(Array.from({ length: 16 }, (_, i) => ({ id: 'room-' + i, type: 'direct' as const })));
  try {
    const values = await source.lookupRooms(Array.from({ length: 16 }, (_, i) => 'room-' + i));
    assert.ok(values.every(value => value.reason === 'rate-limited' && value.retryAt === 190000));
    assert.equal(membershipReads, 2, 'only the already-admitted second request may finish');
    const reads = calls;
    now += 60000;
    await source.lookupRooms(['room-0', 'room-1']); assert.equal(calls, reads);
  } finally { source.close(); }
});

test('a denied self bootstrap cannot restart for each queued room in a cold viewport', async () => {
  let calls = 0;
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    fetcher: async () => { calls++; return Response.json({}, { status: 401 }); } });
  const rooms = Array.from({ length: 16 }, (_, i) => ({ id: 'room-' + i, type: 'direct' as const }));
  source.setVisibleRooms(rooms);
  try {
    const values = await source.lookupRooms(rooms.map(room => room.id));
    assert.ok(values.every(value => value.reason === 'denied' && value.capability === 'unavailable'));
    assert.equal(calls, 1, 'denial latches before another queued peer can admit a new bootstrap');
  } finally { source.close(); }
});

test('cold batch queueing does not extend a hanging native request deadline or release its physical slot', async () => {
  let calls = 0, now = 10000;
  const gates = [deferred<Response>(), deferred<Response>()];
  const source = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC',
    timeoutMs: 10, now: () => now, fetcher: async input => {
      calls++;
      if (String(input).endsWith('/me')) return Response.json({ id: 'self' });
      return gates[calls - 2]!.promise;
    } });
  source.setVisibleRooms(['one', 'two', 'three', 'four', 'five'].map(id => ({ id, type: 'direct' })));
  try {
    const values = await source.lookupRooms(['one', 'two', 'three', 'four']);
    assert.deepEqual(values.map(value => value.reason), ['timeout', 'timeout', 'busy', 'busy']);
    assert.equal(calls, 3, 'the two timed-out native readers still occupy both slots');
    now += 1000;
    assert.equal((await source.lookupRoom('five')).reason, 'busy');
    assert.equal(calls, 3);
  } finally {
    source.close();
    gates.forEach(gate => gate.resolve(Response.json({ items: [] }))); await tick();
  }
});
