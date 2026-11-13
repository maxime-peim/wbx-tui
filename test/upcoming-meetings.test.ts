import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { UPCOMING_MEETINGS_LIMITS as LIMITS, UPCOMING_MEETINGS_SCOPE as SCOPE, WebexUpcomingMeetingsProvider,
  parseUpcomingMeeting, upcomingMeetingTime, upcomingMeetingURL, type UpcomingMeetingsOptions, type UpcomingMeetingsSession } from '../src/upcoming-meetings.js';

const NOW = Date.parse('2026-11-09T12:00:00.000Z'), MINUTE = 60_000;
const LINK = 'https://site.webex.com/site/j.php?MTID=m' + 'a'.repeat(32);
const iso = (offset: number) => new Date(NOW + offset).toISOString();
const raw = (id = 'meeting-1', offset = 10 * MINUTE) => ({ id, title: 'Synthetic meeting', start: iso(offset), end: iso(offset + 60 * MINUTE),
  meetingType: 'meetingSeries', state: 'active', scheduledType: 'meeting', webLink: LINK });
const json = (items: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify({ items }), { status, headers });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const session = (accountId = 'account-1', grantedScopes: readonly string[] = [SCOPE]): UpcomingMeetingsSession => ({ accountId, grantedScopes, token: () => 'SYNTHETIC-TOKEN' });
function fixture(t: TestContext, fetcher: typeof fetch = async () => json([raw()]), options: Partial<UpcomingMeetingsOptions> = {}) {
  let now = NOW;
  const calls: { url: string; init: RequestInit }[] = [];
  const provider = new WebexUpcomingMeetingsProvider({ enabled: true, session: session(), now: () => now, ...options,
    fetcher: async (input, init) => { calls.push({ url: String(input), init: init! }); return fetcher(input, init); } });
  t.after(() => provider.close());
  return { provider, calls, advance: (ms: number) => { now += ms; } };
}

test('default/unknown grants, spark:all, admin/write scopes, missing identity and missing transport never probe network or tokens', async t => {
  let forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('NETWORK FORBIDDEN'); });
  const token = () => { forbidden++; throw new Error('CREDENTIAL PROBE FORBIDDEN'); };
  const defaults = new WebexUpcomingMeetingsProvider(); assert.equal((await defaults.refresh()).state, 'off'); defaults.close();
  for (const grantedScopes of [undefined, [], ['spark:all'], ['meeting:admin_schedule_read'], ['meeting:schedules_write'], ['meeting:schedules_read-extra']]) {
    const p = new WebexUpcomingMeetingsProvider({ enabled: true, session: { accountId: 'account-1', grantedScopes, token }, fetcher: fetch });
    assert.equal((await p.refresh()).state, 'scope-required'); assert.equal(p.snapshot().requiredScope, SCOPE); p.close();
  }
  const noIdentity = new WebexUpcomingMeetingsProvider({ enabled: true, fetcher: fetch });
  assert.equal((await noIdentity.refresh()).reason, 'identity-missing'); noIdentity.close();
  const noTransport = new WebexUpcomingMeetingsProvider({ enabled: true, session: { ...session(), token } });
  assert.equal((await noTransport.refresh()).reason, 'transport-unavailable'); noTransport.close();
  const off = new WebexUpcomingMeetingsProvider({ session: { ...session(), token }, fetcher: fetch });
  assert.equal((await off.refresh()).state, 'off'); off.close(); assert.equal(forbidden, 0);
});

test('one approved current-user GET pins UTC range/type/current/size and never impersonates a host or joins', async t => {
  const f = fixture(t); assert.equal(f.calls.length, 0); assert.equal(f.provider.snapshot().reason, 'not-loaded');
  const value = await f.provider.refresh(), call = f.calls[0]!, url = new URL(call.url), headers = new Headers(call.init.headers);
  assert.equal(value.state, 'ready'); assert.equal(value.coverage, 'webex-current-series'); assert.equal(value.complete, true);
  assert.equal(url.origin, 'https://webexapis.com'); assert.equal(url.pathname, '/v1/meetings');
  assert.deepEqual(Object.fromEntries(url.searchParams), { meetingType: 'meetingSeries', current: 'true', max: '100', from: iso(-5 * MINUTE), to: iso(30 * MINUTE) });
  assert.equal(headers.get('timezone'), 'UTC'); assert.equal(headers.get('authorization'), 'Bearer SYNTHETIC-TOKEN');
  assert.equal(call.init.method, 'GET'); assert.equal(call.init.body, undefined); assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.credentials, 'omit'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.referrerPolicy, 'no-referrer');
  assert.equal(f.provider.joinTarget('meeting-1'), LINK); assert.equal(f.provider.joinTarget('not-loaded'), undefined); assert.equal(f.calls.length, 1);
});

