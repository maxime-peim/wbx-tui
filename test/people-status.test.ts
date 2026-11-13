import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE_LIMITS, WEBEX_PRESENCE, WebexPeopleProvider, directPersonFromMemberships, parsePeopleStatus,
  peopleId, peopleStatusLabel, type PeopleProviderOptions } from '../src/people-status.js';

const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const person = (id = 'person-1', status: unknown = 'active') => ({ id, status, type: 'person', displayName: 'Synthetic Person', lastActivity: '2026-11-09T11:59:00Z' });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
function fixture(fetcher: typeof fetch, options: Partial<PeopleProviderOptions> = {}) {
  let now = NOW;
  const provider = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:people_read'], token: () => 'synthetic-token',
    fetcher, now: () => now, ...options });
  provider.setRelevantPeople(['person-1', 'person-2', 'person-3']);
  return { provider, advance: (ms: number) => { now += ms; }, now: () => now };
}

test('capability is default OFF, needs known approved grants, and never probes a token/API', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error('NETWORK FORBIDDEN'); };
  const token = () => { calls++; throw new Error('CREDENTIAL INSPECTION FORBIDDEN'); };
  for (const options of [{ grantedScopes: ['spark:all'] }, { enabled: true }, { enabled: true, grantedScopes: ['spark:rooms_read'] },
    { enabled: true, grantedScopes: ['spark-admin:people_read'] }, { enabled: true, grantedScopes: ['spark:people_read-extra'] }]) {
    const provider = new WebexPeopleProvider({ fetcher, token, ...options });
    assert.equal(provider.setRelevantPeople(['person-1']), true);
    const value = await provider.get('person-1');
    assert.equal(value.presence, 'unknown'); assert.equal(value.state, 'unavailable');
    assert.equal(value.reason, options.enabled ? 'scope-required' : 'off');
    assert.equal(provider.capability().customStatus, 'unsupported'); provider.close();
  }
  assert.equal(calls, 0);
});

test('spark:all is accepted only with separate opt-in, without adding or mutating scopes', async () => {
  const scopes = Object.freeze(['spark:all', 'spark:kms']);
  const f = fixture(async () => json(person()), { grantedScopes: scopes });
  try { assert.equal((await f.provider.get('person-1')).state, 'fresh'); assert.deepEqual(scopes, ['spark:all', 'spark:kms']); }
  finally { f.provider.close(); }
});

for (const status of WEBEX_PRESENCE) test(`parses documented presence ${status} without inventing offline`, () => {
  const value = parsePeopleStatus(person('person-1', status), 'person-1', NOW)!;
  assert.equal(value.presence, status); assert.equal(value.state, ['unknown', 'pending'].includes(status) ? 'unknown' : 'fresh');
  assert.equal(value.lastActivity, '2026-11-09T11:59:00.000Z');
  if (status === 'inactive') assert.equal(peopleStatusLabel(value), 'Inactive (not necessarily offline)');
  if (status === 'unknown') assert.equal(peopleStatusLabel(value), 'Unknown');
});

test('missing/novel/invalid statuses stay unknown even with recent lastActivity or custom text', () => {
  for (const status of [undefined, null, false, 0, {}, [], 'offline', 'Active', 'busy', 'quiet', '\x1b[31m']) {
    const value = parsePeopleStatus({ ...person(), status, customStatus: 'Should never become presence' }, 'person-1', NOW)!;
    assert.equal(value.state, 'unknown'); assert.equal(value.presence, 'unknown'); assert.equal(value.customStatus, 'unsupported');
    assert.equal(peopleStatusLabel(value), 'Unknown');
  }
  assert.equal(parsePeopleStatus({ ...person(), type: 'bot' }, 'person-1', NOW)!.reason, 'unsupported-person');
  assert.equal(parsePeopleStatus({ ...person(), type: [] }, 'person-1', NOW)!.presence, 'unknown');
});

