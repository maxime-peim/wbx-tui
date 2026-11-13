import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { transform } from 'esbuild';
import { chatId } from '../src/chat-protocol.js';
import * as protocol from '../src/read-status-protocol.js';
import { readStatusOutput } from '../src/state-output.js';
import { SDKReactions } from '../src/reactions-sdk.js';
import { ReactionReadError } from '../src/reaction-contracts.js';
import { readMessageReaders } from '../src/readers-sdk.js';
import { SDKJoinedMeetings } from '../src/joined-meetings-sdk.js';

// Compile only in memory, then execute the actual worker source with synthetic
// SDK/process/clock boundaries. No child, generated artifact, SDK or network.
const worker = readFile(new URL('../src/read-status-worker.ts', import.meta.url), 'utf8')
  .then(source => transform(source, { loader: 'ts', format: 'cjs', target: 'node22' }));
class Clock {
  now = 0;
  private sequence = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  setTimeout = (callback: () => void, delay = 0): number => {
    const id = ++this.sequence;
    this.timers.set(id, { at: this.now + delay, callback }); return id;
  };
  clearTimeout = (id: number): void => { this.timers.delete(id); };
  private async settle(): Promise<void> {
    // Each worker operation has a fixed, short await chain. Flush it before
    // advancing to the next timer, so virtual SDK completions precede deadlines.
    for (let turn = 0; turn < 32; turn++) await Promise.resolve();
  }
  async advance(duration: number): Promise<void> {
    const end = this.now + duration;
    await this.settle();
    for (let steps = 0; ; steps++) {
      assert.ok(steps < 10_000, 'bounded virtual timer work');
      const next = [...this.timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.now = timer.at; this.timers.delete(id); timer.callback();
      await this.settle();
    }
    this.now = end; await this.settle();
  }
}
interface NativeCall { kind: 'full' | 'room'; start: number; end?: number; id?: string }
async function fixture(lookupDelay: number, fullDelay: number, options: { captureAtAdmission?: boolean; receiptDelay?: number; reactionAdapter?:unknown; initial429?: unknown; reader?: typeof readMessageReaders } = {}) {
  const clock = new Clock(), packets: { at: number; value: any }[] = [], calls: NativeCall[] = [];
  const events = () => Object.assign(new EventEmitter(), { listen: async () => {}, stopListening() {} });
  const rooms = events(), memberships = events(), messages = events();
  const items = Array.from({ length: 65 }, (_, index) => ({ id: `fair-${index}`, title: `Room ${index}`, type: 'group',
    lastActivityDate: '2026-11-09T12:00:00.000Z', lastSeenActivityDate: '2026-11-09T11:00:00.000Z' }));
  let active = 0, maxActive = 0, exited: number | undefined, holdIPC = false, receipts = 0, registrations = 0;
  let limited = !!options.initial429;
  const completions: (() => void)[] = [];
  const native = async <T>(kind: NativeCall['kind'], delay: number, result: () => T, id?: string): Promise<T> => {
    assert.equal(active, 0, 'full reconciliation must never overlap an individual lookup');
    active++; maxActive = Math.max(maxActive, active);
    const call: NativeCall = { kind, id, start: clock.now }; calls.push(call);
    const captured = options.captureAtAdmission ? result() : undefined;
    if (delay) await new Promise<void>(resolve => clock.setTimeout(resolve, delay));
    active--; call.end = clock.now; return options.captureAtAdmission ? captured! : result();
  };
  const sdk = Object.assign(new EventEmitter(), { ready: true,
    rooms: Object.assign(rooms, {
      listWithReadStatus: () => native('full', fullDelay, () => {
        if (limited) { limited = false; throw options.initial429; }
        return { items: items.map(item => ({ ...item })) };
      }),
      getWithReadStatus: (id: string) => native('room', lookupDelay, () => ({ ...items.find(item => item.id === id)! }), id),
    }),
    memberships: Object.assign(memberships, { updateLastSeen: async () => {
      receipts++; if (options.receiptDelay === undefined) throw new Error('No receipts permitted.');
      if (options.receiptDelay) await new Promise<void>(resolve => clock.setTimeout(resolve, options.receiptDelay));
    } }), messages,
    internal: { me: { id: 'self' as unknown }, device: { register: async () => { registrations++; }, unregister: async () => {} }, mercury: { disconnect: async () => {} } },
  });
  const process = Object.assign(new EventEmitter(), { connected: true,
    send: (value: object, complete?: () => void) => {
      packets.push({ at: clock.now, value: structuredClone(value) });
      if (holdIPC && complete) completions.push(complete); else complete?.();
    },
    exit: (code: number) => { exited = code; process.connected = false; },
  });
  const modules: Record<string, unknown> = { './chat-protocol.js': { chatId }, './read-status-protocol.js': protocol,
    './joined-meetings-sdk.js': { SDKJoinedMeetings },
    './reactions-sdk.js': { SDKReactions:options.reactionAdapter ?? SDKReactions },
    './reaction-contracts.js': { ReactionReadError }, './readers-sdk.js': { readMessageReaders: options.reader ?? readMessageReaders },
    './read-status-sdk.js': { createReadStatusSDK: () => sdk }, './state-output.js': { readStatusOutput } };
  const origin = Date.now();
  const context = createContext({ process, Date: class extends Date { static now() { return origin + clock.now; } },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    require: (name: string) => { assert.ok(name in modules, `Unexpected worker dependency: ${name}`); return modules[name]; } });
  runInContext((await worker).code, context);
  process.emit('message', { type: 'start', credentials: { token: 'synthetic', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 } });
  await clock.advance(2 * fullDelay);
  assert.equal(calls.filter(call => call.kind === 'full' && call.end !== undefined).length, options.initial429 ? 1 : 2, 'startup fetches settle without retrying a 429');
  assert.equal(packets.filter(packet => packet.value.type === 'ready').length, 1);
  const burst = (overflow = false) => {
    for (const item of items.slice(0, overflow ? 65 : 64)) memberships.emit('seen', { data: { roomId: item.id } });
  };
  return { clock, packets, calls, items, burst, maxActive: () => maxActive, exited: () => exited,
    queued: () => runInContext('pending.size', context) as number, active: () => active, receipts: () => receipts, registrations: () => registrations,
    setSelf(id: unknown) { sdk.internal.me.id = id; },
    membershipEvent(event: unknown, kind = 'seen') { memberships.emit(kind, event); },
    roomUpdated(event: unknown) { rooms.emit('updated', event); },
    read(id: number, roomId: string, messageId = 'synthetic-message') { process.emit('message', { type: 'read', id, roomId, messageId }); },
    request(value:protocol.ReadStatusRequest) { process.emit('message',value); },
    stop() { process.emit('message', { type: 'stop' }); },
    holdIPC() { holdIPC = true; }, completeIPC() { completions.shift()?.(); }, ipcPending: () => completions.length,
    roomEvent(id: string) { memberships.emit('seen', { data: { roomId: id } }); },
    message(id: string, self: boolean) { messages.emit('created', { data: { id, roomId: items[0]!.id, created: new Date().toISOString(), personId: self ? 'self' : 'peer' } }); },
    invalidRequest() { process.emit('message', { type: 'invalid' }); } };
}

test('initial discovery 429 preserves the SDK, honors Retry-After, and never replays mutations', async () => {
  let reads = 0;
  class Adapter {
    mutating() { return false; }
    async summaries(batch: { roomId: string; messageIds: string[] }) {
      reads++; return { roomId: batch.roomId, items: [] };
    }
  }
  const f = await fixture(0, 0, { initial429: { response: { statusCode: 429, headers: { 'retry-after': '120' } } }, reactionAdapter: Adapter });
  try {
    assert.equal(f.exited(), undefined); assert.equal(f.registrations(), 1);
    assert.equal(f.packets.at(-1)!.value.status, 'rate-limited');
    f.burst();
    const batch = { roomId: 'fair-0', messageIds: ['message'] };
    f.request({ type: 'reactions', id: 10, batch }); await f.clock.advance(0);
    assert.equal(f.packets.find(p => p.value.id === 10)!.value.reason, 'worker:rate-limited');
    await f.clock.advance(119999);
    assert.equal(f.calls.length, 1); assert.equal(reads, 0); assert.equal(f.receipts(), 0);
    assert.ok(f.packets.filter(p => p.value.type === 'health').length >= 2, 'long backoff retains the parent heartbeat');
    await f.clock.advance(1);
    assert.ok(f.calls.length > 1, 'metadata resumes at, never before, the server deadline');
    f.request({ type: 'reactions', id: 11, batch }); await f.clock.advance(0);
    assert.equal(reads, 1); assert.equal(f.registrations(), 1); assert.equal(f.receipts(), 0);
    assert.equal(f.exited(), undefined);
  } finally { f.stop(); await f.clock.advance(0); }
});

test('explicit read-by holds physical admission until settlement or fatal deadline; no receipt, competing reaction or reconnect', async () => {
  let calls = 0;
  const f = await fixture(0, 0, { reader: async () => { calls++; return new Promise(() => {}); } });
  const target = { roomId: 'loaded-room', messageId: 'loaded-message' };
  f.request({ type: 'readers', id: 901, ...target }); await f.clock.advance(0);
  f.request({ type: 'readers', id: 902, ...target });
  f.request({ type: 'reactions', id: 903, batch: { roomId: target.roomId, messageIds: [target.messageId] } });
  f.read(904, target.roomId);
  await f.clock.advance(0);
  assert.equal(calls, 1); assert.equal(f.receipts(), 0);
  assert.ok(f.packets.some(p => p.value.type === 'readers' && p.value.id === 902 && p.value.failed));
  assert.ok(f.packets.some(p => p.value.type === 'reactions' && p.value.id === 903 && p.value.reason === 'worker:busy'));
  await f.clock.advance(31_000);
  assert.equal(f.exited(), 0); assert.equal(f.registrations(), 1); assert.equal(calls, 1);
  assert.ok(f.packets.some(p => p.value.type === 'failed' && p.value.reason === 'sdk-error'));
});

test('a read-by 429 enters the shared server backoff instead of admitting another inspection', async () => {
  let calls = 0;
  const f = await fixture(0, 0, { reader: async () => { calls++; throw { statusCode: 429, headers: { 'retry-after': '120' } }; } });
  const target = { roomId: 'loaded-room', messageId: 'loaded-message' };
  f.request({ type: 'readers', id: 911, ...target }); await f.clock.advance(0);
  f.request({ type: 'readers', id: 912, ...target }); await f.clock.advance(0);
  assert.equal(calls, 1); assert.equal(f.receipts(), 0);
  assert.ok(f.packets.some(p => p.value.type === 'health' && p.value.status === 'rate-limited'));
  await f.clock.advance(60_000);
  f.request({ type: 'readers', id: 913, ...target }); await f.clock.advance(0);
  assert.equal(calls, 1); assert.equal(f.registrations(), 1); assert.equal(f.exited(), undefined);
});

test('loaded-target reaction reads do not depend on the first unread-status refresh; uncached-room writes stay refused',async()=>{
  const calls:string[]=[];
  class ReactionAdapter {
    mutating() {return false;}
    async perform(command:{roomId:string;messageId:string;action:string}) {
      calls.push(command.action);
      return {roomId:command.roomId,messageId:command.messageId,observedAt:100,partial:true,unknown:false,groups:[]};
    }
    async summaries(batch:{roomId:string;messageIds:string[]}) {
      calls.push('batch');
      return {roomId:batch.roomId,items:batch.messageIds.map(messageId=>({
        roomId:batch.roomId,messageId,observedAt:100,partial:true,unknown:false,groups:[],
      }))};
    }
  }
  const f=await fixture(0,0,{reactionAdapter:ReactionAdapter}),roomId='loaded-without-read-dates';
  try {
    f.request({type:'reactions',id:101,batch:{roomId,messageIds:['loaded-message']}});
    f.request({type:'reaction',id:102,command:{roomId,messageId:'loaded-message',action:'summary'}});
    await f.clock.advance(0);
    assert.ok(f.packets.find(packet=>packet.value.type==='reactions' && packet.value.id===101)?.value.result,
      'absence from bounded unread/date metadata cannot defer an exact reaction read until periodic reconciliation');
    assert.ok(f.packets.find(packet=>packet.value.type==='reaction' && packet.value.id===102)?.value.result);
    f.request({type:'reaction',id:103,command:{roomId,messageId:'loaded-message',action:'add',reaction:'heart'}});
    await f.clock.advance(0);
    assert.equal(f.packets.find(packet=>packet.value.id===103)?.value.failed,true);
    assert.deepEqual(calls,['batch','summary'],'no write or whole-room refresh is smuggled into read admission');
    assert.equal(f.calls.length,2,'only the two original startup metadata reads ran');
    assert.equal(f.receipts(),0);assert.equal(f.registrations(),1);
  } finally {f.stop();await f.clock.advance(0);}
});
test('production worker forwards completed observations before the held batch result, with no extra reads or registration',async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  class Adapter {
    mutating(){return false;}
    async summaries(batch:{roomId:string;messageIds:string[]},progress?:(item:unknown)=>void){
      const items=batch.messageIds.map(messageId=>({roomId:batch.roomId,messageId,observedAt:100,partial:true,unknown:false,groups:[]}));
      progress?.(items[0]);await gate;progress?.(items[1]);return {roomId:batch.roomId,items};
    }
  }
  const f=await fixture(0,0,{reactionAdapter:Adapter});
  try{
    f.request({type:'reactions',id:301,batch:{roomId:'fair-0',messageIds:['first','second']},progressive:true});
    await f.clock.advance(0);
    assert.equal(f.packets.filter(p=>p.value.type==='reaction-progress').length,1);
    assert.equal(f.packets.some(p=>p.value.type==='reactions'),false,'progress is not completion');
    release();await f.clock.advance(0);
    assert.deepEqual(f.packets.filter(p=>p.value.id===301).map(p=>p.value.type),['reaction-progress','reaction-progress','reactions']);
    f.request({type:'reactions',id:302,batch:{roomId:'fair-0',messageIds:['first','second']}});
    await f.clock.advance(0);
    assert.deepEqual(f.packets.filter(p=>p.value.id===302).map(p=>p.value.type),['reactions'],'legacy parents receive no new private IPC packet type');
    assert.equal(f.calls.length,2);assert.equal(f.registrations(),1);assert.equal(f.receipts(),0);
  }finally{release();f.stop();await f.clock.advance(0);}
});

