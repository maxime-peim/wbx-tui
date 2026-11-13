import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { WebexUpcomingMeetingsProvider } from '../src/upcoming-meetings.js';
import { parseEditorOperation } from '../src/editor-protocol.js';

async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await setImmediate(); }
  assert.ok(predicate(), 'bounded asynchronous operation settled');
}
async function fixture(t: TestContext, scope = 'meeting:schedules_read', roomIds = ['room']) {
  const directory = await mkdtemp('/tmp/opencode/wbx-upcoming-integration-'), config = join(directory, 'config.json');
  const rooms = roomIds.map(id => ({ id, title: 'Synthetic space ' + id, type: 'group' as const }));
  let now = Date.now(), fetches = 0;
  const raw = { id: 'meeting', title: 'Synthetic meeting', meetingType: 'meetingSeries', state: 'active',
    start: new Date(now + 120_000).toISOString(), end: new Date(now + 3600_000).toISOString(), webLink: 'https://example.webex.com/meet/synthetic' };
  let reply = async () => new Response(JSON.stringify({ items: [raw] }), { status: 200 });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    fetches++; assert.equal(new URL(String(url)).origin, 'https://webexapis.com');
    assert.equal(new URL(String(url)).pathname, '/v1/meetings'); assert.equal(options?.method, 'GET');
    return reply();
  });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => ({ token: 'synthetic-renewed', expiresAt: Date.now() + 3600_000, scope }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rooms }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async (id: string) => ({ items: roomIds.length > 1
    ? [{ id: 'message-' + id, author: 'Synthetic author', text: 'Loaded history ' + id, created: new Date(now).toISOString() }] : [] }));
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'meeting:schedules_read'] } }), { mode: 0o600 });
  const engine = new EditorEngine(async () => { throw new Error('Browser forbidden.'); }, undefined, undefined,
    undefined, undefined, undefined, { now: () => now });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  return { engine, config, raw, fetches: () => fetches, clock: (value: number) => { now = value; }, now: () => now,
    response: (value: typeof reply) => { reply = value; } };
}

test('upcoming integration is inert without opt-in or known meeting grant; spark:all is not substituted', async t => {
  const f = await fixture(t, 'spark:all');
  await f.engine.start('live', f.config);
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'off'); assert.equal(f.fetches(), 0);
  f.engine.stop();
  await f.engine.start('live', f.config, false, false, true);
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'scope-required'); assert.equal(f.fetches(), 0);
  await f.engine.refreshUpcoming(); assert.equal(f.fetches(), 0);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', f.engine.snapshot().upcomingMeetings.revision), /not freshly joinable/);
});

test('meeting discovery is separate, URL-free in RPC state and never selects, marks read or joins', async t => {
  const f = await fixture(t);
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const snapshot = f.engine.snapshot().upcomingMeetings;
  assert.equal(f.fetches(), 1); assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]!.joinable, true); assert.equal(f.engine.snapshot().room, null);
  assert.ok(!JSON.stringify(snapshot).includes('webex.com')); assert.ok(!('joinUrl' in snapshot.items[0]!));
  assert.equal(f.engine.upcomingJoinTarget('meeting', snapshot.revision), f.raw.webLink);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', snapshot.revision - 1), /changed/);
  await f.engine.rooms(); await f.engine.history().catch(() => {});
  assert.equal(f.fetches(), 1, 'room operations do not amplify meeting discovery');
  f.clock(f.now() + 61_000);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', snapshot.revision), /not freshly joinable/);
  assert.equal(f.engine.snapshot().upcomingMeetings.items[0]!.joinable, false);
  await f.engine.refreshUpcoming(); assert.equal(f.fetches(), 2);
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'ready');
});

test('clock expiry removes cards; failure and late stopped-session success cannot admit a join', async t => {
  const f = await fixture(t);
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const old = f.engine.snapshot().upcomingMeetings;
  f.clock(Date.parse(f.raw.start) + 300_001);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', old.revision), /not freshly joinable/);
  assert.equal(f.engine.snapshot().upcomingMeetings.items.length, 0, 'action admission commits clock expiry without fetching or waiting for the timer');
  assert.equal(f.fetches(), 1);
  let resolve!: (response: Response) => void;
  f.response(() => new Promise(done => { resolve = done; }));
  const pending = f.engine.refreshUpcoming();
  await eventually(() => !!resolve);
  f.engine.stop();
  resolve(new Response(JSON.stringify({ items: [f.raw] })));
  await pending;
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'off');
  assert.equal(f.engine.snapshot().upcomingMeetings.items.length, 0);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', old.revision), /Connect first/);
});

test('optional discovery never blocks messaging startup behind its service', async t => {
  const f = await fixture(t);
  let finish!: (response: Response) => void;
  f.response(() => new Promise(resolve => { finish = resolve; }));
  await f.engine.start('live', f.config, false, false, true);
  assert.equal(f.engine.snapshot().state, 'ready'); assert.equal(f.engine.snapshot().rooms.length, 1);
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'loading');
  finish(new Response(JSON.stringify({ items: [f.raw] })));
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
});