test('only documented current-series/scheduled states are eligible, never terminal or actual-instance objects', () => {
  for (const [meetingType, state] of [['meetingSeries', 'active'], ['meetingSeries', 'inProgress'], ['scheduledMeeting', 'scheduled'], ['scheduledMeeting', 'ready']]) {
    assert.ok(parseUpcomingMeeting({ ...raw(), meetingType, state }));
  }
  for (const [meetingType, state] of [['meetingSeries', 'expired'], ['scheduledMeeting', 'missed'], ['scheduledMeeting', 'ended'], ['meeting', 'inProgress'],
    ['meeting', 'lobby'], ['meeting', 'ended'], ['meetingSeries', 'ready'], ['scheduledMeeting', 'unknown']]) {
    assert.equal(parseUpcomingMeeting({ ...raw(), meetingType, state }), undefined);
  }
  assert.equal(parseUpcomingMeeting({ ...raw(), scheduledType: 'webinar' }), undefined);
  assert.equal(parseUpcomingMeeting({ ...raw(), scheduledType: {} }), undefined);
  assert.ok(parseUpcomingMeeting({ ...raw(), scheduledType: 'personalRoomMeeting' }));
});

test('UTC timestamps and identities are strict; controls/bidi names are bounded and unrelated secrets are discarded', () => {
  for (const time of ['2026-02-30T00:00:00Z', '2026-11-09', 'bad', '2026-11-09T12:00:00+00:00', 0, {}, '2026-11-09T25:00:00Z']) assert.equal(upcomingMeetingTime(time), undefined);
  assert.equal(upcomingMeetingTime('2026-11-09T12:00:00.1Z'), '2026-11-09T12:00:00.100Z');
  for (const patch of [{ id: '../secret' }, { id: [] }, { start: 'bad' }, { end: iso(10 * MINUTE) }, { errors: {} }, { meetingType: {} }]) assert.equal(parseUpcomingMeeting({ ...raw(), ...patch }), undefined);
  const value = parseUpcomingMeeting({ ...raw(), title: 'Synthetic\n\x1b\u202e\u2066' + '😀'.repeat(200), password: 'PRIVATE-PASSWORD', hostKey: 'PRIVATE-HOST-KEY',
    hostEmail: 'PRIVATE-EMAIL', agenda: 'PRIVATE-AGENDA', joinURL: 'https://not-used.invalid/PRIVATE' })!;
  assert.ok(Array.from(value.title).length <= 120); assert.ok(!/[\x00-\x1f\u202e\u2066]/.test(value.title));
  assert.ok(!JSON.stringify(value).includes('PRIVATE')); assert.equal(value.joinUrl, LINK);
  assert.equal(parseUpcomingMeeting({ ...raw(), title: {} })!.title, 'Untitled Webex meeting');
});