test('overdue full reconciliation preempts slow event lookups and recovers overflow despite 600 seconds of sustained events', async t => {
  const lookupDelay = 5000, fullDelay = 3000;
  const f = await fixture(lookupDelay, fullDelay), start = f.clock.now;
  const initialHealth = f.packets.filter(packet => packet.value.type === 'health').map(packet => packet.value.status);
  const dropped = f.items[64]!;
  dropped.lastSeenActivityDate = dropped.lastActivityDate;
  f.burst(true); // the 65th distinct ID exceeds the bounded pending set
  for (let at = 1000; at <= 600_000; at += 1000) f.clock.setTimeout(() => f.burst(), at);
  await f.clock.advance(600_000);

  assert.equal(f.exited(), undefined); assert.equal(f.maxActive(), 1);
  assert.equal(f.calls.filter(call => call.id === dropped.id).length, 0, 'the overflowed room is never reintroduced by a later event');
  const full = f.calls.filter(call => call.kind === 'full');
  assert.ok(full.length >= 10, 'sustained room lookups cannot indefinitely postpone periodic full fetches');
  const delays = full.slice(2).map((call, index) => call.start - full[index + 1]!.end! - 60_000);
  assert.ok(delays.every(delay => delay >= 0 && delay <= lookupDelay), 'every overdue full fetch starts by the end of the current lookup, not another batch or 60-second period');
  const recovered = f.packets.find(packet => packet.value.type === 'snapshot'
    && packet.value.rooms.some((room: protocol.RoomReadStatus) => room.id === dropped.id && room.lastSeen === dropped.lastActivityDate));
  assert.ok(recovered, 'a full snapshot recovers the dropped room');
  assert.ok(recovered.at - start <= 60_000 + lookupDelay + fullDelay, 'recovery is bounded by period + one lookup + one full fetch');
  assert.deepEqual(f.packets.filter(packet => packet.value.type === 'health').map(packet => packet.value.status), initialHealth, 'no repeated live health as a substitute for authoritative reconciliation');
  assert.equal(f.packets.filter(packet => packet.value.type === 'failed').length, 0);
  t.diagnostic(`600s virtual sustained load: ${full.length - 2} periodic full fetches, max scheduling delay ${Math.max(...delays)}ms, overflow recovery after ${recovered.at - start}ms; native metadata concurrency=1.`);
});

