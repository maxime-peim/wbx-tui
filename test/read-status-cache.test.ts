import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { RoomReadStatus } from '../src/read-status-protocol.js';
import type { AccessCredentials } from '../src/auth-protocol.js';
import { emptyPeopleStatus, type WebexSelectedPeopleProvider } from '../src/people-selected.js';
import type { PeopleProviderOptions } from '../src/people-status.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import type { RetainedUnread } from '../src/retained-unread.js';

const at = '2026-11-09T12:00:00.000Z', before = '2026-11-09T11:00:00.000Z';
const confirmed = (id: string, unread: boolean, lastActivity = at): RoomReadStatus => ({ id, title: id, type: 'direct', lastActivity,
  lastSeen: unread ? before : lastActivity });
const initial = [confirmed('known-unread', true), confirmed('known-read', false)];
const profile = { clientId: 'synthetic', clientSecret: 'synthetic-secret', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
const credentials = (scope = 'spark:all spark:kms'): AccessCredentials => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
interface FakeSource extends ReadStatusSource { closes: number; onClose?: () => void; access?: AccessCredentials }

/** All authorization, REST, SDK and people work is local; any real fetch fails. */
async function fixture(t: TestContext, people = false, start = true) {
  const directory = await mkdtemp('/tmp/opencode/wbx-unread-cache-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  const sources: FakeSource[] = [], receipts: string[] = [], peopleOptions: PeopleProviderOptions[] = [], stores: MessagingStore[] = [];
  const sourceRequested = deferred();
  let nextRooms: RoomReadStatus[] | undefined = initial, nextGate: Promise<void> | undefined;
  let access = credentials(), authorizations = 0, refreshes = 0, network = 0, sends = 0, peopleLookups = 0, peopleCloses = 0;
  let rest: MessageRoom[] = [...initial, { id: 'unknown', title: 'Never observed', type: 'direct', lastActivity: at }];
  const messageTimes = new Map<string, string>();
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Network forbidden.'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => { authorizations++; return access; });
  t.mock.method(OAuthSession.prototype, 'refresh', async () => { refreshes++; return access; });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: rest }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async (room: string) => ({ items: [{ id: `message-${room}`, author: 'Synthetic', text: 'Local fixture', created: messageTimes.get(room) ?? at }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { sends++; throw new Error('No sends permitted.'); });
  const engine = new EditorEngine(async () => assert.fail('No browser permitted.'), () => {
    const rows = nextRooms, gate = nextGate; nextRooms = undefined; nextGate = undefined;
    const source: FakeSource = { onRooms() {}, onFailure() {}, closes: 0,
      async start(value) { source.access = value; if (rows !== undefined) source.onRooms(rows); await gate; },
      async markRead(room, message) { receipts.push(`${room}/${message}`); }, close() { source.closes++; source.onClose?.(); } };
    sources.push(source); sourceRequested.resolve(); return source;
  }, options => {
    assert.equal(people, true, 'unread sync must not instantiate optional people status');
    peopleOptions.push(options);
    return { selectRoom() {}, retainRooms() {}, snapshot: () => emptyPeopleStatus(true, 'not-loaded'),
      lookup: async () => { peopleLookups++; return emptyPeopleStatus(true, 'not-loaded'); }, close: () => { peopleCloses++; } } as unknown as WebexSelectedPeopleProvider;
  }, undefined, undefined, undefined, { messaging: (api, pollMs, mode) => {
    const store = new MessagingStore(api, pollMs, mode); stores.push(store); return store;
  } });
  t.after(async () => { engine.stop(); await rm(directory, { recursive: true, force: true }); });
  if (start) await engine.start('live', config, true, people);
  const internal = engine as unknown as { generation: number; unread: RetainedUnread; failed(message: string): void;
    startReadStatus(value: AccessCredentials, generation: number): Promise<void> };
  return { engine, internal, config, directory, sources, receipts, messageTimes, peopleOptions, requested: sourceRequested.promise, store: () => stores.at(-1)!,
    source: () => sources.at(-1)!, row: (id: string) => engine.snapshot().rooms.find(room => room.id === id)!,
    nextSource(rows?: RoomReadStatus[], gate?: Promise<void>) { nextRooms = rows; nextGate = gate; },
    replace: () => internal.startReadStatus(access, internal.generation), setAccess(value: AccessCredentials) { access = value; },
    setRooms(rooms: MessageRoom[]) { rest = rooms; }, counts: () => ({ authorizations, refreshes, network, sends, peopleLookups, peopleCloses }) };
}

test('ordinary RPC startup waits for initial source evidence, then history works through source failure and recovery', async t => {
  const f = await fixture(t, false, false), gate = deferred();
  f.nextSource(initial, gate.promise);
  const packets: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => packets.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id;
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(value => value.id === request);
    assert.ok(reply && !reply.error, method + ': ordinary RPC response succeeds');
    return reply.result;
  };
  await send('hello', { version: 1 });
  const starting = send('session.start', { mode: 'live', config: f.config, readStatus: true });
  await f.requested;
  assert.equal(f.sources.length, 1);
  assert.equal(f.engine.snapshot().readStatus, 'connecting');
  assert.equal(f.engine.snapshot().rooms.length, 0, 'initial metadata/health gate cannot flash REST-only read flags');
  assert.equal(packets.some(value => value.id === 2), false);
  gate.resolve(); await starting;
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('known-read').unreadStale, false);
  await send('rooms.select', { roomId: 'known-read' });
  f.source().onHealth!('refresh-unavailable');
  await send('rooms.select', { roomId: 'known-unread' });
  let state = await send('state.get');
  assert.equal(state.ready, true); assert.equal(state.messages[0].id, 'message-known-unread');
  assert.equal(f.row('known-read').unreadStale, true); assert.equal(f.row('unknown').unread, undefined);
  f.source().onHealth!('live');
  assert.equal(f.row('known-read').unreadStale, true, 'health alone cannot freshen retained observations');
  f.source().onRooms([confirmed('known-read', true)]);
  await send('rooms.select', { roomId: 'known-read' }); state = await send('state.get');
  assert.equal(state.ready, true); assert.equal(state.room.id, 'known-read');
  assert.equal(state.room.unread, true); assert.equal(state.room.unreadStale, false);
  assert.deepEqual(f.receipts, []); assert.equal(f.counts().sends, 0); assert.equal(f.counts().network, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC read-source startup and recovery', sourceStarts: f.sources.length,
    firstVisibleUnread: true, readyHistoryDuringFailure: true, healthAloneFreshens: false, implicitReceipts: f.receipts.length }));
});