test('visible join URLs reuse HTTPS Webex validation and refuse all secret/unknown query, host, port, fragment or path forms', () => {
  assert.equal(upcomingMeetingURL(LINK), LINK); assert.equal(upcomingMeetingURL('https://site.webex.com/meet/alex'), 'https://site.webex.com/meet/alex');
  assert.equal(upcomingMeetingURL('https://webex.com/j.php?MTID=m' + 'b'.repeat(32)), 'https://webex.com/j.php?MTID=m' + 'b'.repeat(32));
  for (const link of ['http://site.webex.com/meet/alex', 'https://site.webex.com.evil.invalid/meet/alex', 'https://evilwebex.com/meet/alex',
    'https://user:password@site.webex.com/meet/alex', 'https://site.webex.com:8443/meet/alex', 'https://site.webex.com/meet/alex#PRIVATE',
    'https://site.webex.com/meet/alex?pwd=PRIVATE', 'https://site.webex.com/unrecognized-path', 'https://site.webex.com/meet/alex\n',
    'https://site.webex.com/meet\\alex', LINK + '&password=PRIVATE', LINK + '&hostKey=PRIVATE', LINK + '&token=PRIVATE', LINK + '&tracking=PRIVATE',
    LINK + '&MTID=m' + 'b'.repeat(32), 'https://site.webex.com/site/j.php?MTID=PRIVATE', 'https://-site.webex.com/meet/alex']) {
    assert.equal(upcomingMeetingURL(link), undefined, link);
    const card = parseUpcomingMeeting({ ...raw(), webLink: link })!; assert.equal(card.joinable, false); assert.equal(card.joinUrl, undefined);
    assert.ok(!JSON.stringify(card).includes('PRIVATE'));
  }
  const undocumented = parseUpcomingMeeting({ ...raw(), webLink: undefined, joinURL: LINK })!;
  assert.equal(undocumented.joinable, false, 'never substitute undocumented joinURL');
});

test('default window is inclusive five-minute grace/exclusive thirty-minute future, sorted to three visible cards', async t => {
  const f = fixture(t, async () => json([raw('too-late', 30 * MINUTE), raw('too-old', -5 * MINUTE - 1), raw('far', 28 * MINUTE),
    raw('grace', -5 * MINUTE), raw('near', MINUTE), raw('middle', 10 * MINUTE), { ...raw('already-ended', -MINUTE), end: iso(0) }]));
  const value = await f.provider.refresh(); assert.deepEqual(value.items.map(item => item.id), ['grace', 'near', 'middle']);
  assert.equal(f.provider.joinTarget('far'), undefined, 'not a currently displayed card');
  f.advance(2 * MINUTE); assert.ok(!f.provider.snapshot().items.some(item => item.id === 'grace'), 'window is reevaluated without fetching');
  assert.equal(f.calls.length, 1);
});

test('clock/window injection is bounded and invalid configuration never expands network access', async t => {
  const f = fixture(t, async () => json([raw('past', -1), raw('one', MINUTE), raw('two', 2 * MINUTE)]), { window: { graceMs: 0, aheadMs: 2 * MINUTE, maxCards: 1 } });
  assert.deepEqual((await f.provider.refresh()).items.map(item => item.id), ['one']);
  for (const window of [{ graceMs: -1 }, { graceMs: 900_001 }, { aheadMs: 0 }, { aheadMs: 7_200_001 }, { maxCards: 4 }, { maxCards: 1.5 }]) {
    assert.throws(() => new WebexUpcomingMeetingsProvider({ window }));
  }
});

test('paginates at most two pinned pages, then labels bounded coverage rather than claiming global earliest results', async t => {
  const f = fixture(t, async input => {
    const url = new URL(String(input)), offset = Number(url.searchParams.get('offset') ?? 0), next = new URL(url);
    next.searchParams.set('offset', String(offset + 100));
    return json(Array.from({ length: 100 }, (_, n) => raw(`meeting-${offset + n}`, (200 - offset - n) * 1000)), 200, { link: `<${next.href}>; rel="next"` });
  });
  const value = await f.provider.refresh(); assert.equal(f.calls.length, 2); assert.equal(value.complete, false); assert.equal(value.reason, 'limit');
  assert.deepEqual(value.items.map(item => item.id), ['meeting-199', 'meeting-198', 'meeting-197']);
});

test('exact duplicate IDs are deduplicated and conflicting records/malformed rows cannot invent current cards', async t => {
  const duplicate = fixture(t, async () => json([raw(), raw()])); assert.equal((await duplicate.provider.refresh()).items.length, 1);
  const conflict = fixture(t, async () => json([raw(), { ...raw(), title: 'conflict' }])); assert.equal((await conflict.provider.refresh()).reason, 'invalid-data');
  const partial = fixture(t, async () => json([raw(), { errors: { secret: 'PRIVATE' } }]));
  const value = await partial.provider.refresh(); assert.equal(value.items.length, 1); assert.equal(value.complete, false); assert.equal(value.reason, 'partial-data');
});