test('profile output is bounded inert single-line text and allowlists only supported fields', () => {
  const value = parsePeopleStatus({ ...person(), displayName: 'A\n\r\t\x1b\x07\u009b\u202e\u2066\u2028B' + '😀'.repeat(200),
    emails: ['private@example.invalid'], avatar: 'https://not-fetched.invalid', customStatus: 'PRIVATE-CUSTOM', token: 'PRIVATE-TOKEN',
    roles: ['PRIVATE-ROLE'] }, 'person-1', NOW)!;
  assert.ok(Array.from(value.displayName!).length <= 120);
  assert.ok(!/[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]/.test(value.displayName!));
  assert.ok(!JSON.stringify(value).includes('PRIVATE')); assert.ok(!JSON.stringify(value).includes('example.invalid'));
  assert.deepEqual(Object.keys(value).sort(), ['customStatus', 'displayName', 'lastActivity', 'observedAt', 'personId', 'presence', 'state']);
});

test('invalid identity/payload/time values are rejected, not coerced', () => {
  for (const value of [undefined, null, {}, [], '', '../secret', 'me', 'a?email=b', 'a#b', 'a%2Fb', 'a\nb', '/person', 'a'.repeat(513)]) assert.equal(peopleId(value), false);
  for (const id of ['person-1', 'Y2lzY29zcGFyazovL3VzL1BFT1BMRS9h', 'synthetic+id/with==']) assert.equal(peopleId(id), true);
  for (const value of [null, [], {}, { ...person(), id: 'person-2' }, { ...person(), errors: {} }]) assert.equal(parsePeopleStatus(value, 'person-1', NOW), undefined);
  assert.equal(parsePeopleStatus(person(), 'person-1', NaN), undefined);
  for (const lastActivity of [0, {}, '2026-11-09', 'bad', '2026-02-30T12:00:00Z', '2027-01-01T00:00:00Z', '2026-11-09T10:00:00+00:00']) {
    assert.equal(parsePeopleStatus({ ...person(), lastActivity }, 'person-1', NOW)!.lastActivity, undefined);
  }
});

test('direct identity comes only from an exact complete room membership pair including self', () => {
  const room = { id: 'room-1', type: 'direct', title: 'NOT AN ID', creatorId: 'not-the-peer' };
  const page = { items: [{ roomId: room.id, personId: 'self-1', roomType: 'direct' }, { roomId: room.id, personId: 'person-1', personDisplayName: 'Not an identity' }] };
  assert.deepEqual(directPersonFromMemberships(room, 'self-1', page, true), { state: 'resolved', personId: 'person-1' });
  assert.deepEqual(directPersonFromMemberships(room, 'self-1', { items: [...page.items].reverse() }, true), { state: 'resolved', personId: 'person-1' });
  assert.equal(directPersonFromMemberships(room, 'self-1', page).state, 'unknown');
  for (const bad of [{ items: [] }, { items: [page.items[0]] }, { items: [...page.items, page.items[1]] },
    { items: [page.items[0], { roomId: 'wrong-room', personId: 'person-1' }] },
    { items: [page.items[0], { roomId: room.id, personEmail: 'someone@example.invalid' }] },
    { items: [page.items[0], { ...page.items[1], roomType: 'group' }] },
    { items: [page.items[0], { ...page.items[1], errors: {} }] }, { items: [page.items[0], page.items[0]] }]) {
    assert.equal(directPersonFromMemberships(room, 'self-1', bad, true).state, 'unknown');
  }
  assert.equal(directPersonFromMemberships(room, 'absent-self', page, true).state, 'unknown');
  assert.equal(directPersonFromMemberships({ ...room, type: 'group' }, 'self-1', page, true).state, 'unknown');
  assert.equal(directPersonFromMemberships(room, undefined, page, true).state, 'unknown');
});

test('only explicit relevant reads issue one fixed-origin GET, with safe path encoding and no redirect/retry', async () => {
  const calls: { url: string; init?: RequestInit }[] = [], id = 'synthetic+id/with==';
  const f = fixture(async (url, init) => { calls.push({ url: String(url), init }); return json(person(id)); });
  try {
    assert.equal(calls.length, 0); assert.equal(f.provider.setRelevantPeople([id]), true);
    assert.equal((await f.provider.get('irrelevant')).reason, 'not-relevant');
    assert.equal((await f.provider.get('../bad')).reason, 'identity-missing');
    assert.equal((await f.provider.get(undefined)).reason, 'identity-missing'); assert.equal(calls.length, 0);
    assert.equal((await f.provider.get(id)).presence, 'active');
    assert.equal(calls.length, 1); assert.equal(calls[0]!.url, 'https://webexapis.com/v1/people/synthetic%2Bid%2Fwith%3D%3D');
    assert.equal(calls[0]!.init!.method, 'GET'); assert.equal(calls[0]!.init!.redirect, 'error');
    assert.equal(calls[0]!.init!.credentials, 'omit'); assert.equal(calls[0]!.init!.cache, 'no-store');
    assert.equal(calls[0]!.init!.body, undefined);
    assert.equal(calls[0]!.init!.headers && new Headers(calls[0]!.init!.headers).get('authorization'), 'Bearer synthetic-token');
  } finally { f.provider.close(); }
});