test('ordinary RPC renewal and session replacement fence old source events without conflating unread retention', async t => {
  const f = await fixture(t), packets: any[] = [];
  const rpc = new EditorRPC(f.engine, new EditorMeetings(), value => packets.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(value => value.id === request);
    assert.ok(reply && !reply.error, method); return reply.result;
  };
  await send('hello', { version: 1 });
  await send('rooms.select', { roomId: 'known-read' });
  const old = f.source(), gate = deferred();
  old.onFailure('worker-exit');
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  f.nextSource([], gate.promise);
  await send('auth.refresh');
  assert.equal(f.engine.snapshot().readStatus, 'connecting');
  const revision = f.engine.snapshot().revision;
  old.onRooms([confirmed('foreign-old-source', true)]); old.onHealth!('live');
  old.onMessages!([{ roomId: 'known-read', id: 'old-event', self: false, created: new Date().toISOString() }]);
  old.onChanges!([{ kind: 'room-revoked', roomId: 'known-read' }]);
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.engine.snapshot().ready, true);
  gate.resolve(); await tick();
  assert.equal(f.engine.snapshot().readStatus, 'ready');
  assert.equal(f.row('known-read').unreadStale, true, 'empty replacement startup cannot refresh old flags');
  f.source().onRooms([confirmed('known-read', true)]);
  assert.equal(f.row('known-read').unreadStale, false);
  const renewed = f.source(), oldSession = f.engine.snapshot().localContext!.sessionId;
  await send('session.stop');
  f.nextSource([confirmed('known-read', false)]);
  await send('session.start', { mode: 'live', config: f.config, readStatus: true });
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, oldSession);
  const current = await send('state.get');
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-unread').unread, undefined, 'a new session cannot inherit old account observations');
  renewed.onRooms(initial); renewed.onFailure('sdk-error');
  assert.equal(f.engine.snapshot().revision, current.revision);
  assert.deepEqual(f.receipts, []); assert.equal(f.counts().network, 0); assert.equal(f.counts().sends, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC read-source renewal and session replacement',
    sourceStarts: f.sources.length, oldSourcePublications: 0, newSessionDropsOldFlags: true, implicitReceipts: 0 }));
});