test('unsafe/missing filters, host impersonation, cross-origin links and repeated cursors are refused before another GET', async t => {
  for (const mode of ['cross-origin', 'host', 'filter', 'duplicate', 'path', 'same', 'malformed']) {
    const f = fixture(t, async input => {
      const next = new URL(String(input)); next.searchParams.set('offset', '100');
      if (mode === 'cross-origin') next.hostname = 'not-webex.invalid';
      if (mode === 'host') next.searchParams.set('hostEmail', 'PRIVATE@example.invalid');
      if (mode === 'filter') next.searchParams.delete('from');
      if (mode === 'duplicate') next.searchParams.append('meetingType', 'meeting');
      if (mode === 'path') next.pathname = '/v1/people';
      if (mode === 'same') next.searchParams.delete('offset');
      return json([raw()], 200, { link: mode === 'malformed' ? 'PRIVATE NOT A LINK' : `<${next.href}>; rel="next"` });
    });
    const value = await f.provider.refresh(); assert.equal(value.reason, 'unsafe-pagination', mode); assert.equal(value.items.length, 0); assert.equal(f.calls.length, 1);
    assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  }
});

test('fresh cache is reused; later errors retain only original-timestamp stale slots, no URL/action and no fresh partial pages', async t => {
  let fail = false, pages = 0;
  const f = fixture(t, async input => {
    if (!fail) return json([raw('cached')]);
    if (++pages === 1) { const next = new URL(String(input)); next.searchParams.set('offset', '100'); return json([raw('not-committed')], 200, { link: `<${next.href}>; rel="next"` }); }
    throw new Error('PRIVATE PROVIDER ERROR');
  });
  await f.provider.refresh(); await f.provider.refresh(); assert.equal(f.calls.length, 1);
  f.advance(LIMITS.freshMs); assert.equal(f.provider.snapshot().state, 'stale'); assert.equal(f.provider.joinTarget('cached'), undefined);
  fail = true; const value = await f.provider.refresh(); assert.equal(value.state, 'stale'); assert.equal(value.observedAt, NOW);
  assert.deepEqual(value.items.map(item => item.id), ['cached']); assert.equal(value.items[0]!.joinable, false); assert.equal(value.items[0]!.joinUrl, undefined);
  await f.provider.refresh(); assert.equal(f.calls.length, 3, 'negative cache prevents retry storms');
  assert.ok(!JSON.stringify(value).includes('PRIVATE')); f.advance(LIMITS.staleMs);
  assert.equal(f.provider.snapshot().state, 'unavailable'); assert.deepEqual(f.provider.snapshot().items, []); assert.equal(f.provider.snapshot().observedAt, undefined);
});

test('loading old slots stay visibly non-actionable; successful refresh replaces rather than merges old meetings', async t => {
  const gate = deferred<Response>(); let calls = 0;
  const f = fixture(t, async () => ++calls === 1 ? json([raw('old')]) : gate.promise);
  await f.provider.refresh(); f.advance(LIMITS.freshMs); const pending = f.provider.refresh();
  assert.equal(f.provider.snapshot().state, 'loading'); assert.equal(f.provider.snapshot().items[0]!.joinUrl, undefined);
  gate.resolve(json([raw('new')])); assert.deepEqual((await pending).items.map(item => item.id), ['new']);
});

test('ended, out-of-grace and clock-reversal observations are withheld rather than appearing current', async t => {
  const f = fixture(t, async () => json([{ ...raw('short', MINUTE), end: iso(2 * MINUTE) }]));
  await f.provider.refresh(); f.advance(3 * MINUTE); assert.deepEqual(f.provider.snapshot().items, []);
  f.advance(-4 * MINUTE); assert.equal(f.provider.snapshot().state, 'unavailable'); assert.equal(f.provider.joinTarget('short'), undefined);
});