test('engine snapshots do not read or revise agenda ownership', async t => {
  const f = await fixture(t);
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const provider = t.mock.method(WebexUpcomingMeetingsProvider.prototype, 'snapshot');
  const before = f.engine.snapshot();
  for (let i = 0; i < 20; i++) assert.deepEqual(f.engine.snapshot(), before);
  assert.equal(provider.mock.callCount(), 0, 'agenda projection uses explicitly reconciled owner state');
  const changed = f.engine.snapshot(); changed.upcomingMeetings.items[0]!.id = 'foreign'; changed.upcomingMeetings.items.length = 0;
  assert.deepEqual(f.engine.snapshot(), before, 'public agenda objects do not alias the committed projection');
});

test('renewed agenda ownership ignores an abandoned earlier response and retains fresh action revision checks', async t => {
  const f = await fixture(t); let oldFinish!: (response: Response) => void;
  f.response(() => new Promise(resolve => { oldFinish = resolve; }));
  await f.engine.start('live', f.config, false, false, true);
  const old = f.engine.snapshot().upcomingMeetings;
  assert.equal(old.state, 'loading');
  f.clock(f.now() + 11_000);
  f.response(async () => new Response(JSON.stringify({ items: [{ ...f.raw, title: 'Renewed owner' }] })));
  await f.engine.refreshAuth();
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const current = f.engine.snapshot(), agenda = current.upcomingMeetings;
  assert.equal(agenda.items[0]!.title, 'Renewed owner'); assert.ok(agenda.revision > old.revision);
  oldFinish(new Response(JSON.stringify({ items: [{ ...f.raw, title: 'Abandoned owner' }] })));
  await setImmediate();
  assert.deepEqual(f.engine.snapshot(), current);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', old.revision), /changed/);
  assert.equal(f.engine.upcomingJoinTarget('meeting', agenda.revision), f.raw.webLink);
  assert.equal(f.fetches(), 2);
});

test('local scheduling tick publishes expired-card removal and cannot restart after stop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t), events: any[] = [];
  f.engine.on('state', value => events.push(value));
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  events.length = 0;
  f.clock(Date.parse(f.raw.start) + 300_001);
  t.mock.timers.tick(15_000);
  assert.ok(events.some(value => value.upcomingMeetings.items.length === 0), 'expiry is published without a user action or a successful response');
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  f.engine.stop();
  const calls = f.fetches();
  t.mock.timers.tick(600_000); await setImmediate();
  assert.equal(f.fetches(), calls); assert.equal(f.engine.snapshot().upcomingMeetings.state, 'off');
});

test('clock-only reconciliation publishes fresh-to-stale and removal revisions without a provider response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t), events: ReturnType<EditorEngine['snapshot']>[] = [];
  f.engine.on('state', value => events.push(value));
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const ready = f.engine.snapshot().upcomingMeetings, frozen = structuredClone(ready);
  let finish!: (response: Response) => void;
  f.response(() => new Promise(resolve => { finish = resolve; }));
  events.length = 0;
  f.clock(f.now() + 61_000);
  assert.deepEqual(f.engine.snapshot().upcomingMeetings, ready, 'projection does not secretly commit a clock transition');
  t.mock.timers.tick(15_000);
  const stale = events.find(value => value.upcomingMeetings.state === 'stale')!.upcomingMeetings;
  assert.ok(stale.revision > ready.revision); assert.equal(stale.items[0]!.joinable, false);
  assert.deepEqual(ready, frozen, 'previously emitted agenda remains detached');
  await eventually(() => !!finish);
  assert.throws(() => f.engine.upcomingJoinTarget('meeting', ready.revision), /not freshly joinable/);
  events.length = 0;
  f.clock(Date.parse(f.raw.start) + 300_001);
  t.mock.timers.tick(15_000);
  assert.ok(events.some(value => value.upcomingMeetings.items.length === 0 && value.upcomingMeetings.revision > stale.revision));
  assert.equal(f.fetches(), 2, 'one unresolved refresh, no duplicate discovery after clock expiry');
  f.engine.stop(); const stopped = f.engine.snapshot();
  finish(new Response(JSON.stringify({ items: [f.raw] })));
  await setImmediate();
  assert.deepEqual(f.engine.snapshot(), stopped);
});

