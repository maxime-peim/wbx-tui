import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { ReadStatusWorker, type ReadStatusSource } from '../src/read-status.js';
import { readStatusSelfId, parseRoomReadStatus, parseMessageCreated, notificationExcerpt, validMessageCreated, validRoomReadStatus, validReadStatusRequest, validReadStatusFailure, readStatusStartupFailure, readStatusRetryAt, ReadStatusDeadline, type RoomReadStatus, type ReadStatusFailure } from '../src/read-status-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { MessagingStore } from '../src/messaging-store.js';
import { demoMessageAPI, recentRooms, WebexMessagingAPI, type MessagePage, type MessageRoom } from '../src/messaging-api.js';
import { OAuthSession } from '../src/oauth.js';

const raw = { id: 'room-1', title: 'Synthetic', type: 'group', lastActivityDate: '2026-11-09T12:00:00Z', lastSeenActivityDate: '2026-11-09T11:00:00Z' };
const credentials = (token = 'synthetic') => ({ token, expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' });
test('registered device identity marks public same-account creations even when the optional me plugin is absent',()=>{
  const uuid='11111111-1111-4111-8111-111111111111',id=Buffer.from('ciscospark://us/PEOPLE/'+uuid).toString('base64');
  assert.equal(readStatusSelfId(uuid),id);
  assert.equal(readStatusSelfId('invalid','fallback'),'fallback');
  const event={data:{id:'message',roomId:'room',created:new Date().toISOString(),personId:id}};
  assert.equal(parseMessageCreated(event,readStatusSelfId(uuid))!.self,true);
  assert.equal(parseRoomReadStatus({...raw,notifications:false})!.notifications,false);
  assert.equal(validRoomReadStatus({...parseRoomReadStatus(raw),notifications:'no'}),false);
});
test('SDK backoff accepts seconds and dates without shortening large or missing Retry-After', () => {
  const now = Date.now();
  for (const headers of [{ 'retry-after': '180' }, { 'retry-after': 180 }, new Headers({ 'Retry-After': '180' })])
    assert.equal(readStatusRetryAt({ statusCode: 429, headers }, now), now + 180000);
  const date = new Date(now + 3600000).toUTCString();
  assert.equal(readStatusRetryAt({ response: { status: '429', headers: { 'Retry-After': date } } }, now), Date.parse(date));
  for (const header of [undefined, '-1', 'junk', '0'])
    assert.equal(readStatusRetryAt({ status: 429, headers: { 'retry-after': header } }, now), now + 60000);
  assert.equal(readStatusRetryAt({ status: 429, headers: { 'retry-after': '9'.repeat(400) } }, now), Number.MAX_SAFE_INTEGER);
  assert.equal(readStatusRetryAt({ status: 403 }, now), undefined);
});
const workerFile = fileURLToPath(new URL('read-status-worker-fixture.mjs', import.meta.url));
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function startupFixture(t: TestContext, enabled = true) {
  const directory = await mkdtemp('/tmp/opencode/wbx-first-status-'), path = join(directory, 'config.json');
  await writeFile(path, JSON.stringify({ oauth: { clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] } }), { mode: 0o600 });
  const metadata = deferred<void>(), rest = deferred<MessagePage<MessageRoom>>(), requested = deferred<void>();
  let sdkStarts = 0;
  const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {},
    start: () => { sdkStarts++; return metadata.promise; }, markRead: async () => {}, close: () => metadata.reject(new Error('Canceled synthetic startup.')) };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => credentials());
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', () => { requested.resolve(); return rest.promise; });
  const engine = new EditorEngine(async () => { throw new Error('No browser permitted in this fixture.'); }, () => source);
  const snapshots: ReturnType<EditorEngine['snapshot']>[] = [];
  engine.on('state', snapshot => snapshots.push(structuredClone(snapshot)));
  const starting = engine.start('live', path, enabled);
  await requested.promise;
  return { engine, source, metadata, rest, snapshots, starting, sdkStarts: () => sdkStarts,
    finishREST: () => rest.resolve({ items: [{ id: raw.id, title: raw.title, type: 'group', lastActivity: '2026-11-09T12:00:00.000Z' }] }),
    async close() { rest.resolve({ items: [] }); engine.stop(); await starting; await rm(directory, { recursive: true, force: true }); } };
}