test('ordinary RPC navigation retains contradictions through failure/recovery and eviction without blocking current history', async t => {
  const f = await fixture(t), packets: any[] = [];
  const rpc = new EditorRPC(f.engine, new EditorMeetings(), value => packets.push(value));
  t.after(() => rpc.close());
  let id = 0;
  const send = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(value => value.id === request);
    assert.ok(reply && !reply.error, method); return reply.result;
  };
  await send('hello', { version: 1 });
  await send('rooms.select', { roomId: 'known-read' });
  const newer = '2027-01-01T00:00:00.000Z';
  f.messageTimes.set('known-read', newer);
  await send('messages.list');
  assert.equal(f.row('known-read').unreadStale, true);
  await send('rooms.select', { roomId: 'known-unread' });
  f.source().onHealth!('refresh-unavailable');
  await send('rooms.select', { roomId: 'known-read' });
  let state = await send('state.get');
  assert.equal(state.ready, true); assert.equal(state.messages[0].id, 'message-known-read');
  assert.equal(state.room.unread, false); assert.equal(state.room.unreadStale, true);
  f.source().onHealth!('live'); f.source().onRooms(initial);
  assert.equal(f.row('known-read').unreadStale, true, 'old SDK activity cannot hide the known actual message');
  f.source().onRooms([confirmed('known-read', false, newer)]);
  assert.equal(f.row('known-read').unreadStale, false);
  for (let batch = 0; batch < 4; batch++) {
    f.source().onRooms(Array.from({ length: 500 }, (_, i) => confirmed(`rpc-${batch}-${i}`, true)));
    assert.ok(f.internal.unread.size <= 1000);
  }
  f.source().onFailure('worker-exit');
  f.setRooms([confirmed('known-read', false), confirmed('rpc-0-0', false), { id: 'never-seen', title: 'Unknown', type: 'direct', lastActivity: at }]);
  await send('rooms.list');
  state = await send('state.get');
  assert.equal(state.room.unread, false); assert.equal(state.room.unreadStale, true, 'the current selection survived eviction pressure');
  await send('rooms.select', { roomId: 'rpc-0-0' }); state = await send('state.get');
  assert.equal(state.room.unread, undefined, 'evicted history is unknown, not read');
  assert.equal(state.messages[0].id, 'message-rpc-0-0');
  assert.equal(f.row('known-read').unread, undefined, 'new activity may evict the former selection; protection is not permanent pinning');
  assert.equal(f.row('never-seen').unread, undefined);
  f.nextSource([confirmed('known-read', false, newer)]); await send('auth.refresh'); await tick();
  await send('rooms.select', { roomId: 'known-read' }); state = await send('state.get');
  assert.equal(f.row('known-read').unreadStale, false);
  assert.equal(state.room.unread, false); assert.equal(state.messages[0].id, 'message-known-read');
  assert.deepEqual(f.receipts, []); assert.equal(f.counts().sends, 0); assert.equal(f.counts().network, 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC retained-unread navigation recovery and eviction',
    boundedObservations: f.internal.unread.size, evictedIsUnknown: true, selectedSurvives: true,
    contradictionSurvivesNavigation: true, currentHistoryReady: state.ready, implicitReceipts: 0 }));
});