test('queued rooms remain deduplicated while an earlier lookup is active; only that active room gets one dirty follow-up', async t => {
  const f = await fixture(100, 0); f.burst(); await f.clock.advance(25);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 1);
  for (let repeat = 0; repeat < 128; repeat++) f.burst();
  await f.clock.advance(20_000);
  const reads = f.calls.filter(call => call.kind === 'room');
  assert.equal(reads.length, 65, '8192 repeated events need 64 original reads plus one in-flight dirty follow-up, not another whole batch');
  assert.equal(reads.filter(call => call.id === 'fair-0').length, 2);
  assert.equal(reads.at(-1)!.id, 'fair-0', 'dirty follow-up waits behind the original queued peers');
  assert.ok(f.items.slice(1, 64).every(item => reads.filter(call => call.id === item.id).length === 1));
  assert.equal(f.maxActive(), 1); assert.equal(f.registrations(), 1); assert.equal(f.receipts(), 0);
  t.diagnostic(`8192 repeated queued/in-flight events: ${reads.length} room lookups; max metadata native concurrency=${f.maxActive()}.`);
});

test('repeating an event for a room waiting later in the batch creates no follow-up lookup', async () => {
  const f = await fixture(100, 0); f.burst(); await f.clock.advance(25);
  for (let repeat = 0; repeat < 1000; repeat++) f.roomEvent('fair-63');
  await f.clock.advance(20_000);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 64);
  assert.equal(f.calls.filter(call => call.id === 'fair-63').length, 1);
});

