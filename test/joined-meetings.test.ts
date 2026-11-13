import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JOINED_MEETINGS_LIMITS as LIMITS, parseJoinedMeetings, validJoinedMeetings, type JoinedMeetingsSnapshot } from '../src/joined-meetings.js';
import { SDKJoinedMeetings } from '../src/joined-meetings-sdk.js';
import type { ReadStatusSDK } from '../src/read-status-sdk.js';
import { validReadStatusRequest } from '../src/read-status-protocol.js';

const DEVICE = 'https://wdm.example.invalid/devices/metadata';
const locus = () => ({ url: 'https://locus.example.invalid/locus/api/v1/loci/one', fullState: { state: 'ACTIVE' },
  self: { state: 'JOINED', removed: false, devices: [{ url: 'https://wdm.example.invalid/devices/desktop', state: 'JOINED', intent: { type: 'CALL' } }] },
  info: { topic: 'Running space call', webExMeetingName: 'Scheduled call', password: 'PRIVATE' }, participants: ['PRIVATE'] });
const settle = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };

test('cross-device parser requires active self and a different joined device; never infers from participants or schedule', () => {
  const raw = locus(), items = parseJoinedMeetings({ loci: [raw, raw] }, DEVICE);
  assert.equal(items.length, 1); assert.equal(items[0]!.title, 'Running space call');
  assert.match(items[0]!.id, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(items).includes('PRIVATE')); assert.ok(!JSON.stringify(items).includes('https:'));
  for (const state of ['LEFT', 'IDLE', 'NOTIFIED', 'DECLINED', undefined]) {
    assert.deepEqual(parseJoinedMeetings({ loci: [{ ...raw, self: { ...raw.self, state } }] }, DEVICE), []);
    assert.deepEqual(parseJoinedMeetings({ loci: [{ ...raw, self: { ...raw.self, devices: [{ ...raw.self.devices[0], state }] } }] }, DEVICE), []);
  }
  for (const self of [undefined, { ...raw.self, removed: true }, { ...raw.self, devices: [] },
    { ...raw.self, devices: [{ ...raw.self.devices[0], url: DEVICE }] },
    { ...raw.self, devices: [...raw.self.devices, { ...raw.self.devices[0], url: DEVICE }] },
    ...['WAIT', 'OBSERVE', 'MOVE_MEDIA', 'unknown'].map(type => ({ ...raw.self, devices: [{ ...raw.self.devices[0], intent: { type } }] })),
    { ...raw.self, removed: 'false' }, { ...raw.self, devices: [{ ...raw.self.devices[0], intent: 'CALL' }] }])
    assert.deepEqual(parseJoinedMeetings({ loci: [{ ...raw, self }] }, DEVICE), []);
  for (const fullState of [undefined, { state: 'INACTIVE' }, { state: 'ACTIVE', active: false }, { state: 'ACTIVE', active: 'true' }])
    assert.deepEqual(parseJoinedMeetings({ loci: [{ ...raw, fullState }] }, DEVICE), []);
  assert.equal(parseJoinedMeetings({ loci: [{ ...raw, info: {} }] }, DEVICE)[0]!.title, 'Meeting');
  assert.equal(parseJoinedMeetings({ loci: [{ ...raw, info: { topic: '\x1b\u202e Heading\n' + '🙂'.repeat(150) } }] }, DEVICE)[0]!.title,
    'Heading ' + '🙂'.repeat(112));
});

test('discovery bounds and IPC reject raw URLs, extras, duplicates, untrusted federation and non-ready cards', () => {
  const items = parseJoinedMeetings({ loci: Array.from({ length: 10 }, (_, i) => ({ ...locus(), url: locus().url + i })) }, DEVICE);
  assert.equal(items.length, 3);
  for (const body of [{}, { loci: 'bad' }, { loci: Array(201).fill(locus()) }, { loci: [locus()], private: 'x'.repeat(LIMITS.bytes) },
    { loci: [locus()], remoteLocusClusterUrls: ['https://untrusted.invalid/'] }])
    assert.throws(() => parseJoinedMeetings(body, DEVICE));
  for (const device of [undefined, 'http://invalid/device', 'https://invalid/device?secret=x']) assert.throws(() => parseJoinedMeetings({ loci: [] }, device));
  const snapshot: JoinedMeetingsSnapshot = { state: 'ready', partial: true, items, observedAt: Date.now() };
  assert.ok(validJoinedMeetings(snapshot));
  for (const bad of [{ ...snapshot, raw: 'PRIVATE' }, { ...snapshot, observedAt: undefined }, { ...snapshot, partial: false },
    { ...snapshot, items: [items[0], items[0]] }, { ...snapshot, items: [{ ...items[0], joinUrl: 'https://example.webex.com' }] },
    { ...snapshot, items: [{ ...items[0], title: '\u202e spoof' }] }, { ...snapshot, state: 'unavailable' }]) assert.equal(validJoinedMeetings(bad), false);
  assert.ok(validReadStatusRequest({ type: 'joined-meetings' }));
  assert.equal(validReadStatusRequest({ type: 'joined-meetings', url: 'https://untrusted.invalid' }), false);
});

