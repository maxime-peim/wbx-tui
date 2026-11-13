import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMessageReaders } from '../src/readers-sdk.js';
import { validMessageReaders, validReaderTarget, type MessageReaders } from '../src/message-readers.js';
import { validReadStatusRequest } from '../src/read-status-protocol.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { ReadStatusWorker } from '../src/read-status.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = (kind: string, n: number, region = 'us') => Buffer.from(`ciscospark://${region}/${kind}/${uuid(n)}`).toString('base64');
const target = { roomId: id('ROOM', 1), messageId: id('MESSAGE', 2) };
const at = '2026-11-19T08:00:00.000Z', later = '2026-11-19T08:01:00.000Z', now = () => Date.parse('2026-11-19T08:02:00.000Z');
function fixture() {
  const message: any = { id: target.messageId, roomId: target.roomId, personId: id('PEOPLE', 3), created: at };
  const member = (n: number, lastSeenId = target.messageId, lastSeenDate = at): any => ({
    roomId: target.roomId, personId: id('PEOPLE', n), personDisplayName: `Person ${n}`, lastSeenId, lastSeenDate,
  });
  const page: any = { items: [member(3), member(4), member(5, id('MESSAGE', 6), later)] }, calls: string[] = [];
  const sdk: any = { messages: { async get(messageId: string) { assert.equal(messageId, target.messageId); calls.push('message'); return message; } },
    memberships: { async listWithReadStatus(options: unknown) { assert.deepEqual(options, { roomId: target.roomId }); calls.push('members'); return page; } } };
  return { sdk, message, page, member, calls, read: () => readMessageReaders(sdk, target, () => {}, now) };
}
test('read-through evidence binds the exact message, excludes its sender, sanitizes names and never emits read times', async () => {
  const f = fixture(); f.page.items[1].personDisplayName = '  Alice\n\x1b  Example ';
  f.page.items[1].personEmail = 'PRIVATE'; f.page.items[1].avatar = 'PRIVATE';
  const before = structuredClone(f.page), result = await f.read();
  assert.deepEqual(result, { ...target, coverage: 'space-read-watermark', observedAt: now(), partial: true,
    readers: [{ personId: id('PEOPLE', 4), name: 'Alice Example' }, { personId: id('PEOPLE', 5), name: 'Person 5' }] });
  assert.deepEqual(f.page, before); assert.deepEqual(f.calls, ['message', 'members']);
  assert.equal(validMessageReaders(result), true); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('lastSeen'));
  f.message.personId = id('PEOPLE', 3, 'eu');
  assert.equal((await f.read()).readers.length, 2, 'an ambiguous author namespace cannot count the sender as another reader');
});
test('equivalent padded and unpadded regional SDK IDs retain exact room/message binding', async () => {
  for (const cluster of ['us', 'eu-central-1', 'us-west-2']) for (const paddedTarget of [false, true]) {
    const f = fixture(), regional = { roomId: id('ROOM', 1, cluster), messageId: id('MESSAGE', 2, cluster) };
    const returned = { ...regional };
    if (!paddedTarget) {
      regional.roomId = regional.roomId.replace(/=+$/, '');
      regional.messageId = regional.messageId.replace(/=+$/, '');
    } else {
      returned.roomId = returned.roomId.replace(/=+$/, '');
      returned.messageId = returned.messageId.replace(/=+$/, '');
    }
    f.message.id = returned.messageId;
    f.message.roomId = returned.roomId;
    f.sdk.messages.get = async (message: string) => { assert.equal(message, regional.messageId); return f.message; };
    f.sdk.memberships.listWithReadStatus = async (options: unknown) => {
      assert.deepEqual(options, { roomId: regional.roomId });
      return { items: [{ ...f.member(4), roomId: returned.roomId, lastSeenId: returned.messageId }] };
    };
    const result = await readMessageReaders(f.sdk, regional, () => {}, now);
    assert.deepEqual(result, { ...regional, coverage: 'space-read-watermark', observedAt: now(), partial: true,
      readers: [{ personId: id('PEOPLE', 4), name: 'Person 4' }] });
  }
});
test('missing, malformed, ambiguous-equal-time, older, contradictory and future watermarks never prove a read', async () => {
  const f = fixture();
  for (const patch of [
    { lastSeenId: undefined, lastSeenDate: undefined }, { lastSeenId: undefined },
    { lastSeenDate: 'invalid' }, { lastSeenDate: '2026-02-30T08:00:00.000Z' },
    { lastSeenDate: '2026-11-19T07:59:00.000Z' }, { lastSeenId: id('MESSAGE', 9), lastSeenDate: at },
    { lastSeenId: id('MESSAGE', 9, 'eu'), lastSeenDate: later }, { lastSeenId: id('ROOM', 9), lastSeenDate: later },
    { lastSeenId: id('MESSAGE', 9), lastSeenDate: '2026-11-19T08:03:00.000Z' },
  ]) {
    f.page.items = [{ ...f.member(4), ...patch }];
    assert.deepEqual((await f.read()).readers, [], JSON.stringify(patch));
  }
});
test('foreign targets, author ambiguity, duplicate identities and malformed/oversized memberships fail closed', async () => {
  for (const change of ['room', 'message', 'room-cluster', 'message-cluster', 'room-type', 'message-type', 'author', 'date',
    'foreign-member', 'member-cluster', 'member-type', 'duplicate', 'oversized', 'shape']) {
    const f = fixture();
    if (change === 'room') f.message.roomId = id('ROOM', 9);
    if (change === 'message') f.message.id = id('MESSAGE', 9);
    if (change === 'room-cluster') f.message.roomId = id('ROOM', 1, 'eu');
    if (change === 'message-cluster') f.message.id = id('MESSAGE', 2, 'eu');
    if (change === 'room-type') f.message.roomId = id('MESSAGE', 1);
    if (change === 'message-type') f.message.id = id('ROOM', 2);
    if (change === 'author') delete f.message.personId;
    if (change === 'date') f.message.created = 'bad';
    if (change === 'foreign-member') f.page.items[1].roomId = id('ROOM', 9);
    if (change === 'member-cluster') f.page.items[1].roomId = id('ROOM', 1, 'eu');
    if (change === 'member-type') f.page.items[1].roomId = id('MESSAGE', 1);
    if (change === 'duplicate') f.page.items.push({ ...f.page.items[1] });
    if (change === 'oversized') f.page.items = Array.from({ length: 501 }, (_, i) => f.member(i + 10));
    if (change === 'shape') f.page.items = {};
    await assert.rejects(f.read());
  }
  const f = fixture();
  await assert.rejects(readMessageReaders(f.sdk, { ...target, messageId: id('MESSAGE', 2, 'eu') }));
  assert.deepEqual(f.calls, []);
  await assert.rejects(readMessageReaders(f.sdk, target, () => { throw new Error('Canceled'); }));
  assert.deepEqual(f.calls, []);
  f.sdk.messages.get = async () => { throw new Error('Denied'); };
  await assert.rejects(f.read()); assert.deepEqual(f.calls, []);
});
test('bounded reader output makes no absence/completeness claim, even for an empty or truncated SDK projection', async () => {
  const f = fixture();
  f.page.items = Array.from({ length: 500 }, (_, i) => f.member(i + 10));
  const value = await f.read(); assert.equal(value.readers.length, 128); assert.equal(value.partial, true);
  f.page.items = []; assert.deepEqual((await f.read()).readers, []); assert.equal((await f.read()).partial, true);
});
test('read-by RPC/IPC contracts cannot tunnel actors, URLs, receipts or arbitrary provider fields', () => {
  assert.ok(validReaderTarget(target));
  assert.ok(validReadStatusRequest({ type: 'readers', id: 1, ...target }));
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.readBy', params: target }).params, target);
  assert.deepEqual(parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.readBy',params:{...target,watch:true}}).params,{...target,watch:true});
  for (const watch of [false,1,'true',{}]) assert.throws(()=>parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.readBy',params:{...target,watch}}));
  for (const patch of [{ actorId: 'other' }, { url: 'https://private.invalid' }, { markRead: true }, { messageId: [] }]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.readBy', params: { ...target, ...patch } }));
    assert.equal(validReadStatusRequest({ type: 'readers', id: 1, ...target, ...patch }), false);
  }
  const base: MessageReaders = { ...target, coverage: 'space-read-watermark', observedAt: now(), partial: true, readers: [{ personId: 'person', name: 'Person' }] };
  for (const patch of [{ partial: 'yes' }, { observedAt: -1 }, { coverage: 'exact-read-time' }, { secret: 'PRIVATE' },
    { readers: [{ personId: 'person', name: 'Person\nPRIVATE' }] }, { readers: [base.readers[0], base.readers[0]] },
    { readers: [{ personId: 'person', name: 'Person', email: 'PRIVATE' }] }]) assert.equal(validMessageReaders({ ...base, ...patch }), false);
});
const worker = fileURLToPath(new URL('read-status-worker-fixture.mjs', import.meta.url));
async function close(source: ReadStatusWorker) {
  const child = (source as unknown as { child: ChildProcess }).child;
  const exited = child && child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
  source.close(); await exited;
}
for (const mode of ['readers-ok', 'readers-foreign', 'readers-extra', 'readers-hang', 'readers-denied'])
  test(`private read-by IPC ${mode} remains correlated, bounded and separate from receipts/reactions`, async () => {
    const source = new ReadStatusWorker(worker, mode === 'readers-hang' ? 300 : 2000), failures: unknown[] = [], snapshots: unknown[] = [];
    source.onFailure = reason => failures.push(reason); source.onRooms = value => snapshots.push(value);
    try {
      await source.start({ token: mode, scope: 'spark:all', expiresAt: Date.now() + 60000 });
      const pending = source.readers(target);
      await assert.rejects(source.readers(target), /pending/);
      await assert.rejects(source.reactions({ roomId: target.roomId, messageIds: [target.messageId] }), /busy/);
      if (mode === 'readers-ok') {
        assert.ok(validMessageReaders(await pending)); assert.deepEqual(failures, []); assert.equal(snapshots.length, 1);
      } else {
        await assert.rejects(pending);
        assert.deepEqual(failures, mode === 'readers-hang' ? ['sdk-error'] : mode === 'readers-denied' ? [] : ['invalid-data']);
      }
    } finally { await close(source); }
  });
test('demo Read By includes person discussions without treating an empty list as unread', async t => {
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Live network forbidden');});
  const engine=new EditorEngine();
  try {
    await engine.start('demo');
    const room=engine.snapshot().rooms.find(room=>room.type==='direct')!;
    assert.ok(room,'fixture has a genuine direct conversation');
    await engine.select(room.id);
    const before=engine.snapshot();
    const readers=await engine.messageReaders(room.id,before.messages[0]!.id);
    assert.ok(validMessageReaders(readers)); assert.equal(readers.readers.length,1);
    assert.equal(readers.roomId,room.id); assert.deepEqual(engine.snapshot().rooms,before.rooms);
  } finally { await engine.stop(); }
});
test('actual engine/RPC read-by path uses the existing source once, ignores stale results and never marks read', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Live network forbidden'); });
  const source = new ReadStatusWorker(worker, 2000), engine = new EditorEngine(undefined, () => source), out: any[] = [];
  const rpc = new EditorRPC(engine, new EditorMeetings(), value => { out.push(value); });
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const internal = engine as any;
    await internal.startReadStatus({ token: 'readers-ok', scope: 'spark:all', expiresAt: Date.now() + 60000 }, internal.generation);
    Object.assign(engine, { mode: 'live', token: 'SYNTHETIC', expiresAt: Date.now() + 60000, grantedScope: 'spark:all' });
    const params = { roomId: 'demo-general', messageId: engine.snapshot().messages[0]!.id };
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } }));
    const messages = engine.snapshot().messages, rooms = engine.snapshot().rooms;
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'messages.readBy', params }));
    assert.ok(validMessageReaders(out.find(v => v.id === 2).result));
    assert.deepEqual(engine.snapshot().messages, messages);
    assert.deepEqual(engine.snapshot().rooms, rooms, 'inspecting readers cannot change your own unread state');
    assert.equal(JSON.stringify(engine.snapshot()).includes('Reader Name'), false, 'reader identities are not broadcast in full-state snapshots');
    await assert.rejects(engine.messageReaders('never-loaded', params.messageId));
    await assert.rejects(engine.messageReaders(params.roomId, 'never-loaded'));
    const pending = engine.messageReaders(params.roomId, params.messageId);
    internal.store.messages[0].text += ' changed';
    await assert.rejects(pending, /unavailable/);
    source.onHealth('rate-limited');
    await assert.rejects(engine.messageReaders(params.roomId, params.messageId));
  } finally { await close(source); await rpc.close(); }
});
for (const change of ['none', 'room', 'endpoint', 'backoff', 'source', 'freshness', 'deadline', 'unsolicited', 'grant', 'expiry'])
  test(`an admitted receipt waits for Read By and revalidates before its only submission (${change})`, async t => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Live network forbidden'); });
    const source = new ReadStatusWorker(worker, change === 'deadline' ? 300 : 2000), engine = new EditorEngine(undefined, () => source);
    const packets: string[] = [];
    try {
      await engine.start('demo', undefined, true); await engine.select('demo-general');
      const internal = engine as any;
      await internal.startReadStatus({ token: change === 'deadline' ? 'readers-hang' : change === 'unsolicited' ? 'readers-early-receipt' : 'readers-ok',
        scope: 'spark:all', expiresAt: Date.now() + 60000 }, internal.generation);
      Object.assign(engine, { mode: 'live', token: 'SYNTHETIC', expiresAt: Date.now() + 60000, grantedScope: 'spark:all' });
      const room = engine.snapshot().room!, message = engine.snapshot().messages.at(-1)!;
      source.onRooms([{ ...room, lastActivity: message.created, lastSeen: message.created }]);
      const child = (source as unknown as { child: ChildProcess }).child, send = child.send.bind(child);
      t.mock.method(child, 'send', (value: any, ...args: any[]) => {
        packets.push(value.type); return (send as any)(value, ...args);
      });
      const readers = engine.messageReaders(room.id, message.id);
      const receipt = engine.markRead(room.id, message.id);
      const finished = Promise.allSettled([readers, receipt]);
      assert.deepEqual(packets, ['readers'], 'no receipt overlaps the physical reader lookup');
      if (change === 'none') await assert.rejects(engine.markRead(room.id, message.id), /pending/);
      if (change === 'room') internal.store.room = { ...room, id: 'different-room' };
      if (change === 'endpoint') internal.store.messages.push({ ...message, id: 'newer-endpoint' });
      if (change === 'backoff') source.onHealth('rate-limited');
      if (change === 'source') source.onFailure('sdk-error');
      if (change === 'freshness') source.onRooms([]);
      if (change === 'grant') internal.grantedScope = 'spark:rooms_read';
      if (change === 'expiry') internal.expiresAt = Date.now()-1;
      const results = await finished;
      assert.equal(results[1]!.status, change === 'none' ? 'fulfilled' : 'rejected');
      assert.deepEqual(packets.filter(type => type === 'read'), change === 'none' ? ['read'] : [],
        'a stale/changed/backed-off source never submits a delayed receipt');
      if (change === 'none') {
        assert.equal(results[0]!.status, 'fulfilled');
        assert.deepEqual(packets, ['readers', 'read'], 'one SDK receipt follows the settled read without retrying either operation');
      }
    } finally { engine.stop(); await close(source); }
  });
