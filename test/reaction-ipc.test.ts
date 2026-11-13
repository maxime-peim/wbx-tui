import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { ReadStatusWorker } from '../src/read-status.js';
import { validReadStatusRequest } from '../src/read-status-protocol.js';
import { ReactionReadError, reactionBatchMatches, type ReactionSnapshot } from '../src/reaction-contracts.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
const worker=fileURLToPath(new URL('read-status-worker-fixture.mjs',import.meta.url));
const command={ roomId:'room-1',messageId:'message',action:'summary' as const };
test('actor details traverse private IPC and opt-in RPC only; legacy and mismatched packets fail closed',async()=>{
  const s=new ReadStatusWorker(worker,2000),e=new EditorEngine(undefined,()=>s),out:any[]=[];
  const rpc=new EditorRPC(e,new EditorMeetings(),value=>{out.push(value);});
  try {
    await e.start('demo');await e.select('demo-general');
    const internal=e as any;
    await internal.startReadStatus({token:'synthetic',scope:'spark:all',expiresAt:Date.now()+60000},internal.generation);
    Object.assign(e,{mode:'live',token:'SYNTHETIC',expiresAt:Date.now()+60000,grantedScope:'spark:all'});
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:1,method:'hello',params:{version:1}}));
    const params={roomId:'demo-general',messageId:e.snapshot().messages[0]!.id,internalConsent:true};
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:2,method:'messages.reactions',params:{...params,details:true}}));
    assert.equal(out.find(v=>v.id===2).result.actors[0].name,'Disclosed name');
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:3,method:'messages.reactions',params}));
    assert.equal('actors' in out.find(v=>v.id===3).result,false);
  } finally {await close(s);await rpc.close();}
  for (const mode of ['reaction-details-foreign','reaction-details-unsolicited']) {
    const source=new ReadStatusWorker(worker,2000),failures:unknown[]=[];
    source.onFailure=reason=>failures.push(reason);
    try {
      await source.start({token:mode,scope:'spark:all',expiresAt:Date.now()+60000});
      await assert.rejects(source.reaction({...command,...(mode.endsWith('foreign')?{details:true as const}:{})}));
      assert.deepEqual(failures,['invalid-data']);
    } finally {await close(source);}
  }
});
async function close(s:ReadStatusWorker) {
  const child=(s as unknown as { child:ChildProcess }).child;
  const exited=child && child.exitCode === null && child.signalCode === null ? once(child,'exit') : undefined;
  s.close(); await exited;
}
test('private reaction IPC stays closed and typed; actor/recipient/endpoint/reaction-ID tunnels are rejected',()=>{
  assert.equal(validReadStatusRequest({ type:'reaction',id:1,command }),true);
  for (const patch of [{ actor:'self' },{ recipient:'other' },{ url:'https://invalid' },{ own:'raw-activity' }])
    assert.equal(validReadStatusRequest({ type:'reaction',id:1,command:{ ...command,...patch } }),false);
  assert.equal(validReadStatusRequest({ type:'reaction',id:0,command }),false);
});
test('private IPC excludes reaction writes from receipts; background summaries neither acknowledge nor block receipts',async()=>{
  const s=new ReadStatusWorker(worker,2000);
  try {
    await s.start({ token:'synthetic',scope:'spark:all',expiresAt:Date.now()+60_000 });
    const write={ ...command,action:'add' as const,reaction:'heart' as const };
    const pending=s.reaction(write);
    await assert.rejects(s.markRead('room-1','message'),/pending/);
    await assert.rejects(s.reaction(command),error=>error instanceof ReactionReadError && error.reason === 'worker:busy');
    assert.deepEqual(await pending,{ status:'changed' });
    const reading=s.markRead('room-1','message');
    await assert.rejects(s.reaction(write),/occupied/);
    assert.deepEqual((await s.reaction(command) as any).groups,[]); await reading;
    const summary=s.reaction(command);
    await s.markRead('room-1','message'); assert.deepEqual((await summary as any).groups,[]);
  } finally { await close(s); }
});
test('private reaction IPC preserves only a fixed read failure phase/problem',async()=>{
  const s=new ReadStatusWorker(worker,2000);
  try {
    await s.start({ token:'reaction-denied',scope:'spark:all',expiresAt:Date.now()+60_000 });
    await assert.rejects(s.reaction(command),error=>error instanceof ReactionReadError && error.reason === 'parent:denied');
  } finally { await close(s); }
});
test('viewport batches share the existing read-only slot, allow receipts and reject uncorrelated responses',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('LIVE NETWORK FORBIDDEN');});
  const batch={roomId:'room-1',messageIds:['one','two','three']},s=new ReadStatusWorker(worker,2000);
  const engine=new EditorEngine(undefined,()=>s),out:any[]=[],rpc=new EditorRPC(engine,new EditorMeetings(),value=>{out.push(value);});
  try {
    await engine.start('demo');await engine.select('demo-general');
    const internal=engine as unknown as { generation:number; startReadStatus(access:{token:string;scope:string;expiresAt:number},generation:number):Promise<void> };
    await internal.startReadStatus({token:'synthetic',scope:'spark:all',expiresAt:Date.now()+60_000},internal.generation);
    assert.equal(validReadStatusRequest({type:'reactions',id:1,batch}),true);
    assert.equal(validReadStatusRequest({type:'reactions',id:1,batch,progressive:true}),true);
    assert.equal(validReadStatusRequest({type:'reactions',id:1,batch,progressive:false}),false);
    assert.equal(validReadStatusRequest({type:'reactions',id:1,batch:{...batch,url:'https://foreign.invalid'}}),false);
    const pending=s.reactions(batch);
    await assert.rejects(s.reactions(batch),/worker:busy/);
    await assert.rejects(s.reaction({...command,action:'add',reaction:'heart'}),/occupied/);
    await s.markRead('room-1','message');
    assert.ok(reactionBatchMatches(await pending,batch));
    const messages=engine.snapshot().messages,loaded={roomId:'demo-general',messageIds:messages.slice(0,2).map(message=>message.id)};
    Object.assign(engine,{mode:'live',token:'SYNTHETIC_NEVER_LIVE',expiresAt:Date.now()+60_000,grantedScope:'spark:all'});
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:1,method:'hello',params:{version:1}}));
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:2,method:'messages.reactionsBatch',params:{...loaded,internalConsent:true}}));
    assert.ok(reactionBatchMatches(out.find(value=>value.id === 2).result,loaded),'actual RPC → controller → source → private IPC carries the whole exact viewport');
    assert.deepEqual(engine.snapshot().messages,messages);
  } finally {await close(s);await rpc.close();}
  const foreign=new ReadStatusWorker(worker,2000),failures:unknown[]=[];
  foreign.onFailure=reason=>failures.push(reason);
  try {
    await foreign.start({token:'reaction-batch-foreign',scope:'spark:all',expiresAt:Date.now()+60_000});
    await assert.rejects(foreign.reactions(batch),/worker:unavailable/);
    assert.deepEqual(failures,['invalid-data']);
  } finally {await close(foreign);}
});
test('progress crosses actual private IPC, engine and opt-in RPC without releasing batch admission',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('LIVE NETWORK FORBIDDEN');});
  const s=new ReadStatusWorker(worker,2000),engine=new EditorEngine(undefined,()=>s),out:any[]=[];
  let published!:()=>void;
  const first=new Promise<void>(resolve=>{published=resolve;});
  const rpc=new EditorRPC(engine,new EditorMeetings(),value=>{out.push(value);if((value as any).method==='messages.reactionProgress')published();});
  try {
    await engine.start('demo');await engine.select('demo-general');
    const internal=engine as unknown as {generation:number;startReadStatus(access:{token:string;scope:string;expiresAt:number},generation:number):Promise<void>};
    await internal.startReadStatus({token:'reaction-progress-held',scope:'spark:all',expiresAt:Date.now()+60000},internal.generation);
    Object.assign(engine,{mode:'live',token:'SYNTHETIC',expiresAt:Date.now()+60000,grantedScope:'spark:all'});
    await rpc.receive(JSON.stringify({jsonrpc:'2.0',id:1,method:'hello',params:{version:1}}));
    const batch={roomId:'demo-general',messageIds:engine.snapshot().messages.slice(0,2).map(m=>m.id)};
    const reading=rpc.receive(JSON.stringify({jsonrpc:'2.0',id:2,method:'messages.reactionsBatch',params:{...batch,internalConsent:true,progressive:true}}));
    await Promise.race([first,reading.then(()=>assert.fail('batch settled before progress'))]);
    const item=out.find(v=>v.method==='messages.reactionProgress');assert.ok(item);
    assert.equal(item.params.requestId,2);assert.equal(item.params.snapshot.messageId,batch.messageIds[0]);
    assert.equal(out.some(v=>v.id===2),false,'a progress packet does not finish the RPC');
    await assert.rejects(s.reactions(batch),/worker:busy/,'physical batch admission remains held');
    const child=(s as unknown as {child:ChildProcess}).child;
    child.send({type:'release-reactions'});
    await reading;
    assert.ok(reactionBatchMatches(out.find(v=>v.id===2).result,batch));
    out.length=0;
    const legacy=rpc.receive(JSON.stringify({jsonrpc:'2.0',id:3,method:'messages.reactionsBatch',params:{...batch,internalConsent:true}}));
    child.send({type:'release-reactions'});await legacy;
    assert.ok(!out.some(v=>v.method==='messages.reactionProgress'),'legacy RPC requests get no unsolicited progress method');
  } finally {await close(s);await rpc.close();}
});
for(const mode of ['foreign','own','id','duplicate']) test(`progress IPC rejects ${mode} packets before dispatch`,async()=>{
  const s=new ReadStatusWorker(worker,2000),seen:ReactionSnapshot[]=[],failures:unknown[]=[];
  s.onFailure=reason=>failures.push(reason);
  try {
    await s.start({token:'reaction-progress-'+mode,scope:'spark:all',expiresAt:Date.now()+60000});
    await assert.rejects(s.reactions({roomId:'room-1',messageIds:['one','two']},item=>seen.push(item)));
    assert.deepEqual(failures,['invalid-data']);assert.equal(seen.length,mode==='duplicate'?1:0);
  } finally {await close(s);}
});
test('private IPC refuses unsolicited progress for a final-only parent request',async()=>{
  const s=new ReadStatusWorker(worker,2000),failures:unknown[]=[];
  s.onFailure=reason=>failures.push(reason);
  try {
    await s.start({token:'reaction-progress-unsolicited',scope:'spark:all',expiresAt:Date.now()+60000});
    await assert.rejects(s.reactions({roomId:'room-1',messageIds:['one','two']}));
    assert.deepEqual(failures,['invalid-data']);
  } finally {await close(s);}
});
test('actual reaction IPC to engine to RPC retains a bounded failure without replacing the live provider',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{ throw new Error('LIVE NETWORK FORBIDDEN'); });
  const s = new ReadStatusWorker(worker,2000), e = new EditorEngine(undefined,()=>s), out:any[] = [];
  const rpc = new EditorRPC(e,new EditorMeetings(),value=>{ out.push(value); });
  try {
    await e.start('demo'); await e.select('demo-general');
    const internal=e as unknown as { generation:number; startReadStatus(access:{token:string;scope:string;expiresAt:number},generation:number):Promise<void> };
    await internal.startReadStatus({token:'reaction-denied',scope:'spark:all',expiresAt:Date.now()+60_000},internal.generation);
    Object.assign(e,{ mode:'live',token:'SYNTHETIC_NEVER_LIVE',expiresAt:Date.now()+60_000,
      grantedScope:'spark:all' });
    await rpc.receive(JSON.stringify({ jsonrpc:'2.0',id:1,method:'hello',params:{ version:1 } }));
    await rpc.receive(JSON.stringify({ jsonrpc:'2.0',id:2,method:'messages.reactions',
      params:{ roomId:'demo-general',messageId:e.snapshot().messages[0]!.id,internalConsent:true } }));
    assert.match(out.find(value=>value.id === 2).error.message,/Reaction summary unavailable \(parent:denied\)/);
    assert.ok(!JSON.stringify(out).includes('SYNTHETIC_NEVER_LIVE'));
    await close(s);
    await rpc.receive(JSON.stringify({ jsonrpc:'2.0',id:3,method:'messages.reactions',
      params:{ roomId:'demo-general',messageId:e.snapshot().messages[0]!.id,internalConsent:true } }));
    assert.match(out.find(value=>value.id === 3).error.message,/worker:unavailable/,'local source failure also retains a category');
  } finally { await close(s); await rpc.close(); }
});
for (const mode of ['reaction-malformed','reaction-hang','reaction-reason-leak']) test(`private reaction IPC fails closed on ${mode} without exposing provider data`,async()=>{
  const s=new ReadStatusWorker(worker,mode.endsWith('hang') ? 150 : 2000), failures:unknown[]=[];
  s.onFailure=r=>failures.push(r);
  try {
    await s.start({ token:mode,scope:'spark:all',expiresAt:Date.now()+60_000 });
    await assert.rejects(s.reaction(command),error=>!String(error).includes('PRIVATE'));
    assert.equal(failures.length,1); await assert.rejects(s.reaction(command));
  } finally { await close(s); }
});