test('upcoming Enter revalidates identity/revision and uses the existing live single-owner join with transmission off', async t => {
  const f = await fixture(t);
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const meetings = new EditorMeetings(), starts: unknown[] = [];
  t.mock.method(meetings, 'start', async (options: Parameters<EditorMeetings['start']>[0]) => { starts.push(options); return meetings.snapshot(); });
  t.mock.method(meetings, 'close', async () => {});
  const output: any[] = [], rpc = new EditorRPC(f.engine, meetings, value => output.push(value));
  const send = async (id: number, method: string, params = {}) => { await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return [...output].reverse().find(item => item.id === id); };
  await send(1, 'hello', { version: 1 });
  const revision = f.engine.snapshot().upcomingMeetings.revision;
  assert.equal((await send(2, 'meeting.joinUpcoming', { meetingId: 'meeting', revision, meeting: 'https://evil.test', headless: true })).error.code, -32602);
  assert.equal(starts.length, 0);
  await send(3, 'meeting.joinUpcoming', { meetingId: 'meeting', revision, display: 'editor' });
  assert.deepEqual(starts, [{ mode: 'live', meeting: f.raw.webLink, config: f.config, display: 'editor', fallback: 'editor', headless: false }]);
  f.clock(f.now() + 61_000);
  assert.equal((await send(4, 'meeting.joinUpcoming', { meetingId: 'meeting', revision })).error.code, -32027);
  assert.equal(starts.length, 1, 'stale action does not refetch and automatically join');
  await send(5, 'shutdown');
  await send(6, 'meeting.joinUpcoming', { meetingId: 'meeting', revision });
  assert.equal(starts.length, 1);
});

test('upcoming protocol flags and row identity reject coercion, enumeration and arbitrary URLs', () => {
  for (const params of [{ mode: 'live', upcomingMeetings: 1 }, { mode: 'live', upcomingMeetings: 'true' }])
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'session.start', params }));
  for (const params of [{ personId: 'other' }, { hostEmail: 'other@example.test' }, { force: true }])
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'meetings.upcoming', params }));
  for (const revision of [0, -1, 1.5, '1', null])
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'meeting.joinUpcoming', params: { meetingId: 'meeting', revision } }));
});

test('ordinary RPC space navigation completes while optional agenda is held, then agenda settles independently', async t => {
  const f = await fixture(t, 'meeting:schedules_read', ['room', 'other']);
  let release!: (response: Response) => void, agendaSettled = false;
  f.response(() => new Promise(resolve => { release = response => { agendaSettled = true; resolve(response); }; }));
  await f.engine.start('live', f.config, false, false, true);
  assert.equal(f.engine.snapshot().upcomingMeetings.state, 'loading');
  const output: any[] = [], meetings = new EditorMeetings();
  const rpc = new EditorRPC(f.engine, meetings, value => output.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id;
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const response = output.find(value => value.id === request);
    assert.ok(response && !response.error, method + ': ordinary response completes before agenda release');
    return response;
  };
  await send('hello', { version: 1 });
  const timings: { room: string; milliseconds: number }[] = [];
  for (const room of ['room', 'other', 'room']) {
    const started = performance.now();
    await send('rooms.select', { roomId: room });
    const state = (await send('state.get')).result;
    timings.push({ room, milliseconds: performance.now() - started });
    assert.equal(agendaSettled, false, 'navigation never waits for optional service completion');
    assert.equal(state.ready, true); assert.equal(state.room.id, room);
    assert.equal(state.messages[0].text, 'Loaded history ' + room);
    assert.equal(state.upcomingMeetings.state, 'loading');
    assert.equal(f.fetches(), 1, 'room navigation does not restart agenda work');
  }
  release(new Response(JSON.stringify({ items: [f.raw] })));
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const final = f.engine.snapshot();
  assert.equal(final.room?.id, 'room'); assert.equal(final.messages[0]!.text, 'Loaded history room');
  assert.equal(final.upcomingMeetings.items[0]!.title, 'Synthetic meeting');
  t.diagnostic(JSON.stringify({ workflow: 'A -> B -> A with agenda held', timings, independentAgendaRequests: f.fetches() }));
});

test('cached agenda refresh returns immediately without whole-application broadcasts or revision churn', async t => {
  const f = await fixture(t);
  await f.engine.start('live', f.config, false, false, true);
  await eventually(() => f.engine.snapshot().upcomingMeetings.state === 'ready');
  const output: any[] = [], meetings = new EditorMeetings();
  const rpc = new EditorRPC(f.engine, meetings, value => output.push(value));
  t.after(() => rpc.close());
  await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } }));
  await setImmediate(); output.length = 0;
  const before = f.engine.snapshot(), events: unknown[] = [];
  f.engine.on('state', value => events.push(value));
  for (let id = 2; id < 8; id++) {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method: 'meetings.upcoming', params: {} }));
    const response = output.find(value => value.id === id);
    assert.deepEqual(response?.result, before.upcomingMeetings, 'cache hit returns the committed feature snapshot');
  }
  assert.equal(f.fetches(), 1, 'all six refreshes use the provider observation');
  assert.equal(events.length, 0, 'unchanged feature refresh must not redraw unrelated rooms/history/drafts');
  assert.equal(output.filter(value => value.method === 'state').length, 0);
  assert.deepEqual(f.engine.snapshot(), before, 'neither feature nor application revision changes without a change');
});