function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  const events = new EventEmitter(), snapshots: JoinedMeetingsSnapshot[] = [], requests: unknown[] = [];
  let reply = async () => ({ statusCode: 200, body: { loci: [locus()] } });
  let admitted = true;
  const sdk = { internal: { device: { url: DEVICE }, mercury: events,
    conversation: { request(options: unknown) { requests.push(options); return reply(); } } } } as unknown as ReadStatusSDK;
  const discovery = new SDKJoinedMeetings(sdk, value => snapshots.push(structuredClone(value)), () => admitted);
  t.after(() => discovery.close());
  return { events, snapshots, requests, discovery, reply: (fn: typeof reply) => { reply = fn; }, admitted: (value: boolean) => { admitted = value; } };
}

test('read-only discovery coalesces event storms, rechecks instead of trusting pushes, and removes ended meetings', async t => {
  const f = fixture(t);
  assert.equal(f.requests.length, 0);
  f.discovery.refresh(); await settle();
  assert.equal(f.snapshots.at(-1)!.items.length, 1);
  assert.deepEqual(f.requests[0], { method: 'GET', api: 'locus', resource: 'loci', timeout: 8000,
    followRedirect: false, followAllRedirects: false, maxRedirects: 0, shouldRefreshAccessToken: false });
  for (let i = 0; i < 100; i++) f.events.emit('event:locus', { data: { locus: locus() } });
  assert.equal(f.snapshots.length, 2, 'an event storm cannot fill IPC or retire the messaging owner');
  assert.equal(f.snapshots.at(-1)!.state, 'loading'); assert.equal(f.requests.length, 1);
  f.reply(async () => ({ statusCode: 200, body: { loci: [] } }));
  t.mock.timers.tick(10_000); await settle();
  assert.equal(f.requests.length, 2); assert.deepEqual(f.snapshots.at(-1)!.items, []);
  f.discovery.close(); const count = f.snapshots.length;
  f.events.emit('event:locus', {}); t.mock.timers.tick(600_000); await settle();
  assert.equal(f.requests.length, 2); assert.equal(f.snapshots.length, count);
  assert.equal(f.events.listenerCount('event:locus'), 0);
});

test('pending read is never overlapped and a newer hint invalidates its result before one follow-up', async t => {
  const f = fixture(t);
  let finish!: (value: { statusCode: number; body: { loci: ReturnType<typeof locus>[] } }) => void;
  f.reply(() => new Promise(resolve => { finish = resolve; }));
  f.discovery.refresh(); f.events.emit('event:locus', {});
  for (let i = 0; i < 100; i++) f.discovery.refresh();
  assert.equal(f.requests.length, 1);
  finish({ statusCode: 200, body: { loci: [locus()] } }); await settle();
  assert.equal(f.snapshots.some(value => value.state === 'ready'), false);
  f.reply(async () => ({ statusCode: 200, body: { loci: [] } }));
  t.mock.timers.tick(10_000); await settle();
  assert.equal(f.requests.length, 2); assert.equal(f.snapshots.at(-1)!.state, 'ready');
});

test('rate limit honors Retry-After, admission loss does not reconnect, and deadline retires only discovery', async t => {
  const f = fixture(t);
  f.reply(async () => { throw { statusCode: 429, headers: { 'retry-after': '180' } }; });
  f.discovery.refresh(); await settle();
  assert.equal(f.snapshots.at(-1)!.state, 'unavailable');
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(30_000); f.discovery.refresh(); await settle(); }
  assert.equal(f.requests.length, 1);
  f.admitted(false); t.mock.timers.tick(60_000); await settle();
  assert.equal(f.requests.length, 1);
  const count = f.snapshots.length;
  for (let i = 0; i < 1000; i++) f.events.emit('event:locus', {});
  assert.equal(f.snapshots.length, count, 'backoff hints cannot fill the shared messaging IPC');
  f.admitted(true); f.reply(() => new Promise(() => {})); f.discovery.refresh();
  assert.equal(f.requests.length, 2);
  t.mock.timers.tick(8000); await settle();
  assert.equal(f.snapshots.at(-1)!.state, 'unavailable');
  f.discovery.refresh(); t.mock.timers.tick(600_000); await settle();
  assert.equal(f.requests.length, 2); assert.equal(f.events.listenerCount('event:locus'), 0);
});

test('stopping discards a late native result and a missing local device refuses discovery before any lookup', async t => {
  const f = fixture(t);
  let finish!: (value: { statusCode: number; body: { loci: ReturnType<typeof locus>[] } }) => void;
  f.reply(() => new Promise(resolve => { finish = resolve; }));
  f.discovery.refresh(); f.discovery.close();
  finish({ statusCode: 200, body: { loci: [locus()] } }); await settle();
  assert.deepEqual(f.snapshots, []);
  let calls = 0;
  const events = new EventEmitter(), states: JoinedMeetingsSnapshot[] = [];
  const sdk = { internal: { device: {}, mercury: events, conversation: { request: async () => { calls++; return {}; } } } } as unknown as ReadStatusSDK;
  const discovery = new SDKJoinedMeetings(sdk, value => states.push(value));
  discovery.refresh(); await settle(); discovery.close();
  assert.equal(calls, 0); assert.equal(states.at(-1)!.state, 'unavailable');
});
