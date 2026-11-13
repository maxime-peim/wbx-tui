import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SenderNames, SENDER_NAME_LIMITS, senderName } from '../src/sender-names.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const session = (grants = ['spark:people_read']) => ({ enabled: true, grantedScopes: grants, token: () => 'SYNTHETIC' });
test('names start in parallel pairs without exceeding two starts per rolling two seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const starts: number[] = [];
  const names = new SenderNames({ fetcher: async input => {
    starts.push(Date.now());
    const id = new URL(String(input)).pathname.split('/').at(-1)!;
    return Response.json({ id, displayName: id });
  } });
  names.setSession(session()); names.observe(['one', 'two', 'three', 'four']); await tick();
  assert.deepEqual(starts, [10000, 10000], 'both available physical slots start together, even for fast responses');
  t.mock.timers.tick(1999); await tick(); assert.equal(starts.length, 2);
  t.mock.timers.tick(1); await tick(); assert.deepEqual(starts, [10000, 10000, 12000, 12000]);
  assert.equal(names.peek('four'), 'four'); names.setSession();
});
test('names sanitize bounded Unicode without treating emails or unrelated profile fields as names', () => {
  assert.equal(senderName(' \u202eAlice\n <tag> &\u200b '), 'Alice <tag> &');
  assert.equal(Array.from(senderName('😀'.repeat(5000))).length, 120);
  assert.equal(senderName(42), '');
});
test('one directory shares bounded cache for repeated sender IDs; getters and absent consent/grants never fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const calls: string[] = [];
  const names = new SenderNames({ fetcher: async (url, options) => {
    calls.push(String(url)); assert.equal(options?.redirect, 'error');
    const id = decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1)!);
    return Response.json({ id, type: 'person', displayName: 'Alice', emails: ['PRIVATE'], status: 'call' });
  } });
  names.observe(['person']); names.peek('person'); assert.deepEqual(calls, []);
  names.setSession(session([])); names.observe(['person']); await tick(); assert.deepEqual(calls, []);
  names.setSession(session()); names.observe(Array(50).fill('person')); await tick();
  assert.equal(calls.length, 1); assert.equal(names.peek('person'), 'Alice');
  for (let i = 0; i < 20; i++) names.observe(['person']);
  await tick(); assert.equal(calls.length, 1);
  t.mock.timers.tick(SENDER_NAME_LIMITS.freshMs); assert.equal(names.peek('person'), 'Alice', 'a due refresh does not flash back to email');
  names.observe(['person']); await tick(); assert.equal(calls.length, 2);
  names.setSession(); assert.equal(names.peek('person'), undefined);
});
test('a failed background name refresh retains presentation until the session/grant changes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let failed = false;
  const names = new SenderNames({ fetcher: async () => failed ? new Response('', { status: 503 })
    : Response.json({ id: 'person', displayName: 'Known human name' }) });
  names.setSession(session()); names.observe(['person']); await tick();
  failed = true; t.mock.timers.tick(SENDER_NAME_LIMITS.freshMs);
  names.observe(['person']); await tick();
  assert.equal(names.peek('person'), 'Known human name');
  names.setSession(session([]));
  assert.equal(names.peek('person'), undefined, 'retention never crosses permission/account boundaries');
});
for (const failure of ['identity', 'empty', 'denied', 'rate', 'oversized'] as const) test(`profile ${failure} fails closed and does not retry every observation`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let calls = 0;
  const names = new SenderNames({ fetcher: async () => {
    calls++;
    if (failure === 'denied') return new Response('', { status: 403 });
    if (failure === 'rate') return new Response('', { status: 429, headers: { 'Retry-After': '3600' } });
    return Response.json({ id: failure === 'identity' ? 'foreign' : 'person', displayName: failure === 'empty' ? '' : 'A'.repeat(failure === 'oversized' ? 70000 : 4) });
  } });
  names.setSession(session()); names.observe(['person']); await tick();
  assert.equal(names.peek('person'), undefined);
  for (let i = 0; i < 100; i++) names.observe(['person']);
  await tick(); assert.equal(calls, 1);
  if (failure === 'denied' || failure === 'rate') {
    t.mock.timers.tick(60000); names.observe(['person']); await tick(); assert.equal(calls, 1);
  }
  names.setSession();
});
test('reset and deadline retain stubborn physical requests and old results cannot fill a replacement cache', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const gates = [deferred<Response>(), deferred<Response>()]; let calls = 0;
  const names = new SenderNames({ fetcher: async () => {
    const gate = gates[calls++]; return gate ? gate.promise : Response.json({ id: 'new', displayName: 'New account' });
  } });
  names.setSession(session()); names.observe(['old-a', 'old-b']);
  await tick(); t.mock.timers.tick(1000); await tick(); assert.equal(calls, 2);
  t.mock.timers.tick(8000); names.setSession(session()); names.observe(['new']);
  await tick(); assert.equal(calls, 2, 'aborted but physical work still owns both slots');
  gates[0]!.resolve(Response.json({ id: 'old-a', displayName: 'OLD ACCOUNT' })); await tick(); await tick();
  assert.equal(calls, 3); assert.equal(names.peek('old-a'), undefined); assert.equal(names.peek('new'), 'New account');
  gates[1]!.resolve(Response.json({ id: 'old-b', displayName: 'OLD ACCOUNT' })); await tick();
  names.setSession();
});
test('distinct queue, relevance and cache remain bounded under repeated observation and late cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let calls = 0; const gate = deferred<Response>();
  const names = new SenderNames({ fetcher: async () => { calls++; return gate.promise; } });
  names.setSession(session());
  names.observe(Array.from({ length: 5000 }, (_, i) => 'person-' + i));
  assert.ok(names.diagnostics().pending <= 32); assert.ok(names.diagnostics().relevant <= 128);
  for (let i = 0; i < 1000; i++) names.observe(['latest']);
  t.mock.timers.tick(1000); await tick(); assert.ok(calls <= 2);
  names.setSession(); gate.resolve(Response.json({ id: 'latest', displayName: 'Late' })); await tick();
  assert.equal(names.peek('latest'), undefined);
});
test('negative retention expires only on a new observation; bounded cache and start spacing survive churn', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const starts: number[] = [];
  const names = new SenderNames({ fetcher: async url => {
    starts.push(Date.now());
    const id = decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1)!);
    return Response.json({ id, displayName: id === 'empty' ? '' : 'Name ' + id });
  } });
  names.setSession(session()); names.observe(['empty']); await tick();
  t.mock.timers.tick(SENDER_NAME_LIMITS.negativeMs);
  await tick(); assert.equal(starts.length, 1, 'no polling/retry when retention expires');
  names.observe(['empty']); await tick(); assert.equal(starts.length, 2);
  for (let i = 0; i < 300; i++) {
    t.mock.timers.tick(1000); names.observe(['id-' + i]); await tick();
    assert.ok(names.diagnostics().cached <= 256);
  }
  assert.equal(names.diagnostics().cached, 256);
  assert.ok(starts.slice(1).every((at, i) => at - starts[i]! >= 1000));
  assert.equal(names.peek('id-299'), 'Name id-299');
  names.setSession(); assert.deepEqual(names.diagnostics(), { relevant: 0, cached: 0, pending: 0, physical: 0 });
});
test('slow response-body cancellation retains both physical slots across a replacement and cannot publish old names', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const cleanup = [deferred<void>(), deferred<void>()];
  let calls = 0, changes = 0, cancellations = 0;
  const names = new SenderNames({ fetcher: async () => {
    const index = calls++;
    if (index >= 2) return Response.json({ id: 'replacement', displayName: 'Replacement' });
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(65537)); },
      cancel() { cancellations++; return cleanup[index]!.promise; },
    }));
  } });
  names.onChange = () => { changes++; };
  names.setSession(session()); names.observe(['old-a', 'old-b']); await tick();
  t.mock.timers.tick(1000); await tick();
  assert.equal(calls, 2); assert.equal(cancellations, 2);
  names.setSession(session()); names.observe(['replacement']);
  t.mock.timers.tick(8000); await tick();
  assert.equal(calls, 2); assert.equal(names.diagnostics().physical, 2); assert.equal(changes, 0);
  cleanup[0]!.resolve(); await tick(); await tick();
  assert.equal(calls, 3); assert.equal(names.peek('replacement'), 'Replacement'); assert.equal(changes, 1);
  cleanup[1]!.resolve(); await tick(); assert.equal(changes, 1);
  names.setSession();
});
test('denial erases earlier names, cancels remaining work and stays latched until explicit session replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let calls = 0;
  const names = new SenderNames({ fetcher: async url => {
    calls++;
    const id = decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1)!);
    return calls === 2 ? new Response('', { status: 401 }) : Response.json({ id, displayName: 'Name' });
  } });
  names.setSession(session()); names.observe(['first']); await tick(); assert.equal(names.peek('first'), 'Name');
  names.observe(['first', 'denied', 'queued']); t.mock.timers.tick(1000); await tick();
  assert.equal(names.allowed(), false); assert.equal(names.peek('first'), undefined);
  assert.equal(names.diagnostics().cached, 0); assert.equal(names.diagnostics().pending, 0);
  t.mock.timers.tick(600000); names.observe(['first', 'queued']); await tick(); assert.equal(calls, 2);
  names.setSession(session()); names.observe(['first']); await tick();
  assert.equal(calls, 3); assert.equal(names.peek('first'), 'Name');
  names.setSession();
});
test('server rate limits survive account replacement and irrelevant successes never refill the cache', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let calls = 0; const gate = deferred<Response>();
  const names = new SenderNames({ fetcher: async () => ++calls === 1
    ? new Response('', { status: 429, headers: { 'Retry-After': '3600' } }) : gate.promise });
  names.setSession(session()); names.observe(['first']); await tick();
  names.setSession(session()); names.observe(['second']);
  t.mock.timers.tick(3599999); await tick(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await tick(); assert.equal(calls, 2);
  names.observe([]);
  gate.resolve(Response.json({ id: 'second', displayName: 'Irrelevant late name' })); await tick();
  assert.equal(names.diagnostics().cached, 0); assert.equal(names.peek('second'), undefined);
  names.setSession();
});