test('refresh dropout retains last-confirmed read/unread flags; empty healthy snapshots cannot freshen them or admit receipts', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, false);
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('unknown').unread, undefined); assert.equal(f.row('unknown').unreadStale, undefined);
  f.source().onRooms([]);
  assert.equal(f.engine.snapshot().readStatus, 'ready', 'room-level freshness is checked even before aggregate health changes');
  assert.equal(f.engine.snapshot().room?.unreadStale, true);
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  f.source().onHealth!('refresh-unavailable');
  assert.equal(f.engine.snapshot().readStatus, 'failed');
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('known-unread').unreadStale, true);
  assert.equal(f.row('unknown').unread, undefined); assert.equal(f.row('unknown').unreadStale, undefined);
  for (const health of ['live', 'polling', 'room-unavailable'] as const) {
    f.source().onHealth!(health); f.source().onRooms([]);
    assert.equal(f.row('known-read').unreadStale, true);
    await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  }
  f.source().onRooms([confirmed('known-read', true)]); f.source().onHealth!('polling');
  assert.equal(f.row('known-read').unread, true); assert.equal(f.row('known-read').unreadStale, false);
  assert.equal(f.row('known-unread').unreadStale, true, 'a fresh room does not freshen an omitted room');
  await f.engine.markRead('known-read', 'message-known-read');
  assert.equal(f.row('known-read').unread, true, 'receipt success never invents an observed server read date');
  assert.deepEqual(f.receipts, ['known-read/message-known-read']); assert.equal(f.counts().sends, 0); assert.equal(f.counts().network, 0);
});
test('reaction presentation distinguishes same-source degradation from terminal loss and never retains write/receipt authority', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  const target = ['known-read','message-known-read'] as const, calls: string[] = [];
  const source = f.source(), owner = f.engine.snapshot().reactionSource;
  assert.deepEqual(owner, { epoch: owner.epoch, revision:0, degraded: false });
  source.reaction = async command => {
    calls.push(command.action);
    return command.action === 'summary'
      ? { roomId:command.roomId,messageId:command.messageId,observedAt:Date.now(),partial:true,unknown:true,groups:[{ reaction:'heart',label:'Heart' }] }
      : { status:'changed' };
  };
  await f.engine.reactionSummary(...target);
  f.engine.inspectReactions(...target);
  const preparation = await f.engine.prepareReaction(...target,'add','heart');
  source.onHealth!('refresh-unavailable');
  assert.deepEqual(f.engine.snapshot().reactionSource,{ epoch:owner.epoch,revision:1,degraded:true,readable:true });
  source.onHealth!('refresh-unavailable');
  assert.equal(f.engine.snapshot().reactionSource.revision,1,'duplicate degraded health is not another recovery refresh');
  const count = calls.length;
  await f.engine.reactionSummary(...target);
  assert.throws(()=>f.engine.inspectReactions(...target),/unavailable/,'degradation cannot mark a target inspected for later recovery');
  await assert.rejects(f.engine.prepareReaction(...target,'add','heart'),/Reaction unavailable \(SDK failed\).*read-status refresh failed.*No new reaction was submitted or queued\./,
    'a refusal captures its actual SDK state and sanitized health notice instead of an ambiguous missing-owner message');
  await assert.rejects(f.engine.submitReaction(preparation.contextId,'a'.repeat(32),...target));
  await assert.rejects(f.engine.markRead(...target),/unavailable/);
  assert.equal(calls.length,count+1,'an independently verified summary is allowed, but no mutation/receipt was admitted');
  source.onRooms(initial); source.onHealth!('live');
  assert.deepEqual(f.engine.snapshot().reactionSource,{ ...owner,revision:1 });
  await f.engine.reactionSummary(...target);
  const fresh = await f.engine.prepareReaction(...target,'add','heart');
  assert.notEqual(fresh.contextId,preparation.contextId,'recovered normal preparation needs no inspection but cannot revive the old context');
  await assert.rejects(f.engine.submitReaction(preparation.contextId,'b'.repeat(32),...target));
  assert.ok(calls.every(action=>action==='summary'));
  source.onHealth!('refresh-unavailable'); source.onFailure('sdk-error');
  assert.equal(f.engine.snapshot().reactionSource.degraded,false);
  assert.ok(f.engine.snapshot().reactionSource.epoch > owner.epoch);
  const terminal = f.engine.snapshot();
  source.onHealth!('live'); source.onRooms(initial);
  assert.equal(f.engine.snapshot().revision,terminal.revision,'late terminal callbacks cannot revive the source');
  f.nextSource(initial); await f.replace();
  assert.ok(f.engine.snapshot().reactionSource.epoch > terminal.reactionSource.epoch);
  assert.equal(f.engine.snapshot().reactionSource.degraded,false);
  assert.deepEqual(f.receipts,[]); assert.equal(f.counts().sends,0); assert.equal(f.counts().network,0);
});

