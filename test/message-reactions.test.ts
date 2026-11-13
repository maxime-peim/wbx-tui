import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageReactions } from '../src/message-reactions.js';
import { REACTIONS, reactionName, reactionLabel, ReactionReadError, validReactionReadFailure, validReactionCommand, validReactionSnapshot, validReactionBatch, reactionBatchMatches, type ReactionCommand } from '../src/reaction-contracts.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import type { ReadStatusSource } from '../src/read-status.js';

const target = { roomId:'room',messageId:'message' }, valid = () => true;
const snapshot = (command:ReactionCommand, groups:any[] = []) => ({ roomId:command.roomId,messageId:command.messageId,observedAt:100,partial:true,unknown:false,groups });
function fixture() {
  let time = 100, write:any = { status:'changed' }, groups:any[] = [];
  const calls:ReactionCommand[] = [];
  const controller = new MessageReactions(async c => { calls.push(c); return c.action === 'summary' ? snapshot(c,groups) : write; },()=>time);
  return { controller,calls,setTime:(t:number)=>{ time=t; },setWrite:(v:unknown)=>{ write=v; },setGroups:(v:any[])=>{ groups=v; } };
}
test('reaction contracts are closed, explicit, bounded and never infer a zero', () => {
  assert.equal(validReactionReadFailure('parent:denied'),true);
  assert.equal(validReactionReadFailure('admission:denied'),true);
  assert.equal(validReactionReadFailure('context:unverified'),true);
  for (const v of ['parent:denied:PRIVATE','PRIVATE','parent:http://private.invalid','worker:PRIVATE',{}]) assert.equal(validReactionReadFailure(v),false);
  assert.equal(validReactionSnapshot(snapshot({ ...target,action:'summary' })),true);
  assert.equal(validReactionSnapshot(snapshot({ ...target,action:'summary' },[{reaction:'heart',label:'Heart',mine:true,count:3}])),true);
  for (const patch of [{ partial:0 },{ groups:[{ reaction:'unknown',label:'Unknown' }] },{ groups:[{ reaction:'heart',label:'Forged' }] },
    { groups:[{ reaction:'heart',label:'Heart',count:-1 }] },{ groups:[{reaction:'heart',label:'Heart',mine:'yes'}] },{ secret:'PRIVATE' }])
    assert.equal(validReactionSnapshot({ ...snapshot({ ...target,action:'summary' }),...patch }),false);
  assert.equal(validReactionCommand({ ...target,action:'remove',reaction:'heart',own:'a'.repeat(32) }),true);
  for (const patch of [{ action:'toggle' },{ action:'remove' },{ actor:'self' },{ reaction:'HEART' }])
    assert.equal(validReactionCommand({ ...target,action:'add',reaction:'heart',...patch }),false);
});
test('Unicode reaction sequences cross every contract without weakening labels, ownership or replay guards',async()=>{
  for (const reaction of ['🔥','👩🏽‍💻','🇫🇷','👍🏿','1️⃣','🏳️‍🌈','❤','☺']) {
    assert.ok(reactionName(reaction),reaction);
    assert.equal(reactionLabel(reaction),reaction);
    assert.ok(validReactionCommand({...target,action:'add',reaction}));
    assert.ok(validReactionSnapshot(snapshot({...target,action:'summary'},[{reaction,label:reaction,count:2}])));
    assert.equal(validReactionSnapshot(snapshot({...target,action:'summary'},[{reaction,label:'Forged'}])),false);
    const parsed=parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.reactionPrepare',
      params:{...target,action:'add',reaction,internalConsent:true}});
    assert.equal(parsed.method,'messages.reactionPrepare');
    if (parsed.method !== 'messages.reactionPrepare') throw new Error('Wrong operation');
    assert.equal(parsed.params.reaction,reaction);
    const f=fixture(),p=await f.controller.prepare('room','message','add',reaction,valid);
    assert.equal(p.label,reaction);
    await f.controller.submit(p.contextId,'unicode',valid);
    await f.controller.submit(p.contextId,'unicode',valid);
    assert.equal(f.calls.filter(c=>c.action==='add').length,1);
    await assert.rejects(f.controller.prepare('room','message','remove',reaction,valid),'Unicode display evidence is not ownership');
  }
  for (const reaction of ['','fire','hello','🔥🔥','a🔥','🔥\n','🔥\x1b','🔥\u202e','🏻','🇫','1','👩\u200d','__proto__','🔥'.repeat(65)]) {
    assert.equal(reactionName(reaction),false,JSON.stringify(reaction));
    assert.equal(validReactionCommand({...target,action:'add',reaction}),false);
  }
});
test('viewport reaction batches are bounded, correlated, loaded-target-only reads, not ownership or write authorization',async()=>{
  const batch={roomId:'room',messageIds:['a','b']};
  assert.ok(validReactionBatch(batch));
  for (const patch of [{messageIds:[]},{messageIds:['a','a']},{messageIds:Array.from({length:9},(_,i)=>'m'+i)},{actor:'foreign'}])
    assert.equal(validReactionBatch({...batch,...patch}),false);
  const items=batch.messageIds.map(messageId=>snapshot({roomId:'room',messageId,action:'summary'}));
  assert.ok(reactionBatchMatches({roomId:'room',items},batch));
  assert.equal(reactionBatchMatches({roomId:'room',items:[...items].reverse()},batch),false);
  const parse=(params:object)=>parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.reactionsBatch',params:params as Record<string,unknown>});
  assert.equal(parse({...batch,internalConsent:true}).method,'messages.reactionsBatch');
  assert.deepEqual(parse({...batch,internalConsent:true,progressive:true}).params,{...batch,internalConsent:true,progressive:true});
  for (const patch of [{internalConsent:false},{messageIds:['a','a']},{messageId:'foreign'},{action:'add'},{progressive:false},{progressive:1}])
    assert.throws(()=>parse({...batch,internalConsent:true,...patch}));
  const e=new EditorEngine();
  try {
    await e.start('demo');await e.select('demo-general');
    const messages=e.snapshot().messages.slice(0,2).map(message=>message.id), target={roomId:'demo-general',messageIds:messages};
    assert.ok(reactionBatchMatches(await e.reactionSummaries(target),target));
    await assert.rejects(e.reactionSummaries({...target,messageIds:[...messages,'unloaded']}));
    await assert.rejects(e.prepareReaction('demo-general',messages[0]!,'remove','heart'),'batch observations never mint removal ownership');
  } finally {e.stop();}
});
test('progressive controller observations do not settle admission, unlock writes or survive invalidation',async()=>{
  const batch={roomId:'room',messageIds:['first','second']},items=batch.messageIds.map(messageId=>snapshot({roomId:'room',messageId,action:'summary'}));
  let release!:()=>void,publish!:(value:any)=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),seen:any[]=[];
  const c=new MessageReactions(async()=>{throw new Error('No writes');},Date.now,async(_batch,progress)=>{
    publish=value=>progress?.(value);publish(items[0]);await gate;publish(items[1]);return {roomId:batch.roomId,items};
  });
  const pending=c.summaries(batch,valid,item=>seen.push(item));
  assert.equal(seen.length,1);assert.throws(()=>c.inspect('room','first'),'a displayed summary cannot unlock a pending batch');
  await assert.rejects(c.summary('room','first',valid),/worker:busy/);
  c.reset();publish(items[1]);assert.equal(seen.length,1,'late progress is dropped after source/context invalidation');
  release();await assert.rejects(pending,/context:unverified/);
  await assert.rejects(c.prepare('room','first','remove','heart',valid),'progress does not create inspection/removal authority');
  const malformed=new MessageReactions(async()=>({}),Date.now,async(_batch,progress)=>{
    progress?.({...items[0]!,messageId:'foreign'});return {roomId:batch.roomId,items};
  });
  await assert.rejects(malformed.summaries(batch,valid,()=>assert.fail('forged target dispatched')),/summary:unverified/);
});
test('initial reaction reads do not wait behind unrelated explicit metadata, but writes retain their admission guard',async()=>{
  const e=new EditorEngine();
  try {
    await e.start('demo');await e.select('demo-general');
    const room='demo-general',message=e.snapshot().messages[0]!.id;
    Object.assign(e,{featureAbort:new AbortController()});
    assert.ok(validReactionSnapshot(await e.reactionSummary(room,message)));
    const batch={roomId:room,messageIds:[message]};
    assert.ok(reactionBatchMatches(await e.reactionSummaries(batch),batch));
    await assert.rejects(e.prepareReaction(room,message,'add','heart'),/explicit operation/);
    await assert.rejects(e.send('blocked-send',room,'Do not queue this text'),/explicit message/);
  } finally {e.stop();}
});
test('actual engine preserves only the typed read failure category in its RPC-facing error',async t=>{
  const e=new EditorEngine();
  try {
    await e.start('demo'); await e.select('demo-general');
    const provider=e as unknown as { reactionProvider(command:ReactionCommand):Promise<unknown> };
    const mock=t.mock.method(provider,'reactionProvider',async()=>{ throw new ReactionReadError('parent:denied'); });
    const message=e.snapshot().messages[0]!.id;
    await assert.rejects(e.reactionSummary('demo-general',message),/Reaction summary unavailable \(parent:denied\)/);
    mock.mock.restore();
    t.mock.method(provider,'reactionProvider',async()=>{ throw new Error('PRIVATE server detail'); });
    await assert.rejects(e.reactionSummary('demo-general',message),error=>String(error).includes('summary:unavailable') && !String(error).includes('PRIVATE'));
  } finally { e.stop(); }
});
test('actual non-demo reaction admission distinguishes missing grant, worker, stale owner and invalid snapshot without I/O',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{ throw new Error('LIVE NETWORK FORBIDDEN'); });
  const calls:ReactionCommand[] = [];
  const source:ReadStatusSource = { onRooms() {},onFailure() {},async start() {},async markRead() { throw new Error('RECEIPT FORBIDDEN'); },close() {},
     async reaction(command) { calls.push(command); return snapshot(command); } };
  const e = new EditorEngine(undefined,()=>source);
  try {
    await e.start('demo'); await e.select('demo-general');
    const room = 'demo-general', message = e.snapshot().messages[0]!.id;
    // Exercise the real live provider/admission code with inert credentials and
    // a synthetic source, not a live connection or a replaced reactionProvider.
    const internal=e as unknown as { generation:number; startReadStatus(access:{token:string;scope:string;expiresAt:number},generation:number):Promise<void> };
    const access={token:'SYNTHETIC_NEVER_LIVE',scope:'spark:all',expiresAt:Date.now()+60_000};
    await internal.startReadStatus(access,internal.generation);
    Object.assign(e,{ mode:'live' });
    await assert.rejects(e.reactionSummary(room,message),/admission:denied/);
    for (const access of [
      { token:'SYNTHETIC_NEVER_LIVE',expiresAt:Date.now()-1,grantedScope:'spark:all' },
      { token:'SYNTHETIC_NEVER_LIVE',expiresAt:Date.now()+60_000,grantedScope:'spark:messages_read' },
    ]) {
      Object.assign(e,access);
      await assert.rejects(e.reactionSummary(room,message),/admission:denied/);
    }
    assert.equal(calls.length,0,'a missing/expired grant never reaches the source');
    Object.assign(e,{ token:'SYNTHETIC_NEVER_LIVE',expiresAt:Date.now()+60_000,grantedScope:'spark:all' });
    source.reaction = undefined;
    await assert.rejects(e.reactionSummary(room,message),/worker:unavailable/);
    assert.equal(calls.length,0);
    source.reaction = async command=>{ calls.push(command); return { ...snapshot(command),messageId:'foreign' }; };
    await assert.rejects(e.reactionSummary(room,message),/summary:unverified/);
    assert.equal(calls.length,1);
    source.reaction = async command=>{ calls.push(command); source.onFailure('worker-exit'); return snapshot(command); };
    await assert.rejects(e.reactionSummary(room,message),/context:unverified/);
    assert.equal(calls.length,2,'invalidated observations are never retried');
  } finally { e.stop(); }
});
test('new targets need no inspection; preparation is read-only and exact request replays never write twice', async () => {
  const f = fixture(), c = f.controller;
  const p = await c.prepare('room','message','add','heart',valid);
  assert.deepEqual(f.calls.map(command=>command.action),['summary'],'normal preparation verifies the target without writing or inspection');
  assert.deepEqual(c.target(p.contextId,'r'),target);
  const result = await c.submit(p.contextId,'r',valid);
  assert.equal(result.status,'changed'); assert.deepEqual(await c.submit(p.contextId,'r',valid),result);
  await assert.rejects(c.submit('b'.repeat(32),'r',valid),/Conflicting/);
  assert.equal(f.calls.filter(c=>c.action !== 'summary').length,1);
});
test('a confirmed Add adjusts the last known count without inventing handles or newer sibling timestamps',async()=>{
  const f=fixture(),c=f.controller,seen:any[]=[];
  f.setGroups([{reaction:'heart',label:'Heart',count:3},{reaction:'thumbsup',label:'Thumbs up',count:4}]);
  const p=await c.prepare('room','message','add','heart',valid);
  f.setTime(5100);
  assert.equal((await c.submit(p.contextId,'add',valid,value=>seen.push(value))).status,'changed');
  assert.equal(seen.length,1);
  assert.equal(seen[0].observedAt,100,'the write ACK cannot freshen observations of other reactions');
  assert.deepEqual(seen[0].groups,[{reaction:'thumbsup',label:'Thumbs up',count:4},{reaction:'heart',label:'Heart',mine:true,count:4}]);
  assert.ok(seen[0].partial && seen[0].unknown);
  await c.submit(p.contextId,'add',valid,value=>seen.push(value));
  assert.equal(seen.length,1,'replaying a historical ACK cannot refresh or overwrite the cache');
  f.setTime(100);
  f.setGroups([{reaction:'heart',label:'Heart',count:3,own:'a'.repeat(32)}]);
  const remove=await c.prepare('room','message','remove','heart',valid);
  await c.submit(remove.contextId,'remove',valid,value=>seen.push(value));
  assert.deepEqual(seen[1].groups,[{reaction:'heart',label:'Heart'}],'removing mine retains an observed shared label without guessing its new total');
});
test('Add preserves unknown counts and already-owned totals, and never overflows a safe count',async()=>{
  for (const [group,count] of [
    [{reaction:'heart',label:'Heart',count:4,mine:true},4],
    [{reaction:'heart',label:'Heart'},undefined],
    [{reaction:'heart',label:'Heart',count:0},1],
    [{reaction:'heart',label:'Heart',count:Number.MAX_SAFE_INTEGER},undefined],
  ] as const) {
    const f=fixture(),seen:any[]=[];
    f.setGroups([group]);
    const prepared=await f.controller.prepare('room','message','add','heart',valid);
    await f.controller.submit(prepared.contextId,'add',valid,value=>seen.push(value));
    const changed=seen[0].groups[0];
    assert.equal(changed.count,count); assert.equal(changed.mine,true); assert.equal(changed.own,undefined);
    assert.equal(validReactionSnapshot(seen[0]),true);
  }
});
test('failed or uncertain writes never update the confirmed cache; cache failure cannot turn a verified ACK into uncertainty',async()=>{
  for (const status of ['failed','unknown']) {
    const f=fixture();f.setWrite({status});
    const p=await f.controller.prepare('room','message','add','heart',valid);
    assert.equal((await f.controller.submit(p.contextId,'write',valid,()=>assert.fail('unconfirmed cache update'))).status,status);
  }
  const f=fixture(),p=await f.controller.prepare('room','message','add','heart',valid);
  assert.equal((await f.controller.submit(p.contextId,'write',valid,()=>{throw new Error('Cache unavailable');})).status,'changed');
  assert.equal(f.calls.filter(c=>c.action==='add').length,1);
});
test('unknown outcomes survive reset; summary cannot resolve; inspection must correlate to the exact pending request', async () => {
  const f = fixture(), c = f.controller; c.inspect('room','message'); f.setWrite({ status:'unknown' });
  const p = await c.prepare('room','message','add','heart',valid);
  assert.equal((await c.submit(p.contextId,'uncertain',valid)).status,'unknown');
  c.reset(); await c.summary('room','message',valid);
  assert.throws(()=>c.inspect('room','message'),/unavailable/);
  assert.throws(()=>c.inspect('room','message','different'),/unavailable/);
  c.inspect('room','other','uncertain');
  await assert.rejects(c.prepare('room','message','add','heart',valid),/Inspect/);
  c.inspect('room','message','uncertain');
  assert.equal((await c.submit(p.contextId,'uncertain',valid)).status,'unknown','resolution never rewrites a historical result');
  assert.equal(f.calls.filter(c=>c.action === 'add').length,1);
  await c.prepare('room','message','add','heart',valid);
});
test('reset revokes preparations even if a summary resolves after source replacement', async () => {
  let release!:(v:unknown)=>void;
  const c = new MessageReactions(command=>new Promise(resolve=>{ release=resolve; }),()=>100);
  c.inspect('room','message');
  const p = c.prepare('room','message','add','heart',valid);
  c.reset(); release(snapshot({ ...target,action:'summary' }));
  await assert.rejects(p);
});
test('a fresh caller validity fence cannot revive an invalidated preparation owner',async()=>{
  const f=fixture(),c=f.controller; let original=true;
  c.inspect('room','message');
  const p=await c.prepare('room','message','add','heart',()=>original);
  original=false;
  await assert.rejects(c.submit(p.contextId,'new-view',valid));
  assert.equal(f.calls.filter(c=>c.action === 'add').length,0);
});
test('passive reaction reads do not claim explicit mutation/send admission',async()=>{
  let release!:(v:unknown)=>void;
  const c=new MessageReactions(()=>new Promise(resolve=>{ release=resolve; }),()=>100);
  const pending=c.summary('room','message',valid);
  assert.equal(c.busy(),false,'a summary must not reject an unrelated explicit send');
  release(snapshot({ ...target,action:'summary' }));
  await pending;
});
test('summary racing a held mutation is refused once; only a later explicit read observes completion',async()=>{
  let release!:(v:unknown)=>void;
  const calls:ReactionCommand[] = [];
  const c = new MessageReactions(command=>{
    calls.push(command);
    return command.action === 'summary' ? Promise.resolve(snapshot(command))
      : new Promise(resolve=>{ release=resolve; });
  },()=>100);
  c.inspect('room','message');
  const prepared = await c.prepare('room','message','add','heart',valid);
  const pending = c.submit(prepared.contextId,'held',valid);
  assert.equal(c.busy(),true);
  await assert.rejects(c.summary('room','message',valid),/worker:busy/);
  assert.deepEqual(calls.map(command=>command.action),['summary','add'],'refused reads never enter the provider or retry the write');
  release({ status:'changed' });
  assert.equal((await pending).status,'changed');
  assert.equal(c.busy(),false);
  await c.summary('room','message',valid);
  assert.deepEqual(calls.map(command=>command.action),['summary','add','summary']);
});
test('only a fresh verified own handle can remove; add is explicit and not an own toggle', async () => {
  const f = fixture(), c = f.controller; c.inspect('room','message');
  await assert.rejects(c.prepare('room','message','remove','heart',valid));
  f.setGroups([{reaction:'heart',label:'Heart',mine:true,count:3}]);
  await assert.rejects(c.prepare('room','message','remove','heart',valid),'display-only mine evidence cannot become removal authority');
  f.setGroups([{ reaction:'heart',label:'Heart',own:'c'.repeat(32) }]);
  await assert.rejects(c.prepare('room','message','add','heart',valid));
  const p = await c.prepare('room','message','remove','heart',valid);
  await c.submit(p.contextId,'remove',valid);
  assert.equal(f.calls.at(-1)!.own,'c'.repeat(32));
  const stale = await c.prepare('room','message','remove','heart',valid);
  f.setTime(30_100); await assert.rejects(c.submit(stale.contextId,'stale',valid));
});
test('admitted loss, invalid ACK and changed owner remain unknown; invalid targets admit nothing', async () => {
  for (const response of [{ status:'changed',body:'PRIVATE' },null,{ status:'unknown' }]) {
    const f = fixture(), c = f.controller; c.inspect('room','message'); f.setWrite(response);
    const p = await c.prepare('room','message','add','heart',valid);
    assert.equal((await c.submit(p.contextId,'r',valid)).status,'unknown');
    assert.throws(()=>c.inspect('room','message'));
  }
  const f = fixture(), c = f.controller; c.inspect('room','message');
  const p = await c.prepare('room','message','add','heart',valid);
  await assert.rejects(c.submit(p.contextId,'never',()=>false)); assert.equal(f.calls.length,1);
  c.discard(p.contextId); assert.equal(c.target(p.contextId,'never'),undefined);
});
test('reaction ledger saturation refuses further writes without evicting unknowns or replay records', async () => {
  const f = fixture(), c = f.controller; c.inspect('room','message');
  for (let i=0;i<256;i++) {
    const p = await c.prepare('room','message','add','heart',valid);
    assert.equal((await c.submit(p.contextId,'r'+i,valid)).status,'changed');
  }
  const p = await c.prepare('room','message','add','heart',valid);
  await assert.rejects(c.submit(p.contextId,'overflow',valid));
  assert.equal(f.calls.filter(c=>c.action === 'add').length,256);
});
test('reaction RPC requires explicit internal consent and rejects foreign actors, handles, toggles and unknown parameters', () => {
  const parse = (method:string,params:Record<string,unknown>)=>parseEditorOperation({ jsonrpc:'2.0',id:1,method,params });
  const p = { ...target,internalConsent:true,reaction:'heart',action:'add' };
  assert.equal(parse('messages.reactionPrepare',p).method,'messages.reactionPrepare');
  for (const patch of [{ internalConsent:false },{ action:'toggle' },{ reaction:'😀text' },{ own:'foreign' },{ actorId:'self' },{ uri:'https://invalid' }])
    assert.throws(()=>parse('messages.reactionPrepare',{ ...p,...patch }));
  assert.throws(()=>parse('messages.reactionSubmit',{ ...target,internalConsent:true,contextId:'a'.repeat(32),requestId:'r' }));
  assert.throws(()=>parse('messages.reactionResolve',{ ...target,internalConsent:true,checked:false }));
});
test('actual demo engine reactions preserve message content/identity and never publish delivery/read status', async t => {
  t.mock.method(globalThis,'fetch',async()=>{ throw new Error('LIVE NETWORK FORBIDDEN'); });
  const e = new EditorEngine(), deliveries:unknown[] = []; e.on('delivery',v=>deliveries.push(v));
  try {
    await e.start('demo'); await e.select('demo-general');
    const before = e.snapshot().messages, message = before[0]!.id, room = 'demo-general';
    await assert.rejects(e.prepareMessageAction(room,message,'delete'),'other people remain not editable');
    const p = await e.prepareReaction(room,message,'add','heart');
    await assert.rejects(e.submitReaction(p.contextId,'foreign',room,before[1]!.id),/frozen/);
    assert.equal((await e.submitReaction(p.contextId,'r',room,message)).status,'changed');
    const summary = await e.reactionSummary(room,message);
    assert.equal(summary.groups[0]!.count,1); assert.equal(summary.partial,false);
    const r = await e.prepareReaction(room,message,'remove','heart');
    assert.equal((await e.submitReaction(r.contextId,'remove',room,message)).status,'changed');
    assert.equal((await e.reactionSummary(room,message)).groups.length,0);
    assert.deepEqual(e.snapshot().messages,before); assert.equal(deliveries.length,0);
    const old = await e.prepareReaction(room,message,'add','smiley'); e.stop();
    await e.start('demo'); await e.select(room);
    await assert.rejects(e.submitReaction(old.contextId,'stale',room,message));
    const departed=await e.prepareReaction(room,message,'add','smiley');
    await e.select('demo-engineering'); await e.select(room);
    await assert.rejects(e.submitReaction(departed.contextId,'returned',room,message),'returning to same room cannot revive a preparation');
  } finally { e.stop(); }
});
test('ordinary preparation needs no inspection and retains SDK read failures and missing-own diagnostics',async t=>{
  const e=new EditorEngine();
  try {
    await e.start('demo');await e.select('demo-general');
    const room='demo-general',message=e.snapshot().messages[0]!.id;
    const provider=e as unknown as {reactionProvider(command:ReactionCommand):Promise<unknown>};
    const mock=t.mock.method(provider,'reactionProvider',async()=>{throw new ReactionReadError('parent:denied');});
    await assert.rejects(e.prepareReaction(room,message,'add','heart'),/Reaction summary unavailable \(parent:denied\)/);
    mock.mock.restore();
    await assert.rejects(e.prepareReaction(room,message,'remove','heart'),/Removal requires fresh verified ownership/);
    assert.equal((await e.reactionSummary(room,message)).groups.length,0,'none of these preparation paths writes a reaction');
  }finally{e.stop();}
});
test('actual editor RPC dispatches reaction read/inspect/prepare/submit/discard without a 33rd capability', async () => {
  const out:any[] = [], engine = new EditorEngine(), rpc = new EditorRPC(engine,new EditorMeetings(),v=>{ out.push(v); });
  let id = 0;
  async function call(method:string,params:Record<string,unknown>) {
    const key = ++id; await rpc.receive(JSON.stringify({ jsonrpc:'2.0',id:key,method,params }));
    const response = out.find(v=>v.id===key); assert.ok(response); return response;
  }
  try {
    const hello = (await call('hello',{ version:1 })).result;
    assert.equal(hello.capabilities.length,32); assert.deepEqual(hello.messageReactions,['pinned-internal-v1','viewport-batch-v1','self-summary-v1','progressive-v1','actor-details-v1']);
    await call('session.start',{ mode:'demo' }); await call('rooms.select',{ roomId:'demo-general' });
    const t = { roomId:'demo-general',messageId:engine.snapshot().messages[0]!.id,internalConsent:true };
    assert.ok((await call('messages.reactions',t)).result);
    assert.equal((await call('messages.reactionResolve',{ ...t,checked:true })).result,null);
    const p = (await call('messages.reactionPrepare',{ ...t,action:'add',reaction:'heart' })).result;
    const response = await call('messages.reactionSubmit',{ ...t,contextId:p.contextId,requestId:'rpc',confirmed:true });
    assert.equal(response.result.status,'changed');
    const internals=engine as unknown as {reactionProvider(command:ReactionCommand):Promise<unknown>};
    const original=internals.reactionProvider.bind(engine);
    internals.reactionProvider=async command=>command.action==='summary' ? original(command) : {status:'unknown'};
    const next=(await call('messages.reactionPrepare',{...t,action:'add',reaction:'smiley'})).result;
    assert.equal((await call('messages.reactionSubmit',{...t,contextId:next.contextId,requestId:'uncertain',confirmed:true})).result.status,'unknown');
    assert.match((await call('messages.reactionPrepare',{...t,action:'add',reaction:'celebrate'})).error.message,/Reaction outcome unresolved\./);
    assert.equal((await call('messages.reactionDiscard',{ contextId:p.contextId })).result,null);
  } finally { await rpc.close(); }
});
test('self-summary presentation is opt-in on RPC; legacy clients retain the original closed group shape', async t => {
  const out:any[] = [], engine = new EditorEngine(), rpc = new EditorRPC(engine,new EditorMeetings(),v=>{ out.push(v); });
  let id=0;
  const call=async(method:string,params:Record<string,unknown>)=>{
    const key=++id; await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:key,method,params}));
    const response=out.find(v=>v.id===key); assert.ok(response && !response.error,JSON.stringify(response)); return response.result;
  };
  try {
    await call('hello',{version:1}); await call('session.start',{mode:'demo'}); await call('rooms.select',{roomId:'demo-general'});
    const target={roomId:'demo-general',messageId:engine.snapshot().messages[0]!.id,internalConsent:true};
    const groups=[{reaction:'heart' as const,label:'Heart',count:3,mine:true as const}];
    const provider=engine as unknown as {reactionProvider(command:ReactionCommand):Promise<unknown>;reactionBatchProvider(batch:{roomId:string;messageIds:string[]}):Promise<unknown>};
    t.mock.method(provider,'reactionProvider',async (command:ReactionCommand)=>snapshot(command,groups));
    t.mock.method(provider,'reactionBatchProvider',async (batch:{roomId:string;messageIds:string[]})=>({roomId:batch.roomId,items:batch.messageIds.map(messageId=>snapshot({roomId:batch.roomId,messageId,action:'summary'},groups))}));
    for (const method of ['messages.reactions','messages.reactionsBatch']) for (const optIn of [false,true]) {
      const params=method.endsWith('Batch') ? {roomId:target.roomId,messageIds:[target.messageId],internalConsent:true} : target;
      const result=await call(method,{...params,...(optIn ? {selfSummary:true} : {})});
      const group=(method.endsWith('Batch') ? result.items[0] : result).groups[0];
      assert.equal(group.count,3); assert.equal(group.mine,optIn ? true : undefined);
      assert.equal(group.own,undefined,'presentation cannot mint removal authority');
    }
    assert.equal(groups[0]!.mine,true,'legacy response shaping cannot mutate the provider snapshot');
    for (const selfSummary of [false,1,'true',{}]) assert.throws(()=>parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.reactions',params:{...target,selfSummary}}));
  } finally { await rpc.close(); }
});