test('a saturated queue cannot lose an active room dirty hint or publish only its admission-time result', async () => {
  const f = await fixture(100, 0, { captureAtAdmission: true });
  f.roomEvent('fair-0'); await f.clock.advance(25);
  for (const item of f.items.slice(1)) f.roomEvent(item.id);
  f.items[0]!.lastSeenActivityDate = f.items[0]!.lastActivityDate;
  for (let repeat = 0; repeat < 1000; repeat++) f.roomEvent('fair-0');
  await f.clock.advance(20_000);
  const latest = f.packets.filter(packet => packet.value.type === 'snapshot').at(-1)!.value.rooms.find((room: protocol.RoomReadStatus) => room.id === 'fair-0');
  assert.equal(latest.lastSeen, f.items[0]!.lastSeenActivityDate, 'new activity received during the native request requires a fresh result');
  assert.equal(f.calls.filter(call => call.id === 'fair-0').length, 2);
  assert.equal(f.calls.filter(call => call.kind === 'full').length, 2, 'recovery did not wait for the periodic fetch');
  assert.ok(f.queued() + f.active() <= 64);
  assert.equal(f.calls.filter(call => call.id === 'fair-64').length, 0, 'unadmitted overflow still belongs to periodic full reconciliation');
});

test('room dirtiness reserves bounded admission including receipt-completion metadata without replaying the receipt', async () => {
  const f = await fixture(100, 0, { receiptDelay: 1000 });
  f.roomEvent('fair-0'); await f.clock.advance(25);
  for (let i = 1; i < 2000; i++) f.roomEvent(`new-${i}`);
  assert.ok(f.queued() + f.active() <= 64, 'the active room is included in the bound');
  f.read(1, 'fair-0'); f.read(2, 'fair-0');
  await f.clock.advance(1000);
  assert.equal(f.receipts(), 1);
  assert.deepEqual(f.packets.filter(packet => packet.value.type === 'read').map(packet => [packet.value.id, packet.value.ok]), [[2, false], [1, true]]);
  assert.ok(f.queued() + f.active() <= 64);
  f.stop(); await f.clock.advance(0); assert.equal(f.registrations(), 1);
});