test('relevance, response cache, local cooldown, expiry, and returned-object isolation are bounded', async () => {
  let calls = 0;
  const f = fixture(async url => { calls++; return json(person(decodeURIComponent(String(url).split('/').at(-1)!))); });
  try {
    assert.equal(f.provider.setRelevantPeople(Array.from({ length: PEOPLE_LIMITS.relevant + 1 }, (_, n) => `p-${n}`)), false);
    assert.equal(f.provider.setRelevantPeople(['person-1', 'person-1']), false);
    assert.equal(f.provider.setRelevantPeople(['../bad']), false);
    const first = await f.provider.get('person-1'); first.presence = 'meeting';
    assert.equal((await f.provider.get('person-1')).presence, 'active'); assert.equal(calls, 1);
    const cool = await f.provider.get('person-2'); assert.equal(cool.reason, 'rate-limited'); assert.equal(cool.retryAt, NOW + 1000);
    f.advance(PEOPLE_LIMITS.freshMs); assert.equal(f.provider.peek('person-1').state, 'stale');
    assert.equal(peopleStatusLabel(f.provider.peek('person-1')), 'Stale: Active (within 10 minutes)');
    assert.equal((await f.provider.get('person-1')).state, 'fresh'); assert.equal(calls, 2);
    f.advance(PEOPLE_LIMITS.staleMs); assert.equal(f.provider.peek('person-1').presence, 'unknown');
    assert.equal(f.provider.peek('person-1').reason, 'expired');
    assert.equal(f.provider.setRelevantPeople([]), true); assert.equal(f.provider.peek('person-1').reason, 'not-relevant');
    assert.equal(f.provider.setRelevantPeople(['person-1']), true); assert.equal(f.provider.peek('person-1').reason, 'not-loaded');
  } finally { f.provider.close(); }
});

test('singleflight shares one request and bounds waiting callers without a work queue', async () => {
  const gate = deferred<Response>(); let calls = 0;
  const f = fixture(async () => { calls++; return gate.promise; });
  try {
    const waiting = Array.from({ length: PEOPLE_LIMITS.waiters }, () => f.provider.get('person-1'));
    assert.equal((await f.provider.get('person-1')).reason, 'busy'); assert.equal(calls, 1);
    gate.resolve(json(person()));
    const values = await Promise.all(waiting); assert.ok(values.every(value => value.state === 'fresh'));
    values[0]!.presence = 'meeting'; assert.equal(values[1]!.presence, 'active'); assert.equal(f.provider.peek('person-1').presence, 'active');
  } finally { f.provider.close(); }
});

test('canceling one singleflight reader does not cancel another; canceling the last aborts transport', async () => {
  const gate = deferred<Response>(); let nativeSignal: AbortSignal | undefined;
  const f = fixture(async (_url, init) => { nativeSignal = init!.signal as AbortSignal; return gate.promise; });
  try {
    const a = new AbortController(), b = new AbortController();
    const one = f.provider.get('person-1', a.signal), two = f.provider.get('person-1', b.signal);
    a.abort(); assert.equal((await one).reason, 'canceled'); assert.equal(nativeSignal!.aborted, false);
    b.abort(); assert.equal((await two).reason, 'canceled'); assert.equal(nativeSignal!.aborted, true);
    gate.resolve(json(person())); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.provider.peek('person-1').reason, 'not-loaded');
  } finally { f.provider.close(); }
});