test('single and batch summaries crossing same-source degradation/recovery are fenced even after readiness returns', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  const source=f.source();
  for (const kind of ['single','batch']) {
    const gate=deferred();
    const summary=async (roomId:string,messageId:string)=>{
      await gate.promise;
      return { roomId,messageId,observedAt:Date.now(),partial:true,unknown:true,groups:[] };
    };
    source.reaction=command=>summary(command.roomId,command.messageId);
    source.reactions=async batch=>({ roomId:batch.roomId,items:await Promise.all(batch.messageIds.map(id=>summary(batch.roomId,id))) });
    const result=kind==='single' ? f.engine.reactionSummary('known-read','message-known-read')
      : f.engine.reactionSummaries({ roomId:'known-read',messageIds:['message-known-read'] });
    source.onHealth!('refresh-unavailable'); source.onHealth!('live');
    gate.resolve();
    await assert.rejects(result,/context:unverified/,kind+': readiness recovery does not revive a read invalidated by reset');
  }
  assert.equal(f.counts().network,0); assert.deepEqual(f.receipts,[]);
});
test('progress cannot attach old-content observations to an edited message, while name enrichment remains independent',async t=>{
  const f=await fixture(t);await f.engine.select('known-read');
  const store=f.store(),target=store.messages[0]!,roomId=store.room!.id,gate=deferred(),seen:unknown[]=[];
  let publish!:(value:any)=>void;
  const item={roomId,messageId:target.id,observedAt:Date.now(),partial:true,unknown:false,groups:[]};
  f.source().reactions=async(_batch,progress)=>{
    publish=value=>progress?.(value);await gate.promise;return {roomId,items:[item]};
  };
  const result=f.engine.reactionSummaries({roomId,messageIds:[target.id]},value=>seen.push(value));
  store.messages=store.messages.map(m=>({...m,author:'Enriched name'}));
  publish(item);assert.equal(seen.length,1,'names do not change source-content identity');
  store.reconcileMutation(roomId,target.id,{...target,text:'Edited content'});
  publish(item);assert.equal(seen.length,1,'an old body cannot become a new cache key');
  gate.resolve();await assert.rejects(result,/context:unverified/);
});

test('reaction uncertainty survives source degradation/reset and requires exact-request inspection, never a cached summary', async t => {
  const f=await fixture(t); await f.engine.select('known-read');
  const target=['known-read','message-known-read'] as const, request='a'.repeat(32);
  let writes=0;
  f.source().reaction=async command=>{
    if (command.action!=='summary') { writes++; throw new Error('Synthetic loss after admission'); }
    return { roomId:command.roomId,messageId:command.messageId,observedAt:Date.now(),partial:true,unknown:true,groups:[] };
  };
  f.engine.inspectReactions(...target);
  const prepared=await f.engine.prepareReaction(...target,'add','heart');
  assert.equal((await f.engine.submitReaction(prepared.contextId,request,...target)).status,'unknown');
  f.source().onHealth!('refresh-unavailable'); f.source().onRooms(initial); f.source().onHealth!('live');
  await f.engine.reactionSummary(...target);
  assert.throws(()=>f.engine.inspectReactions(...target,'b'.repeat(32)),/inspection.*unavailable/);
  await assert.rejects(f.engine.prepareReaction(...target,'add','heart'),/Inspect/);
  assert.equal((await f.engine.submitReaction(prepared.contextId,request,...target)).status,'unknown','historical outcome remains exact and unresolved');
  assert.equal(writes,1,'neither recovery, summary nor request replay resubmits a mutation');
  f.engine.inspectReactions(...target,request);
  await f.engine.prepareReaction(...target,'add','heart');
  assert.equal(writes,1); assert.deepEqual(f.receipts,[]); assert.equal(f.counts().network,0);
});

test('startup settlement cannot overwrite a still-degraded source health observation', async t => {
  const f=await fixture(t), gate=deferred();
  f.nextSource([],gate.promise);
  const replacing=f.replace();
  f.source().onHealth!('refresh-unavailable');
  gate.resolve(); await replacing;
  assert.equal(f.engine.snapshot().readStatus,'failed');
  assert.equal(f.engine.snapshot().reactionSource.degraded,true);
  f.source().onHealth!('polling');
  assert.equal(f.engine.snapshot().readStatus,'ready');
  assert.equal(f.engine.snapshot().reactionSource.degraded,false);
});
test('unread activity projects only SDK observations, never REST ordering or receipt outcomes', async t => {
  const f = await fixture(t);
  assert.equal(f.row('known-unread').unreadActivity, at);
  assert.equal(f.row('unknown').unreadActivity, undefined);
  const restActivity = '2026-11-11T12:00:00.000Z', sdkActivity = '2026-11-10T12:00:00.000Z';
  f.setRooms([{ id: 'known-unread', title: 'Renamed', type: 'direct', lastActivity: restActivity }]);
  await f.engine.rooms();
  assert.equal(f.row('known-unread').unreadActivity, at, 'REST lastActivity cannot fabricate a new unread event');
  f.source().onRooms([confirmed('known-unread', true, sdkActivity)]);
  assert.equal(f.row('known-unread').unread, true);
  assert.equal(f.row('known-unread').unreadActivity, sdkActivity, 'already-unread spaces retain new authoritative activity');
  f.source().onHealth!('refresh-unavailable');
  assert.equal(f.row('known-unread').unreadActivity, sdkActivity);
  assert.equal(f.row('known-unread').unreadStale, true, 'historical activity does not claim healthy sync');
  assert.deepEqual(f.receipts, []); assert.equal(f.counts().sends, 0); assert.equal(f.counts().network, 0);
});