test('receipt completion at metadata capacity stays one-shot and its unadmitted observation is recovered by the priority full refresh', async () => {
  const f = await fixture(100, 0, { receiptDelay: 0 }); f.burst(); await f.clock.advance(25);
  f.items[64]!.lastSeenActivityDate = f.items[64]!.lastActivityDate;
  f.read(1, 'fair-64'); await f.clock.advance(0);
  assert.equal(f.receipts(), 1);
  assert.deepEqual(f.packets.filter(packet => packet.value.type === 'read').map(packet => [packet.value.id, packet.value.ok]), [[1, true]]);
  assert.ok(f.queued() + f.active() <= 64, 'receipt metadata does not bypass the reconciliation bound');
  await f.clock.advance(60_000);
  const latest = f.packets.filter(packet => packet.value.type === 'snapshot').at(-1)!.value.rooms.find((room: protocol.RoomReadStatus) => room.id === 'fair-64');
  assert.equal(latest.lastSeen, f.items[64]!.lastSeenActivityDate);
  assert.equal(f.calls.filter(call => call.id === 'fair-64').length, 0);
  assert.equal(f.calls.filter(call => call.kind === 'full').length, 3);
  assert.equal(f.receipts(), 1); assert.equal(f.registrations(), 1); assert.equal(f.maxActive(), 1);
});