test('singleflight and retained subscriptions are bounded; callers cannot mutate one another or the cache', async t => {
  const gate = deferred<Response>(); const f = fixture(t, async () => gate.promise);
  const pending = Array.from({ length: LIMITS.waiters }, () => f.provider.refresh());
  assert.equal((await f.provider.refresh()).reason, 'busy'); assert.equal(f.calls.length, 1);
  gate.resolve(json([raw()])); const values = await Promise.all(pending);
  values[0]!.items[0]!.title = 'changed'; values[0]!.items.length = 0;
  assert.equal(values[1]!.items[0]!.title, 'Synthetic meeting'); assert.equal(f.provider.snapshot().items[0]!.title, 'Synthetic meeting');
});

test('one reader cancellation does not abort others; canceled subscriptions cannot accumulate behind a surviving reader', async t => {
  const gate = deferred<Response>(); const f = fixture(t, async () => gate.promise), survivor = f.provider.refresh();
  for (let n = 1; n < LIMITS.waiters; n++) {
    const abort = new AbortController(), pending = f.provider.refresh(abort.signal); abort.abort(); assert.equal((await pending).reason, 'canceled');
  }
  assert.equal(f.calls[0]!.init.signal!.aborted, false); assert.equal((await f.provider.refresh()).reason, 'busy');
  gate.resolve(json([raw()])); assert.equal((await survivor).state, 'ready');
});

test('last reader cancellation aborts transport and late data cannot populate the cache', async t => {
  const gate = deferred<Response>(); const f = fixture(t, async () => gate.promise), abort = new AbortController(), pending = f.provider.refresh(abort.signal);
  abort.abort(); assert.equal((await pending).reason, 'canceled'); assert.equal(f.calls[0]!.init.signal!.aborted, true);
  gate.resolve(json([raw()])); await tick(); assert.deepEqual(f.provider.snapshot().items, []);
});

test('old-account cancellation preserves a global native bound and suppresses late identity/state data', async t => {
  const gates = [deferred<Response>(), deferred<Response>()]; let n = 0;
  const f = fixture(t, async () => n < 2 ? gates[n++]!.promise : json([raw('current-account')]));
  const a = f.provider.refresh(); f.provider.setSession(session('account-2')); await a;
  const b = f.provider.refresh(); f.provider.setSession(session('account-3')); await b;
  assert.equal((await f.provider.refresh()).reason, 'busy'); assert.equal(f.calls.length, 2);
  gates.forEach(gate => gate.resolve(json([{ ...raw('PRIVATE-OLD-ACCOUNT'), title: 'PRIVATE-OLD' }]))); await tick();
  assert.ok(!JSON.stringify(f.provider.snapshot()).includes('PRIVATE')); assert.deepEqual(f.provider.snapshot().items, []);
  assert.deepEqual((await f.provider.refresh()).items.map(item => item.id), ['current-account']); assert.equal(f.calls.length, 3);
});

test('close and replacing grants synchronously drop slots and ignore pending old-session results', async t => {
  const gate = deferred<Response>(); const f = fixture(t, async () => gate.promise), pending = f.provider.refresh();
  f.provider.setSession(session('account-1', ['spark:all'])); await pending;
  assert.equal(f.provider.snapshot().state, 'scope-required'); gate.resolve(json([raw()])); await tick(); assert.deepEqual(f.provider.snapshot().items, []);
  f.provider.close(); f.provider.close(); f.provider.setSession(session());
  assert.equal((await f.provider.refresh()).state, 'off'); assert.equal(f.provider.snapshot().reason, 'closed'); assert.equal(f.calls.length, 1);
});

test('late old-account throttling cannot alter a different current account or its refresh timing', async t => {
  const old = deferred<Response>(); let n = 0;
  const f = fixture(t, async () => ++n === 1 ? old.promise : json([raw('current-account')]));
  const pending = f.provider.refresh(); f.provider.setSession(session('different-account')); await pending;
  assert.equal((await f.provider.refresh()).state, 'ready');
  old.resolve(json({}, 429, { 'retry-after': '3600' })); await tick();
  f.advance(LIMITS.freshMs); assert.equal((await f.provider.refresh()).state, 'ready'); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.provider.snapshot().items.map(item => item.id), ['current-account']);
});