test('first visible live spaces already include unread status when REST finishes before the SDK', async t => {
  const f = await startupFixture(t);
  try {
    f.finishREST();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.engine.snapshot().rooms.length, 0, 'REST-only rows are not briefly shown as read');
    assert.equal(f.engine.snapshot().loadingRooms, true);
    assert.equal(f.engine.snapshot().readStatus, 'connecting');
    f.source.onRooms([parseRoomReadStatus(raw)!]);
    assert.equal(f.engine.snapshot().rooms.length, 0, 'snapshot delivery alone does not publish an incomplete first list');
    f.metadata.resolve(); await f.starting;
    const first = f.snapshots.find(snapshot => snapshot.rooms.length)!;
    assert.equal(first.readStatus, 'ready'); assert.equal(first.loadingRooms, false);
    const room = first.rooms[0]!; assert.ok('unread' in room && room.unread);
  } finally { await f.close(); }
});
test('live mute preferences fail closed and mute-only observations update notification eligibility',async t=>{
  const f=await startupFixture(t);
  try {
    f.source.onRooms([parseRoomReadStatus({...raw,notifications:false})!]);
    f.metadata.resolve();f.finishREST();await f.starting;
    assert.equal(f.engine.snapshot().rooms[0]!.notifications,false);
    f.source.onRooms([parseRoomReadStatus({...raw,notifications:true})!]);
    assert.equal(f.engine.snapshot().rooms[0]!.notifications,true,'no activity/date change is needed to observe an unmute');
    f.source.onHealth!('refresh-unavailable');
    assert.equal(f.engine.snapshot().rooms[0]!.notifications,false,'unknown/stale live preferences cannot enable an alert');
  } finally {await f.close();}
});
test('first visible live spaces combine the SDK-first result with the pending REST load', async t => {
  const f = await startupFixture(t);
  try {
    f.source.onRooms([parseRoomReadStatus(raw)!]); f.metadata.resolve();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.engine.snapshot().rooms.length, 0, 'an early SDK snapshot cannot bypass the initial room-loading gate');
    assert.equal(f.engine.snapshot().loadingRooms, true);
    f.finishREST(); await f.starting;
    const first = f.snapshots.find(snapshot => snapshot.rooms.length)!;
    const room = first.rooms[0]!; assert.ok('unread' in room && room.unread);
    assert.equal(first.readStatus, 'ready');
  } finally { await f.close(); }
});
test('initial SDK failure releases the first spaces list with explicit unknown status, not an endless spinner', async t => {
  const f = await startupFixture(t);
  try {
    f.finishREST(); f.metadata.reject(new Error('private SDK error canary')); await f.starting;
    const first = f.snapshots.find(snapshot => snapshot.rooms.length)!;
    assert.equal(first.state, 'ready'); assert.equal(first.readStatus, 'failed'); assert.equal(first.loadingRooms, false);
    assert.ok(first.rooms.every(room => !('unread' in room)));
    assert.ok(!JSON.stringify(f.snapshots).includes('private SDK error canary'));
  } finally { await f.close(); }
});
test('REST-only startup does not wait for or instantiate the optional unread source', async t => {
  const f = await startupFixture(t, false);
  try {
    f.finishREST(); await f.starting;
    assert.equal(f.sdkStarts(), 0); assert.equal(f.engine.snapshot().readStatus, 'off');
    assert.equal(f.engine.snapshot().rooms.length, 1); assert.equal(f.engine.snapshot().loadingRooms, false);
  } finally { await f.close(); }
});
test('disconnect during initial unread loading cancels the gate and ignores late SDK callbacks', async t => {
  const f = await startupFixture(t);
  try {
    f.finishREST(); await new Promise<void>(resolve => setImmediate(resolve));
    f.engine.stop(); await f.starting;
    const stopped = f.engine.snapshot();
    assert.equal(stopped.state, 'idle'); assert.equal(stopped.loadingRooms, false); assert.equal(stopped.rooms.length, 0);
    f.source.onRooms([parseRoomReadStatus(raw)!]); f.source.onFailure();
    assert.equal(f.engine.snapshot().revision, stopped.revision);
  } finally { await f.close(); }
});
test('optional SDK lock pins the compatible form-data security patch without adding SDK dependencies to the baseline', async () => {
  const lock = JSON.parse(await readFile('optional/read-status-sdk/package-lock.json', 'utf8'));
  const root = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(lock.packages['node_modules/form-data'].version, '2.5.6');
  assert.ok(Object.keys(root.dependencies).every(name => !name.startsWith('@webex/')));
});
test('read-status admission uses actual SDK lastSeenActivityDate and never guesses missing read receipts', () => {
  const parsed = parseRoomReadStatus(raw)!; assert.ok(validRoomReadStatus(parsed)); assert.ok(parsed.lastActivity > parsed.lastSeen);
  assert.equal(parseRoomReadStatus({ ...raw, lastSeenActivityDate: undefined, lastSeenDate: raw.lastSeenActivityDate }), undefined);
  for (const patch of [{ lastSeenActivityDate: [] }, { lastActivityDate: 'bad' }, { id: '../secret' }, { type: {} }]) assert.equal(parseRoomReadStatus({ ...raw, ...patch }), undefined);
  assert.equal(validRoomReadStatus({ ...parsed, token: 'never-publish' }), false);
  assert.equal(validRoomReadStatus({ ...parsed, lastSeen: false }), false);
  assert.ok(validReadStatusRequest({ type: 'start', credentials: credentials() }));
  assert.ok(validReadStatusRequest({ type: 'read', id: 1, roomId: 'room-1', messageId: 'message-1' }));
  assert.equal(validReadStatusRequest({ type: 'read', id: 1, roomId: ['room-1'], messageId: 'message-1' }), false);
  assert.equal(validReadStatusRequest({ type: 'stop', token: 'never' }), false);
});
test('activity ordering is stable for ties/unknown dates and updates from history and send ACKs', async () => {
  const api = demoMessageAPI(), store = new MessagingStore(api, 0);
  try {
    const list = [
      { id: 'old', title: 'Old', type: 'group' as const, lastActivity: '2025-01-01' },
      { id: 'new', title: 'New', type: 'group' as const, lastActivity: '2026-01-01' },
      { id: 'tie', title: 'Tie', type: 'group' as const, lastActivity: '2026-01-01' },
      { id: 'unknown', title: 'Unknown', type: 'group' as const, lastActivity: '' },
    ];
    assert.deepEqual(recentRooms(list).map(room => room.id), ['new', 'tie', 'old', 'unknown']);
    assert.equal(list[0]!.id, 'old', 'sorting does not mutate callers');
    await store.loadRooms(); const oldSnapshot = structuredClone(store.rooms);
    await store.select('demo-engineering'); assert.equal(store.rooms[0]!.id, 'demo-engineering');
    assert.deepEqual(oldSnapshot.map(room => room.lastActivity), ['', '', '']);
    await store.select('demo-general'); await store.send('send-1', 'demo-general', 'local only');
    assert.equal(store.rooms[0]!.id, 'demo-general');
    const selected = store.room!.id;
    store.mergeRooms([{ ...list[1]!, lastActivity: '2099-01-01' }]);
    assert.equal(store.rooms[0]!.id, 'new'); assert.equal(store.room!.id, selected, 'reordering never selects another destination');
  } finally { store.close(); }
});
test('public message event projection forwards only normalized notification evidence, never envelope time, bodies or identities', () => {
  const data = { id: 'm', roomId: 'r', created: raw.lastActivityDate, personId: 'self', text: 'PRIVATE', files: ['PRIVATE'], token: 'PRIVATE' };
  const value = parseMessageCreated({ data, created: '1999-01-01T00:00:00Z', actorId: 'self' }, 'self')!;
  assert.deepEqual(value, { id: 'm', roomId: 'r', created: '2026-11-09T12:00:00.000Z', self: true });
  assert.ok(validMessageCreated(value)); assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  assert.equal(parseMessageCreated({ data: { ...data, created: undefined }, created: raw.lastActivityDate }), undefined);
  assert.equal(parseMessageCreated({ data: { ...data, id: '../invalid' } }), undefined);
  assert.equal(validMessageCreated({ ...value, text: 'PRIVATE' }), false);
  assert.equal(validMessageCreated({ ...value, self: 1 }), false);
  const text = ' First words\n\x1b\u202e plain ' + '🙂'.repeat(200) + 'PRIVATE_TAIL';
  assert.equal('preview' in parseMessageCreated({ data: { ...data, text } })!, false);
  const opted = parseMessageCreated({ data: { ...data, text } }, 'self', true)!;
  assert.ok(opted.preview!.startsWith('First words plain ')); assert.equal(Array.from(opted.preview!).length, 160);
  assert.ok(validMessageCreated(opted)); assert.ok(!opted.preview!.includes('PRIVATE_TAIL'));
  assert.equal(validMessageCreated({ ...value, preview: 'x'.repeat(161) }), false);
  assert.equal(validMessageCreated({ ...value, preview: 'bad\npreview' }), false);
  assert.equal(notificationExcerpt('x'.repeat(159) + ' more'), 'x'.repeat(159), 'truncation cannot leave noncanonical trailing whitespace');
  assert.ok(validReadStatusRequest({ type: 'start', credentials: credentials(), preview: true }));
  assert.equal(validReadStatusRequest({ type: 'start', credentials: credentials(), preview: 'true' }), false);
});
for (const preview of [false, true]) test(`private IPC refuses unconsented message excerpts (consent=${preview})`, async () => {
  const source = new ReadStatusWorker(workerFile, 2000);
  const values: any[] = [], failures: unknown[] = [];
  const received = new Promise<void>(resolve => {
    source.onMessages = items => { values.push(...items); resolve(); };
    source.onFailure = reason => { failures.push(reason); resolve(); };
  });
  try {
    await source.start(credentials('message-preview'), preview); await received;
    assert.deepEqual(failures, preview ? [] : ['invalid-data']);
    assert.equal(values[0]?.preview, preview ? 'First words' : undefined);
  } finally {
    const child = (source as unknown as { child: ChildProcess }).child;
    const ended = child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
    source.close(); await ended;
  }
});
test('private SDK worker publishes bounded metadata only, sends explicit read receipts and stops on close', async () => {
  const source = new ReadStatusWorker(workerFile, 2000), snapshots: RoomReadStatus[][] = [];
  source.onRooms = rooms => snapshots.push(rooms);
  try {
    await source.start(credentials()); assert.equal(snapshots.length, 1);
    assert.ok(snapshots[0]![0]!.lastActivity > snapshots[0]![0]!.lastSeen);
    await source.markRead('room-1', 'message-1');
    assert.equal(snapshots.at(-1)![0]!.lastActivity, snapshots.at(-1)![0]!.lastSeen);
    assert.ok(!JSON.stringify(snapshots).includes('SDK-PRIVATE'));
  } finally {
    const child = (source as unknown as { child: ChildProcess }).child;
    const ended = once(child, 'exit'); source.close(); await ended;
    await assert.rejects(source.markRead('room-1', 'message-1'));
  }
});
for (const mode of ['malformed', 'hang', 'crash']) test(`SDK worker ${mode} becomes unavailable instead of read and releases resources`, async () => {
  const source = new ReadStatusWorker(workerFile, 150), snapshots: RoomReadStatus[][] = []; let failures = 0;
  source.onFailure = () => failures++; source.onRooms = rooms => snapshots.push(rooms);
  const pending = source.start(credentials(mode));
  const child = (source as unknown as { child: ChildProcess }).child;
  const ended = once(child, 'exit');
  await assert.rejects(pending); await ended; source.close();
  assert.equal(failures, 1); assert.deepEqual(snapshots, []);
});
for (const mode of ['message-valid', 'message-extra', 'message-duplicate', 'message-oversized']) test(`private message event IPC ${mode} is validated before callbacks`, async () => {
  const source = new ReadStatusWorker(workerFile, 2000);
  const values: unknown[] = [], failures: unknown[] = [];
  const received = new Promise<void>(resolve => {
    source.onMessages = messages => { values.push(...messages); resolve(); };
    source.onFailure = reason => { failures.push(reason); resolve(); };
  });
  try {
    await source.start(credentials(mode)); await received;
    assert.equal(values.length, mode === 'message-valid' ? 1 : 0);
    assert.deepEqual(failures, mode === 'message-valid' ? [] : ['invalid-data']);
    assert.ok(!JSON.stringify(values).includes('PRIVATE'));
  } finally {
    const child = (source as unknown as { child: ChildProcess }).child;
    const ended = child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
    source.close(); await ended;
  }
});
test('message evidence is bounded, fresh, session-owned and cannot authorize receipts or rewrite unread state', async () => {
  const sources: ReadStatusSource[] = [];
  const engine = new EditorEngine(undefined, () => {
    const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {}, start: async () => {}, markRead: async () => { throw new Error('No receipts allowed.'); }, close() {} };
    sources.push(source); return source;
  });
  try {
    await engine.start('demo', undefined, true);
    const internal = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): Promise<void> };
    await internal.startReadStatus(credentials(), internal.generation);
    const source = sources[0]!;
    source.onHealth!('live'); await engine.select('demo-general');
    const raw = engine.snapshot().rooms;
    const event = { id: 'm', roomId: 'demo-general', created: new Date().toISOString(), self: false };
    source.onMessages!([event]); source.onMessages!([event]);
    assert.equal(engine.snapshot().messageEvents.received, 1);
    assert.deepEqual(engine.snapshot().rooms, raw, 'message evidence never creates unread/read observations');
    await assert.rejects(engine.markRead('demo-general', engine.snapshot().messages.at(-1)!.id), /unavailable or stale/);
    const revision = engine.snapshot().revision;
    source.onMessages!([{ ...event, id: 'old', created: '2000-01-01T00:00:00.000Z' }]);
    source.onMessages!([{ ...event, id: 'future', created: new Date(Date.now() + 60_000).toISOString() }]);
    source.onMessages!([{ ...event, id: 'leak', text: 'PRIVATE' } as typeof event]);
    source.onMessages!([{ ...event, id: 'unconsented-preview', preview: 'First words' }]);
    assert.equal(engine.snapshot().revision, revision);
    for (let i = 0; i < 1100; i++) source.onMessages!([{ ...event, id: 'bounded-' + i }]);
    assert.equal(engine.snapshot().messageEvents.items.length, 64);
    assert.equal((engine as unknown as { reads: { diagnostics(): { seenEvents: number } } }).reads.diagnostics().seenEvents, 1000);
    source.onFailure('sdk-error'); assert.equal(engine.snapshot().messageEvents.state, 'failed');
    assert.deepEqual(engine.snapshot().messageEvents.items, []);
    const failedRevision = engine.snapshot().revision;
    source.onMessages!([{ ...event, id: 'late' }]); assert.equal(engine.snapshot().revision, failedRevision);
    await internal.startReadStatus(credentials(), internal.generation);
    assert.equal(engine.snapshot().messageEvents.received, 0);
    source.onMessages!([{ ...event, id: 'replaced' }]); assert.equal(engine.snapshot().messageEvents.received, 0);
  } finally { engine.stop(); }
});
test('excerpt consent is explicit at engine/source startup and is not read or receipt evidence', async () => {
  const consents: unknown[] = [];
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async (_, preview) => { consents.push(preview); },
    markRead: async () => { throw new Error('No receipts allowed.'); }, close() {} };
  const engine = new EditorEngine(undefined, () => source);
  try {
    await engine.start('demo', undefined, true, false, false, false, true);
    const internal = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): Promise<void> };
    await internal.startReadStatus(credentials(), internal.generation); source.onHealth!('live');
    await engine.select('demo-general');
    const rooms = engine.snapshot().rooms;
    source.onMessages!([{ id: 'excerpt', roomId: 'demo-general', created: new Date().toISOString(), self: false, preview: 'First words' }]);
    assert.deepEqual(consents, [true]); assert.equal(engine.snapshot().messageEvents.preview, true);
    assert.equal(engine.snapshot().messageEvents.items[0]!.preview, 'First words');
    assert.deepEqual(engine.snapshot().rooms, rooms);
    await assert.rejects(engine.markRead('demo-general', engine.snapshot().messages.at(-1)!.id), /unavailable or stale/);
    await assert.rejects(engine.start('demo', undefined, true), /Disconnect before changing/, 'session preview consent is not silently changed/reconnected');
    engine.stop(); assert.equal(engine.snapshot().messageEvents.preview, undefined); assert.deepEqual(engine.snapshot().messageEvents.items, []);
  } finally { engine.stop(); }
});
test('same-account events wait for pending plugin delivery identity, then retain native-client posts after a space switch', async t => {
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {}, markRead: async () => { throw new Error('No receipts allowed.'); }, close() {} };
  const engine = new EditorEngine(undefined, () => source);
  const result = deferred<{ id: string; author: string; created: string; text: string }>();
  const deliveries: any[] = [], published: ReturnType<EditorEngine['snapshot']>[] = [];
  try {
    await engine.start('demo', undefined, true);
    const internal = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): Promise<void>;
      store: { api: { send(): Promise<unknown> } } };
    await internal.startReadStatus(credentials(), internal.generation); source.onHealth!('live');
    await engine.select('demo-general');
    const send = t.mock.method(internal.store.api, 'send', () => result.promise);
    engine.on('delivery', delivery => deliveries.push(delivery));
    engine.on('state', state => {
      if (state.messageEvents.items.some((item: any) => item.self)) assert.equal(deliveries[0]?.messageId, 'plugin-echo', 'echo cannot reach native detection before its exact delivery identity');
      published.push(structuredClone(state));
    });
    const posting = engine.send('plugin-event-race', 'demo-general', 'Synthetic local post');
    assert.equal(engine.snapshot().sending, true);
    await engine.select('demo-engineering');
    const event = { roomId: 'demo-general', created: new Date().toISOString(), self: true };
    source.onMessages!([{ ...event, id: 'plugin-echo' }, { ...event, id: 'native-client-post' }, { ...event, id: 'other-person', self: false }]);
    assert.deepEqual(engine.snapshot().messageEvents.items.map(item => item.id), ['other-person'], 'other-account incoming evidence is not delayed');
    assert.equal(engine.snapshot().messageEvents.received, 3, 'same-account evidence is retained, not consumed or discarded');
    result.resolve({ id: 'plugin-echo', created: event.created, author: 'Synthetic', text: 'Synthetic local post' });
    await posting;
    assert.deepEqual(engine.snapshot().messageEvents.items.map(item => item.id), ['plugin-echo', 'native-client-post', 'other-person']);
    assert.equal(deliveries.length, 1); assert.equal(deliveries[0].messageId, 'plugin-echo');
    assert.equal(engine.snapshot().room!.id, 'demo-engineering'); assert.equal(send.mock.callCount(), 1);
    assert.ok(published.some(state => !state.sending && state.messageEvents.items.some(item => item.id === 'native-client-post')));
  } finally { engine.stop(); }
});
test('pending receipt admission cannot overlap, and timeout closes the native SDK worker', async () => {
  const source = new ReadStatusWorker(workerFile, 150);
  await source.start(credentials('read-hang'));
  const child = (source as unknown as { child: ChildProcess }).child, ended = once(child, 'exit');
  const pending = source.markRead('room-1', 'message-1');
  await assert.rejects(source.markRead('room-1', 'message-2'), /pending/);
  await assert.rejects(pending); await ended;
});
test('worker health and fatal reasons reject arbitrary provider text at the private IPC boundary', async () => {
  for (const mode of ['health-malformed', 'reason-leak']) {
    const source = new ReadStatusWorker(workerFile, 2000), reasons: (ReadStatusFailure | undefined)[] = [];
    source.onFailure = reason => reasons.push(reason);
    const pending = source.start(credentials(mode));
    const child = (source as unknown as { child: ChildProcess }).child, ended = once(child, 'exit');
    await assert.rejects(pending); await ended;
    assert.deepEqual(reasons, ['invalid-data']);
  }
});
test('startup diagnostics report only allowlisted phases and problem classes, never SDK details', () => {
  for (const [error, expected] of [
    [new Error('PRIVATE token URL body'), 'initial-snapshot:failed'],
    [new ReadStatusDeadline('PRIVATE deadline'), 'initial-snapshot:deadline'],
    [{ statusCode: 403, message: 'PRIVATE denied' }, 'initial-snapshot:denied'],
    [{ response: { status: 429, body: 'PRIVATE' } }, 'initial-snapshot:rate-limited'],
    [{ statusCode: 503, body: 'PRIVATE' }, 'initial-snapshot:service'],
    [{ code: 'ECONNRESET', message: 'PRIVATE hostname' }, 'initial-snapshot:network'],
    [{ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'PRIVATE CA' }, 'initial-snapshot:tls'],
    [{ code: 'MODULE_NOT_FOUND', message: 'PRIVATE path' }, 'initial-snapshot:dependency'],
    [{ code: 'PRIVATE_CODE', statusCode: 'PRIVATE_STATUS' }, 'initial-snapshot:failed'],
  ] as const) {
    const reason = readStatusStartupFailure('initial-snapshot', error);
    assert.equal(reason, expected); assert.ok(validReadStatusFailure(reason)); assert.ok(!reason.includes('PRIVATE'));
  }
  for (const reason of ['sdk-load:PRIVATE', 'PRIVATE:failed', 'sdk-ready:deadline:PRIVATE', {}, 'startup:failed']) assert.equal(validReadStatusFailure(reason), false);
});
test('engine reports degraded background sync, isolates missing rooms and accepts fresh recovery without reconnecting', async () => {
  let receipts = 0, closes = 0;
  const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {}, start: async () => {}, markRead: async () => { receipts++; }, close: () => { closes++; } };
  const engine = new EditorEngine(undefined, () => source);
  try {
    // Demo stays SDK-inert; explicitly opt in before injecting the test source.
    await engine.start('demo', undefined, true);
    const internal = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): Promise<void> };
    await internal.startReadStatus(credentials(), internal.generation);
    const status = parseRoomReadStatus(raw)!;
    source.onRooms([status]); source.onHealth!('room-unavailable');
    const unread = engine.snapshot().rooms.find(room => room.id === raw.id)!;
    assert.equal(engine.snapshot().readStatus, 'ready'); assert.ok('unread' in unread && unread.unread);
    assert.match(engine.snapshot().readStatusNotice, /some spaces/);
    source.onRooms([]); source.onHealth!('refresh-unavailable');
    assert.equal(engine.snapshot().readStatus, 'failed'); assert.equal(engine.snapshot().state, 'ready');
    const cached = engine.snapshot().rooms.find(room => room.id === raw.id)!;
    assert.equal(cached.unread, true); assert.equal(cached.unreadStale, true, 'refresh failure retains the last-confirmed flag, explicitly stale');
    assert.ok(engine.snapshot().rooms.filter(room => room.id !== raw.id).every(room => !('unread' in room)), 'never-observed rooms remain unknown');
    assert.match(engine.snapshot().readStatusNotice, /Background status refresh/);
    source.onRooms([{ ...status, lastSeen: status.lastActivity }]); source.onHealth!('polling');
    const read = engine.snapshot().rooms.find(room => room.id === raw.id)!;
    assert.equal(engine.snapshot().readStatus, 'ready'); assert.ok('unread' in read && !read.unread);
    assert.match(engine.snapshot().readStatusNotice, /periodic server refresh/);
    source.onHealth!('live'); assert.equal(engine.snapshot().readStatusNotice, '');
    assert.equal(receipts, 0); assert.equal(closes, 0);
    source.onFailure('sdk-error'); assert.match(engine.snapshot().readStatusNotice, /sdk-error/);
    const revision = engine.snapshot().revision;
    source.onHealth!('live'); assert.equal(engine.snapshot().revision, revision, 'old health cannot resurrect a failed source');
  } finally { engine.stop(); }
});
test('engine uses server unread dates, rejects stale receipts and discards old SDK callbacks', async () => {
  const calls: string[] = [];
  const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {}, start: async () => {},
    markRead: async (room, message) => { calls.push(`${room}/${message}`); }, close: () => { calls.push('closed'); } };
  const engine = new EditorEngine(undefined, () => source);
  // Demo stays SDK-inert; explicitly opt in before injecting the test source.
  await engine.start('demo', undefined, true);
  const internals = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): Promise<void> };
  await internals.startReadStatus(credentials(), internals.generation);
  source.onRooms([parseRoomReadStatus(raw)!]);
  assert.equal(engine.snapshot().rooms[0]!.id, 'room-1');
  const firstRoom = engine.snapshot().rooms[0]!;
  assert.equal('unread' in firstRoom && firstRoom.unread, true);
  assert.ok(!JSON.stringify(engine.snapshot()).includes('synthetic"'), 'credentials never enter editor snapshots');
  await assert.rejects(engine.markRead('room-1', 'not-loaded'));
  await engine.select('demo-general');
  const id = engine.snapshot().messages.at(-1)!.id;
    await assert.rejects(engine.markRead('room-1', id));
    await assert.rejects(engine.markRead('demo-general', id), /unavailable or stale/, 'unknown room status cannot admit a receipt');
    const selected = engine.snapshot().room!, lastActivity = engine.snapshot().messages.at(-1)!.created;
    source.onRooms([parseRoomReadStatus(raw)!, { ...selected, lastActivity, lastSeen: lastActivity }]);
    await engine.markRead('demo-general', id);
  assert.deepEqual(calls, [`demo-general/${id}`]);
  source.onFailure(); assert.equal(engine.snapshot().readStatus, 'failed');
    const cached = engine.snapshot().rooms.find(room => room.id === 'demo-general')!;
    assert.equal(cached.unread, false); assert.equal(cached.unreadStale, true, 'failure retains historical read state, not fresh read certainty');
    await assert.rejects(engine.markRead('demo-general', id), /unavailable/);
  engine.stop(); const revision = engine.snapshot().revision;
  source.onRooms([parseRoomReadStatus(raw)!]); source.onFailure();
  assert.equal(engine.snapshot().revision, revision); assert.equal(engine.snapshot().rooms.length, 0);
});
test('missing SDK scopes leave REST messaging usable; replacing the SDK session ignores stale callbacks', async () => {
  const sources: ReadStatusSource[] = [];
  const engine = new EditorEngine(undefined, () => {
    const source: ReadStatusSource = { onRooms: () => {}, onFailure: () => {}, start: async () => {}, markRead: async () => {}, close: () => {} };
    sources.push(source); return source;
  });
  try {
    await engine.start('demo', undefined, true);
    assert.equal(sources.length, 0, 'demo never instantiates an SDK session');
    const internal = engine as unknown as { generation: number; startReadStatus(access: ReturnType<typeof credentials>, generation: number): void };
    internal.startReadStatus({ ...credentials(), scope: 'spark:rooms_read spark:messages_read' }, internal.generation);
    assert.equal(sources.length, 0); assert.equal(engine.snapshot().readStatus, 'failed');
    assert.match(engine.snapshot().readStatusNotice, /spark:all/);
    await engine.select('demo-general'); assert.equal(engine.snapshot().ready, true);
    internal.startReadStatus(credentials('first-synthetic-token'), internal.generation); await Promise.resolve();
    internal.startReadStatus(credentials('rotated-synthetic-token'), internal.generation); await Promise.resolve();
    assert.equal(sources.length, 2); assert.equal(engine.snapshot().readStatus, 'ready');
    const revision = engine.snapshot().revision;
    sources[0]!.onFailure(); sources[0]!.onRooms([parseRoomReadStatus(raw)!]); sources[0]!.onHealth!('refresh-unavailable');
    assert.equal(engine.snapshot().readStatus, 'ready'); assert.equal(engine.snapshot().revision, revision);
    assert.ok(!JSON.stringify(engine.snapshot()).includes('synthetic-token'));
  } finally { engine.stop(); }
});