test('an active dirty room still loses native admission at its fatal deadline, not by launching a replacement', async () => {
  const f = await fixture(30_001, 0, { captureAtAdmission: true });
  f.roomEvent('fair-0'); await f.clock.advance(25);
  for (let repeat = 0; repeat < 1000; repeat++) f.roomEvent('fair-0');
  f.roomEvent('fair-1'); await f.clock.advance(31_000);
  assert.equal(f.exited(), 0); assert.equal(f.maxActive(), 1);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 1);
  assert.deepEqual(f.packets.filter(packet => packet.value.type === 'failed').map(packet => packet.value.reason), ['sdk-error']);
  assert.equal(f.receipts(), 0); assert.equal(f.registrations(), 1);
});

test('settled lookup failures do not invent dirtiness or retry; a later real event can recover the room', async () => {
  const f = await fixture(100, 0);
  const original = f.items[0]!.lastSeenActivityDate;
  f.items[0]!.lastSeenActivityDate = 'invalid';
  f.roomEvent('fair-0'); await f.clock.advance(1000);
  assert.equal(f.calls.filter(call => call.id === 'fair-0').length, 1);
  assert.ok(f.packets.some(packet => packet.value.type === 'health' && packet.value.status === 'room-unavailable'));
  f.items[0]!.lastSeenActivityDate = original;
  f.roomEvent('fair-0'); await f.clock.advance(1000);
  assert.equal(f.calls.filter(call => call.id === 'fair-0').length, 2);
  assert.ok(f.packets.filter(packet => packet.value.type === 'snapshot').at(-1)!.value.rooms.some((room: protocol.RoomReadStatus) => room.id === 'fair-0'));
  assert.equal(f.exited(), undefined); assert.equal(f.receipts(), 0);
});

const person = (id: string, region = 'us') => Buffer.from(`ciscospark://${region}/PEOPLE/${id}`).toString('base64url');
const seen = (roomId: string, self: string, actor: string) => ({ resource: 'memberships', event: 'seen', createdBy: self, actorId: actor,
  data: { roomId, personId: actor } });