test('whole-query deadline aborts hanging body/fetch and does not release canceled native admission early', async t => {
  const gates = [deferred<Response>(), deferred<Response>()]; let n = 0;
  const f = fixture(t, async () => gates[n++]!.promise, { timeoutMs: 10 });
  assert.equal((await f.provider.refresh()).reason, 'timeout'); assert.equal(f.calls[0]!.init.signal!.aborted, true);
  f.advance(LIMITS.failureMs); assert.equal((await f.provider.refresh()).reason, 'timeout');
  f.advance(LIMITS.failureMs); assert.equal((await f.provider.refresh()).reason, 'busy'); assert.equal(f.calls.length, 2);
  gates.forEach(gate => gate.resolve(json([raw()]))); await tick(); assert.deepEqual(f.provider.snapshot().items, []);
  let canceled = false;
  const body = fixture(t, async () => new Response(new ReadableStream({ cancel() { canceled = true; } })), { timeoutMs: 10 });
  assert.equal((await body.provider.refresh()).reason, 'timeout'); assert.equal(canceled, true);
});

test('unsettled response-body cleanup also retains admission, even for rejected responses', async t => {
  const gates = [deferred<void>(), deferred<void>()]; let n = 0;
  const f = fixture(t, async () => { const gate = gates[n++]!; return new Response(new ReadableStream({ cancel: () => gate.promise }), { status: 500 }); });
  await f.provider.refresh(); f.advance(LIMITS.failureMs); await f.provider.refresh(); f.advance(LIMITS.failureMs);
  assert.equal((await f.provider.refresh()).reason, 'busy'); assert.equal(f.calls.length, 2);
  gates.forEach(gate => gate.resolve()); await tick();
});

test('denial purges old cards and latches admission without publishing provider response text', async t => {
  for (const status of [401, 403]) {
    let n = 0; const f = fixture(t, async () => ++n === 1 ? json([raw()]) : json({ secret: 'PRIVATE-DENIAL' }, status));
    await f.provider.refresh(); f.advance(LIMITS.freshMs); const value = await f.provider.refresh();
    assert.equal(value.state, 'unavailable'); assert.equal(value.reason, 'denied'); assert.deepEqual(value.items, []);
    f.advance(MINUTE); await f.provider.refresh(); assert.equal(f.calls.length, 2); assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  }
});

for (const retry of ['3600', new Date(NOW + 3_600_000).toUTCString(), '9'.repeat(400)]) test(`Retry-After ${retry.length > 100 ? 'unrepresentably long' : retry} is honored without retry/sleep or grant-refresh bypass`, async t => {
  const f = fixture(t, async () => json({}, 429, { 'retry-after': retry }));
  const value = await f.provider.refresh(); assert.equal(value.reason, 'rate-limited'); assert.ok(value.retryAt! >= NOW + 3_600_000);
  f.provider.setSession(session()); f.advance(MINUTE); assert.equal((await f.provider.refresh()).reason, 'rate-limited'); assert.equal(f.calls.length, 1);
});

test('malformed JSON/UTF-8, body/count limits and empty-chunk storms fail closed, with no credential leakage', async t => {
  const responses = [new Response('PRIVATE-NON-JSON'), new Response(new Uint8Array([0xff])), new Response('x'.repeat(LIMITS.responseBytes + 1)),
    json(Array.from({ length: 101 }, (_, n) => raw(`m-${n}`))), json(null)];
  for (const response of responses) {
    const f = fixture(t, async () => response); const value = await f.provider.refresh();
    assert.equal(value.reason, 'invalid-data'); assert.deepEqual(value.items, []); assert.ok(!JSON.stringify(value).includes('PRIVATE'));
    await f.provider.refresh(); assert.equal(f.calls.length, 1);
  }
  let reads = 0;
  const f = fixture(t, async () => new Response(new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array()); } })));
  assert.equal((await f.provider.refresh()).reason, 'invalid-data'); assert.ok(reads <= LIMITS.responseReads + 2);
});

test('pre-aborted reads and invalid credentials perform no GET', async t => {
  const abort = new AbortController(); abort.abort(); const f = fixture(t);
  assert.equal((await f.provider.refresh(abort.signal)).reason, 'canceled'); assert.equal(f.calls.length, 0);
  f.provider.setSession({ ...session(), token: () => 'invalid\ntoken' }); assert.equal((await f.provider.refresh()).reason, 'denied'); assert.equal(f.calls.length, 0);
});