test('partial snapshots invalidate only omitted rooms, and never-observed rooms stay unknown until an authoritative result arrives', async t => {
  const f = await fixture(t);
  f.source().onRooms([confirmed('known-unread', false)]); f.source().onHealth!('room-unavailable');
  assert.equal(f.row('known-unread').unread, false); assert.equal(f.row('known-unread').unreadStale, false);
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  await f.engine.select('known-read'); await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  await f.engine.select('unknown'); await assert.rejects(f.engine.markRead('unknown', 'message-unknown'), /unavailable or stale/);
  f.source().onRooms([confirmed('unknown', false)]);
  assert.equal(f.row('unknown').unread, false); assert.equal(f.row('unknown').unreadStale, false);
  assert.equal(f.row('known-unread').unreadStale, true);
  await f.engine.markRead('unknown', 'message-unknown'); assert.deepEqual(f.receipts, ['unknown/message-unknown']);
});

test('fatal sync failure and same-session SDK renewal preserve history without trusting old callbacks or empty startup readiness', async t => {
  const f = await fixture(t); await f.engine.select('known-read'); const old = f.source();
  old.onFailure('sdk-error'); assert.equal(old.closes, 1);
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('known-unread').unreadStale, true);
  const revision = f.engine.snapshot().revision;
  old.onRooms([confirmed('known-unread', false)]); old.onHealth!('live');
  assert.equal(f.engine.snapshot().revision, revision); assert.equal(f.row('known-unread').unread, true);
  const gate = deferred(); f.nextSource([], gate.promise);
  await f.engine.refreshAuth();
  assert.equal(f.sources.length, 2); assert.equal(f.engine.snapshot().readStatus, 'connecting');
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable/);
  gate.resolve(); await tick();
  assert.equal(f.engine.snapshot().readStatus, 'ready'); assert.equal(f.row('known-read').unreadStale, true);
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  f.source().onRooms([confirmed('known-read', true)]);
  assert.equal(f.row('known-read').unread, true); assert.equal(f.row('known-read').unreadStale, false);
  assert.equal(f.row('known-unread').unreadStale, true); assert.equal(f.row('unknown').unread, undefined);
  await f.engine.markRead('known-read', 'message-known-read'); assert.equal(f.receipts.length, 1);
  assert.equal(f.counts().authorizations, 1); assert.equal(f.counts().refreshes, 1); assert.equal(f.counts().network, 0);
});

test('actual newer messages stale a historical read flag across room switches until the SDK catches up', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  const future = '2027-01-01T00:00:00.000Z'; f.messageTimes.set('known-read', future); await f.engine.history();
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  await f.engine.select('known-unread'); assert.equal(f.row('known-read').unreadStale, true, 'leaving the room cannot hide a known contradiction');
  f.source().onRooms(initial); assert.equal(f.row('known-read').unreadStale, true, 'an older authoritative endpoint still contradicts an actual observed message');
  f.source().onRooms([confirmed('known-read', false, future)]);
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, false);
  await f.engine.select('known-read'); await f.engine.markRead('known-read', 'message-known-read'); assert.equal(f.receipts.length, 1);
});

test('snapshot reads do not scan messages or reconcile the read ledger', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  const endpoint = t.mock.getter(MessagingStore.prototype, 'latestMessageCreated');
  // Deliberate owner-local inspection preserves the old exact order/value
  // assertion; no application compatibility map or second ledger is introduced.
  const values = (f.internal.unread as unknown as { values: Map<string, unknown> }).values;
  const before = structuredClone([...values]), revision = f.engine.snapshot().revision;
  for (let i = 0; i < 20; i++) f.engine.snapshot();
  assert.equal(endpoint.mock.callCount(), 0, 'read projection does not observe store endpoints');
  assert.deepEqual([...values], before);
  assert.equal(f.engine.snapshot().revision, revision);
});

test('identical SDK observations avoid projection/merge work, but equal-length field changes and recovery do not', async t => {
  const f = await fixture(t); const merge = t.mock.method(f.store(), 'mergeRooms');
  const before = f.engine.snapshot().revision;
  for (let i = 0; i < 1000; i++) f.source().onRooms(initial.map(room => ({ ...room })));
  assert.equal(merge.mock.callCount(), 0); assert.equal(f.engine.snapshot().revision, before);
  f.source().onRooms(initial.map(room => ({ ...room, title: room.title.replace('known', 'other') })));
  assert.equal(merge.mock.callCount(), 1, 'same IDs/counts are not evidence of an unchanged projection');
  f.source().onHealth!('refresh-unavailable');
  const failed = f.engine.snapshot().revision;
  f.source().onRooms(initial); f.source().onHealth!('live');
  assert.ok(f.engine.snapshot().revision > failed);
  assert.equal(f.row('known-read').unreadStale, false);
});