test('only confidently non-self public membership seen events skip reconciliation', async () => {
  const f = await fixture(0, 0), self = person('self'), other = person('other'); f.setSelf(self);
  for (let repeat = 0; repeat < 1000; repeat++) f.membershipEvent(seen('fair-0', self, other));
  await f.clock.advance(50);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 0);
  assert.equal(f.registrations(), 1); assert.equal(f.receipts(), 0);
});
test('production seen events coalesce into room-only reader hints without unread lookups, receipts or another SDK',async()=>{
  const f=await fixture(0,0),self=person('self'),other=person('other');f.setSelf(self);
  const event={...seen('fair-0',self,other),data:{roomId:'fair-0',personId:other,lastSeenId:'message',
    personDisplayName:'PRIVATE',personEmail:'PRIVATE'}};
  try {
    for(let i=0;i<1000;i++) f.membershipEvent(event);
    await f.clock.advance(24);
    assert.equal(f.packets.filter(p=>p.value.type==='changes').length,0);
    await f.clock.advance(1);
    assert.deepEqual(f.packets.filter(p=>p.value.type==='changes').map(p=>p.value.changes),
      [[{kind:'readers-changed',roomId:'fair-0'}]]);
    assert.equal(f.calls.length,2,'other people reading cannot trigger unread metadata fetches');
    await f.clock.advance(1000);
    assert.equal(f.packets.filter(p=>p.value.type==='changes').length,1,'no hint polling or replay');
    assert.equal(f.receipts(),0);assert.equal(f.registrations(),1);assert.equal(f.exited(),undefined);
    for(const patch of [{createdBy:other},{actorId:self},{data:{...event.data,lastSeenId:undefined}},
      {actorId:person('other','eu'),data:{...event.data,personId:person('other','eu')}}])
      assert.equal(protocol.parseReadChange({...event,...patch},self),undefined);
    assert.equal(protocol.validReadChange({kind:'readers-changed',roomId:'fair-0',personId:other}),false);
  } finally {f.stop();await f.clock.advance(0);}
});

test('self, absent, malformed, cross-namespace and contradictory actors remain covered, and non-seen membership/room changes are never filtered', async () => {
  const f = await fixture(0, 0), self = person('self'), other = person('other'); f.setSelf(self);
  const normal = seen('fair-0', self, other);
  const cases = [seen('fair-0', self, self), { data: { roomId: 'fair-0' } }, { ...normal, actorId: undefined },
    { ...normal, data: { ...normal.data, personId: self } }, { ...normal, createdBy: other },
    { ...normal, createdBy: undefined }, { ...normal, data: { ...normal.data, personId: undefined } },
    seen('fair-0', self, person('other', 'eu')), seen('fair-0', self, 'unverified-person'),
    seen('fair-0', self, Buffer.from('ciscospark://us/ROOM/other').toString('base64url')),
    seen('fair-0', self, other + '==='),
    seen('fair-0', self, person('SELF')), { ...normal, resource: 'other' }, { ...normal, event: 'other' }];
  for (const event of cases) {
    const before = f.calls.length; f.membershipEvent(event); await f.clock.advance(50);
    assert.equal(f.calls.length, before + 1, JSON.stringify(event));
  }
  for (const unknown of [undefined, 'unverified-self']) {
    f.setSelf(unknown); const before = f.calls.length;
    f.membershipEvent({ ...normal, createdBy: unknown }); await f.clock.advance(50);
    assert.equal(f.calls.length, before + 1, 'unknown self identity cannot filter an event');
  }
  f.setSelf(self);
  for (const kind of ['created', 'deleted']) { const before = f.calls.length; f.membershipEvent(normal, kind); await f.clock.advance(50); assert.equal(f.calls.length, before + 1); }
  const before = f.calls.length; f.roomUpdated(normal); await f.clock.advance(50); assert.equal(f.calls.length, before + 1);
  assert.equal(f.receipts(), 0); assert.equal(f.registrations(), 1);
});