test('repeated canceled subscribers cannot accumulate unbounded promise reactions behind a surviving reader', async () => {
  const gate = deferred<Response>(); const f = fixture(async () => gate.promise);
  try {
    const survivor = f.provider.get('person-1');
    for (let i = 1; i < PEOPLE_LIMITS.waiters; i++) {
      const abort = new AbortController(), pending = f.provider.get('person-1', abort.signal);
      abort.abort(); assert.equal((await pending).reason, 'canceled');
    }
    assert.equal((await f.provider.get('person-1')).reason, 'busy');
    gate.resolve(json(person())); assert.equal((await survivor).state, 'fresh');
  } finally { f.provider.close(); }
});

test('close immediately resolves active readers, aborts transport, and ignores late success', async () => {
  const gate = deferred<Response>(); let signal: AbortSignal | undefined;
  const f = fixture(async (_url, init) => { signal = init!.signal as AbortSignal; return gate.promise; });
  const pending = f.provider.get('person-1'); f.provider.close();
  assert.equal((await pending).reason, 'closed'); assert.equal(signal!.aborted, true);
  gate.resolve(json(person())); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.provider.peek('person-1').reason, 'closed'); assert.equal(f.provider.peek('person-1').observedAt, undefined);
});

test('deadline returns promptly but never releases native concurrency for fetch that ignores cancellation', async () => {
  const pending: ReturnType<typeof deferred<Response>>[] = []; let calls = 0;
  const f = fixture(async () => { calls++; const gate = deferred<Response>(); pending.push(gate); return gate.promise; }, { timeoutMs: 10 });
  try {
    assert.equal((await f.provider.get('person-1')).reason, 'timeout');
    f.advance(1000); assert.equal((await f.provider.get('person-2')).reason, 'timeout');
    f.advance(1000); assert.equal((await f.provider.get('person-3')).reason, 'busy'); assert.equal(calls, 2);
    pending[0]!.resolve(json(person())); pending[1]!.resolve(json(person('person-2')));
    await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(f.provider.peek('person-1').presence, 'unknown');
  } finally { f.provider.close(); }
});

test('hanging rejected-body cancellation also retains native admission until cleanup settles', async () => {
  const cleanup = [deferred<void>(), deferred<void>()]; let calls = 0;
  const f = fixture(async () => {
    const gate = cleanup[calls++]!;
    return new Response(new ReadableStream({ cancel: () => gate.promise }), { status: 500 });
  });
  try {
    assert.equal((await f.provider.get('person-1')).reason, 'failed'); f.advance(1000);
    assert.equal((await f.provider.get('person-2')).reason, 'failed'); f.advance(1000);
    assert.equal((await f.provider.get('person-3')).reason, 'busy'); assert.equal(calls, 2);
  } finally {
    f.provider.close(); cleanup.forEach(gate => gate.resolve()); await new Promise<void>(resolve => setImmediate(resolve));
  }
});

test('hanging body read is canceled on deadline and bounded empty-chunk streams cannot grow memory', async () => {
  let canceled = false;
  const f = fixture(async () => new Response(new ReadableStream({ cancel: () => { canceled = true; } })), { timeoutMs: 10 });
  try { assert.equal((await f.provider.get('person-1')).reason, 'timeout'); assert.equal(canceled, true); }
  finally { f.provider.close(); }
  let reads = 0;
  const empty = fixture(async () => new Response(new ReadableStream({ pull(controller) {
    if (++reads > PEOPLE_LIMITS.responseReads + 2) throw new Error('Expected bounded stream cancellation');
    controller.enqueue(new Uint8Array());
  } })));
  try { assert.equal((await empty.provider.get('person-1')).reason, 'invalid-data'); assert.ok(reads <= PEOPLE_LIMITS.responseReads + 2); }
  finally { empty.provider.close(); }
});

test('401 denies the session; target 403 purges only that target; neither exposes provider bodies', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const f = fixture(async () => { calls++; return calls === 1 ? json(person()) : json({ secret: 'PRIVATE-BODY' }, status); });
    try {
      await f.provider.get('person-1'); f.advance(PEOPLE_LIMITS.freshMs);
      const value = await f.provider.get('person-1'); assert.equal(value.reason, status === 401 ? 'denied' : 'not-shared'); assert.equal(value.presence, 'unknown');
      assert.equal(f.provider.capability().state, status === 401 ? 'denied' : 'ready'); assert.equal(f.provider.peek('person-1').observedAt, undefined);
      f.advance(60_000); assert.equal((await f.provider.get('person-2')).reason, status === 401 ? 'denied' : 'not-shared'); assert.equal(calls, status === 401 ? 2 : 3);
      assert.ok(!JSON.stringify(value).includes('PRIVATE'));
    } finally { f.provider.close(); }
  }
});