test('same-turn source bursts reach RPC before the retained evidence ring evicts other-client events', async t => {
  const f = await fixture(t), packets: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => packets.push(value));
  try {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } })); packets.length = 0;
    const created = new Date().toISOString();
    for (let i = 0; i < 100; i++) f.source().onMessages!([{ id: `event-${i}`, roomId: 'known-read', created, self: i % 2 === 0 }]);
    await Promise.resolve();
    assert.equal(f.engine.snapshot().messageEvents.items.length, 64, 'existing retention bound stays intact');
    const evidence = new Map(packets.filter(value => value.method === 'state').flatMap(value => value.params.messageEvents.items).map(item => [item.id, item]));
    assert.equal(evidence.size, 100, 'coalescing does not silently reduce the burst to its final 64 items');
    assert.equal([...evidence.values()].filter(item => item.self).length, 50, 'same-account posts from other clients remain eligible');
    assert.deepEqual(f.receipts, []);
  } finally { await rpc.close(); }
});

test('store transitions retain message contradictions even when no snapshot projection runs', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  const snapshot = f.engine.snapshot(), projection = t.mock.method(f.engine, 'snapshot', () => snapshot);
  const future = '2027-01-01T00:00:00.000Z';
  f.messageTimes.set('known-read', future); await f.engine.history();
  await f.engine.select('known-unread');
  f.source().onRooms(initial);
  projection.mock.restore();
  assert.equal(f.row('known-read').unreadStale, true, 'leaving a room never erases actual message evidence');
  f.messageTimes.set('known-read', at); await f.engine.select('known-read');
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  assert.deepEqual(f.receipts, []);
  f.source().onRooms([confirmed('known-read', false, future)]);
  await f.engine.markRead('known-read', 'message-known-read');
  assert.equal(f.receipts.length, 1);
});

test('receipt admission still reconciles actual activity if no store notification preceded the action', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  f.store().messages[0]!.created = '2027-01-01T00:00:00.000Z';
  await assert.rejects(f.engine.markRead('known-read', 'message-known-read'), /unavailable or stale/);
  assert.deepEqual(f.receipts, []);
});

test('a latest endpoint withheld by the display cap still contradicts read authority across room switches', async t => {
  const f = await fixture(t), future = '2027-01-01T00:00:00.000Z';
  let newest = false;
  t.mock.method(WebexMessagingAPI.prototype, 'history', async (room: string) => ({ items: room !== 'known-read'
    ? [{ id: 'other', author: 'Synthetic', text: 'Other', created: at }]
    : newest ? [{ id: 'withheld', author: 'Synthetic', text: 'New endpoint', created: future }]
    : Array.from({ length: 500 }, (_, i) => ({ id: `loaded-${i}`, author: 'Synthetic', text: 'Loaded', created: at })) }));
  await f.engine.select('known-read'); newest = true;
  await f.engine.history();
  assert.equal(f.store().latestMessageId, 'withheld');
  assert.equal(f.store().messages.some(message => message.id === 'withheld'), false);
  assert.equal(f.engine.snapshot().historyLatest, false);
  await f.engine.select('known-unread'); f.source().onRooms(initial);
  assert.equal(f.row('known-read').unreadStale, true);
  f.source().onRooms([confirmed('known-read', false, future)]);
  assert.equal(f.row('known-read').unreadStale, false);
  assert.deepEqual(f.receipts, []);
});

test('session-local unread cache is bounded, retains the selected room and does not turn evicted or never-observed entries into read', async t => {
  const f = await fixture(t); await f.engine.select('known-read');
  for (let batch = 0; batch < 4; batch++) {
    f.source().onRooms(Array.from({ length: 500 }, (_, i) => confirmed(`batch-${batch}-${i}`, i % 2 === 0)));
    assert.ok(f.internal.unread.size <= 1000);
  }
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  f.source().onFailure('sdk-error');
  f.setRooms([confirmed('known-read', false), confirmed('batch-0-0', false), { id: 'never-seen', title: 'Never seen', type: 'direct', lastActivity: at }]);
  await f.engine.rooms();
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  assert.equal(f.row('batch-0-0').unread, undefined); assert.equal(f.row('batch-0-0').unreadStale, undefined);
  assert.equal(f.row('never-seen').unread, undefined); assert.ok(f.internal.unread.size <= 1000);
  f.nextSource(initial); await f.replace();
  const source = f.source(); source.onClose = () => source.onRooms(initial);
  f.engine.stop(); assert.equal(f.internal.unread.size, 0);
  source.onRooms(initial); assert.equal(f.internal.unread.size, 0, 'late callbacks cannot repopulate a stopped session');
});