test('room-only reader hints cross private IPC without becoming a receipt or a room revocation',async()=>{
  const source=new ReadStatusWorker(worker,2000),changes:unknown[]=[];
  try {
    const received=new Promise<void>(resolve=>{source.onChanges=value=>{changes.push(...value);resolve();};});
    await source.start({token:'change-readers',scope:'spark:all',expiresAt:Date.now()+60000});
    await received;
    assert.deepEqual(changes,[{kind:'readers-changed',roomId:'room-1'}]);
  } finally {await close(source);}
});
test('actual engine/RPC reader hints require client opt-in and stay selected-room/session/source bound without fetching',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Live network forbidden');});
  const source=new ReadStatusWorker(worker,2000),engine=new EditorEngine(undefined,()=>source),out:any[]=[];
  const rpc=new EditorRPC(engine,new EditorMeetings(),v=>{out.push(v);});
  try {
    await engine.start('demo');await engine.select('demo-general');
    const internal=engine as any;
    await internal.startReadStatus({token:'readers-ok',scope:'spark:all',expiresAt:Date.now()+60000},internal.generation);
    Object.assign(engine,{mode:'live',token:'SYNTHETIC',expiresAt:Date.now()+60000,grantedScope:'spark:all'});
    const params={roomId:'demo-general',messageId:engine.snapshot().messages[0]!.id};
    const notify=()=>out.filter(v=>v.method==='messages.readersChanged');
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:1,method:'hello',params:{version:1}}));
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:2,method:'messages.readBy',params}));
    source.onChanges([{kind:'readers-changed',roomId:params.roomId}]);
    assert.equal(notify().length,0,'legacy clients never receive an unknown notification');
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:3,method:'messages.readBy',params:{...params,watch:true}}));
    const before=engine.snapshot();
    const reads=t.mock.method(source,'readers',async()=>{throw new Error('Hints cannot fetch');});
    source.onChanges([{kind:'readers-changed',roomId:'other-room'}]);
    source.onChanges([{kind:'readers-changed',roomId:params.roomId}]);
    assert.deepEqual(notify().map(v=>v.params),[{roomId:params.roomId,sessionId:before.localContext!.sessionId,
      sourceEpoch:before.reactionSource.epoch,sourceRevision:before.reactionSource.revision}]);
    assert.equal(reads.mock.callCount(),0);assert.deepEqual(engine.snapshot().rooms,before.rooms);
    assert.deepEqual(engine.snapshot().messages,before.messages);
    source.onHealth('rate-limited');source.onChanges([{kind:'readers-changed',roomId:params.roomId}]);
    assert.equal(notify().length,1,'SDK backoff suppresses live hints instead of triggering read retries');
    const old=source.onChanges;engine.stop();old([{kind:'readers-changed',roomId:params.roomId}]);
    assert.equal(notify().length,1,'retired source hints cannot survive a stopped session');
  } finally {await close(source);await rpc.close();}
});