test('refresh failure preserves only labeled bounded stale observations; omitted status clears old certainty', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; if (calls === 2) throw new Error('PRIVATE-ERROR token URL');
    return json(calls === 3 ? { id: 'person-1', displayName: 'Synthetic' } : person()); });
  try {
    await f.provider.get('person-1'); f.advance(PEOPLE_LIMITS.freshMs);
    const failed = await f.provider.get('person-1'); assert.equal(failed.state, 'stale'); assert.equal(failed.reason, 'failed');
    assert.equal(failed.observedAt, NOW); assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
    await f.provider.get('person-1'); assert.equal(calls, 2);
    f.advance(PEOPLE_LIMITS.failureMs); const omitted = await f.provider.get('person-1');
    assert.equal(omitted.presence, 'unknown'); assert.equal(omitted.reason, 'missing-status');
  } finally { f.provider.close(); }
});

for (const header of ['3600', new Date(NOW + 3_600_000).toUTCString(), '9999999999999999999999999999999999999999999999999999999999999']) {
  test(`429 honors Retry-After ${header} globally without sleeping or automatic retry`, async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; return json({ private: 'PRIVATE-THROTTLE' }, 429, { 'retry-after': header }); });
    try {
      const value = await f.provider.get('person-1'); assert.equal(value.reason, 'rate-limited'); assert.ok(value.retryAt! >= NOW + 3_600_000);
      f.advance(PEOPLE_LIMITS.freshMs); assert.equal((await f.provider.get('person-2')).reason, 'rate-limited'); assert.equal(calls, 1);
      assert.ok(!JSON.stringify(value).includes('PRIVATE'));
    } finally { f.provider.close(); }
  });
}

test('404, failures, malformed JSON/UTF-8, mismatched identity, and oversized bodies fail closed with a negative cache', async () => {
  for (const response of [json({}, 404), json({}, 500), new Response('PRIVATE-NOT-JSON'), json(person('wrong-person')),
    json({ ...person(), errors: {} }), new Response(new Uint8Array([0xff])), new Response('x'.repeat(PEOPLE_LIMITS.responseBytes + 1))]) {
    let calls = 0;
    const f = fixture(async () => { calls++; return response; });
    try {
      const value = await f.provider.get('person-1'); assert.equal(value.state, 'unavailable'); assert.equal(value.presence, 'unknown');
      assert.ok(!JSON.stringify(value).includes('PRIVATE')); await f.provider.get('person-1'); assert.equal(calls, 1);
    } finally { f.provider.close(); }
  }
});

test('relevance replacement and close cancel work, ignore late results, and prohibit new token reads', async () => {
  const gate = deferred<Response>(); let tokens = 0, nativeSignal: AbortSignal | undefined;
  const f = fixture(async (_url, init) => { nativeSignal = init!.signal as AbortSignal; return gate.promise; }, { token: () => { tokens++; return 'synthetic'; } });
  const pending = f.provider.get('person-1'); f.provider.setRelevantPeople(['person-2']);
  assert.equal((await pending).reason, 'canceled'); assert.equal(nativeSignal!.aborted, true);
  f.provider.close(); f.provider.close(); assert.equal(f.provider.setRelevantPeople(['person-1']), false);
  assert.equal((await f.provider.get('person-1')).reason, 'closed'); assert.equal(tokens, 1);
  gate.resolve(json(person())); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.provider.peek('person-1').reason, 'closed'); assert.equal(f.provider.capability().state, 'closed');
});

test('pre-aborted requests and invalid credentials never invoke injected fetch', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; throw new Error('FORBIDDEN'); }, { token: () => 'invalid\ntoken' });
  try {
    const abort = new AbortController(); abort.abort();
    assert.equal((await f.provider.get('person-1', abort.signal)).reason, 'canceled');
    assert.equal((await f.provider.get('person-1')).reason, 'denied'); assert.equal(calls, 0);
  } finally { f.provider.close(); }
});