test('scope loss preserves stale local flags without starting an SDK or people reads; restoring scope requires fresh observations', async t => {
  const f = await fixture(t, true); assert.equal(f.peopleOptions.length, 1);
  const owner=f.engine.snapshot().reactionSource;
  const old = f.source();
  f.setAccess(credentials('spark:rooms_read spark:messages_read spark:messages_write spark:people_read spark:memberships_read'));
  await f.engine.refreshAuth();
  assert.equal(f.sources.length, 1); assert.equal(old.closes, 1); assert.equal(f.engine.snapshot().readStatus, 'failed');
  assert.ok(f.engine.snapshot().reactionSource.epoch>owner.epoch);
  assert.equal(f.engine.snapshot().reactionSource.degraded,false,'grant loss is terminal for reaction presentation');
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('known-unread').unreadStale, true);
  assert.equal(f.row('known-read').unread, false); assert.equal(f.row('known-read').unreadStale, true);
  assert.equal(f.row('unknown').unread, undefined); assert.match(f.engine.snapshot().readStatusNotice, /spark:all/);
  assert.equal(f.peopleOptions.length, 2); assert.deepEqual(f.peopleOptions[1]!.grantedScopes,
    ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write', 'spark:people_read', 'spark:memberships_read']);
  old.onRooms([confirmed('known-unread', false)]); old.onHealth!('live'); assert.equal(f.row('known-unread').unreadStale, true);
  f.setAccess(credentials()); f.nextSource([confirmed('known-unread', false)]); await f.engine.refreshAuth(); await tick();
  assert.equal(f.sources.length, 2); assert.equal(f.row('known-unread').unread, false); assert.equal(f.row('known-unread').unreadStale, false);
  assert.equal(f.row('known-read').unreadStale, true); assert.equal(f.peopleOptions.length, 3);
  assert.equal(f.counts().peopleLookups, 0, 'unread recovery and OAuth renewal do not trigger optional people reads');
  assert.equal(f.counts().authorizations, 1); assert.equal(f.counts().refreshes, 2); assert.equal(f.counts().network, 0);
});

test('whole-session failures retain cached flags, while explicit stop, mode and account configuration changes clear them', async t => {
  const f = await fixture(t); f.internal.failed('Synthetic whole-session failure.');
  assert.ok(f.internal.unread.size > 0);
  f.nextSource([]); await f.engine.start('live', f.config, true);
  assert.equal(f.row('known-unread').unread, true); assert.equal(f.row('known-unread').unreadStale, true);
  f.engine.stop(); assert.equal(f.internal.unread.size, 0);
  f.nextSource([]); await f.engine.start('live', f.config, true);
  assert.equal(f.row('known-unread').unread, undefined, 'an explicit stop erases the historical cache');
  f.source().onRooms(initial); f.internal.failed('Synthetic failure.');
  await f.engine.start('demo', f.config, true); assert.equal(f.internal.unread.size, 0, 'changing mode cannot reuse live unread state');
  await assert.rejects(f.engine.start('live', f.config, true), error => (error as { code?: number }).code === -32002);
  f.engine.stop(); f.nextSource(initial); await f.engine.start('live', f.config, true);
  f.internal.failed('Synthetic failure.');
  const other = join(f.directory, 'other-account.json'); await writeFile(other, JSON.stringify({ oauth: { ...profile, clientId: 'other-synthetic-account' } }), { mode: 0o600 });
  f.nextSource([]); await f.engine.start('live', other, true);
  assert.equal(f.row('known-unread').unread, undefined); assert.equal(f.internal.unread.size, 0, 'account/config changes clear last-confirmed state');
  f.source().onRooms(initial); f.internal.failed('Synthetic failure.');
  await writeFile(other, JSON.stringify({ oauth: { ...profile, clientId: 'another-profile' } }));
  f.nextSource([]); await f.engine.start('live', other, true);
  assert.equal(f.row('known-unread').unread, undefined, 'changing the OAuth profile at the same path is also isolated');
});