test('a reconciliation due just after a nearly 30-second lookup starts runs before the rest of its batch', async () => {
  const lookupDelay = 29_999;
  const f = await fixture(lookupDelay, 0);
  f.clock.setTimeout(() => f.burst(true), 59_950);
  await f.clock.advance(60_000);
  assert.equal(f.calls.filter(call => call.kind === 'full').length, 2, 'the current native lookup remains in flight at the periodic deadline');
  await f.clock.advance(lookupDelay);
  const full = f.calls.filter(call => call.kind === 'full');
  assert.equal(full.length, 3, 'do not wait for all 64 slow lookups to finish');
  assert.ok(full[2]!.start <= 60_000 + lookupDelay);
  assert.ok(full[2]!.start >= 89_000, 'exercise almost the entire native-operation scheduling-delay bound');
  const previous = f.calls[f.calls.indexOf(full[2]!) - 1]!;
  assert.equal(previous.kind, 'room'); assert.equal(full[2]!.start, previous.end, 'no metadata batching timer delays overdue reconciliation');
  assert.equal(f.maxActive(), 1); assert.equal(f.exited(), undefined);
});

test('a lookup exceeding the 30-second native deadline loses admission instead of overlapping overdue reconciliation', async () => {
  const f = await fixture(30_001, 0);
  f.clock.setTimeout(() => f.burst(true), 59_950);
  await f.clock.advance(90_000);
  assert.equal(f.exited(), 0); assert.equal(f.maxActive(), 1);
  assert.equal(f.calls.filter(call => call.kind === 'full').length, 2);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 1);
  assert.deepEqual(f.packets.filter(packet => packet.value.type === 'failed').map(packet => packet.value.reason), ['sdk-error']);
});

test('unchanged event lookups produce no redundant snapshots; full observations still provide liveness', async () => {
  const f = await fixture(0, 0), snapshots = () => f.packets.filter(packet => packet.value.type === 'snapshot');
  assert.equal(snapshots().length, 2);
  f.burst(); await f.clock.advance(50);
  for (let turn = 0; turn < 64 && f.calls.filter(call => call.kind === 'room').length < 64; turn++) await f.clock.advance(0);
  assert.equal(f.calls.filter(call => call.kind === 'room').length, 64, 'B2 does not change native lookup admission (B3)');
  assert.equal(snapshots().length, 2);
  await f.clock.advance(60_000);
  assert.equal(snapshots().length, 3, 'a genuine periodic observation is not replaced by synthetic freshness');
});

test('actual worker holds one IPC send and one latest title projection under sustained metadata pressure', async () => {
  const f = await fixture(0, 0); f.holdIPC();
  const start = f.packets.length;
  for (let i = 0; i < 200; i++) {
    f.items[0]!.title = `Latest ${i}`; f.roomEvent(f.items[0]!.id); await f.clock.advance(50);
    assert.equal(f.ipcPending(), 1, 'IPC completion, not native lookup speed, admits the next send');
  }
  assert.equal(f.packets.length, start + 1);
  f.completeIPC(); assert.equal(f.packets.length, start + 2);
  assert.equal(f.packets.at(-1)!.value.rooms[0].title, 'Latest 199');
  f.completeIPC(); assert.equal(f.ipcPending(), 0); assert.equal(f.exited(), undefined);
});

test('actual worker flushes full message batches without silent overflow and orders fatal failure before exit', async () => {
  const f = await fixture(0, 0); f.holdIPC(); const start = f.packets.length;
  for (let i = 0; i < 200; i++) f.message(`burst-${i}`, i % 2 === 0);
  await f.clock.advance(25);
  assert.equal(f.packets.length, start + 1); assert.equal(f.ipcPending(), 1);
  f.invalidRequest(); await f.clock.advance(0);
  assert.equal(f.exited(), undefined, 'fatal teardown gives its accepted failure packet bounded IPC completion time');
  while (f.ipcPending()) f.completeIPC();
  await f.clock.advance(0);
  const packets = f.packets.slice(start).map(packet => packet.value), evidence = packets.filter(value => value.type === 'messages').flatMap(value => value.messages);
  assert.equal(evidence.length, 200);
  assert.deepEqual(evidence.map(value => value.id), Array.from({ length: 200 }, (_, i) => `burst-${i}`));
  assert.equal(evidence.filter(value => value.self).length, 100);
  assert.equal(packets.at(-1).type, 'failed'); assert.equal(f.exited(), 0);
});
