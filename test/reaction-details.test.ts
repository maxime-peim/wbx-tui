import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validReactionCommand, validReactionDetails, validReactionSnapshot, REACTION_LIMITS } from '../src/reaction-contracts.js';
import { MessageReactions } from '../src/message-reactions.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
const target = {roomId:'room',messageId:'message'};
const details = () => ({snapshot:{...target,observedAt:100,partial:true,unknown:false,
  groups:[{reaction:'heart',label:'Heart',count:10}]},
  actors:[{reaction:'heart',personId:'person',name:'A person'}],partial:true});

test('actor details are explicit, bounded, closed, deduplicated and separate from cache/legacy DTOs',()=>{
  const value = details();
  assert.ok(validReactionDetails(value));
  assert.ok(validReactionDetails({...value,activityReadFailure:'summary:denied'}));
  assert.equal(validReactionDetails({...value,activityReadFailure:'PRIVATE server body'}),false);
  assert.equal(validReactionSnapshot(value),false);
  assert.equal(validReactionSnapshot({...value.snapshot,actors:value.actors}),false);
  assert.ok(validReactionCommand({...target,action:'summary',details:true}));
  assert.equal(validReactionCommand({...target,action:'add',reaction:'heart',details:true}),false);
  for (const patch of [{partial:false},{secret:'PRIVATE'},{actors:[...value.actors,...value.actors]},
    {actors:Array.from({length:11},(_,i)=>({...value.actors[0],personId:'p'+i}))},
    ...[{name:"unsafe\nname"},{personId:'me'},{reaction:'celebrate'},{raw:{secret:'PRIVATE'}}]
      .map(patch=>({actors:[{...value.actors[0],...patch}]})),
    {snapshot:{...value.snapshot,groups:[{...value.snapshot.groups[0],own:'a'.repeat(32)}]}}])
    assert.equal(validReactionDetails({...value,...patch}),false,JSON.stringify(patch));
  const parse = (params:object)=>parseEditorOperation({jsonrpc:'2.0',id:1,method:'messages.reactions',params:{...target,internalConsent:true,...params}});
  assert.equal((parse({details:true}).params as any).details,true);
  assert.equal('details' in parse({}).params,false);
  for (const patch of [{details:false},{details:1},{actors:[]},{internalConsent:false}]) assert.throws(()=>parse(patch));
});

test('details controller preserves admission, source/target fences and cannot grant mutation ownership',async()=>{
  const value = details(), calls:any[]=[];
  let release!:()=>void;
  const gate = new Promise<void>(r=>{release=r;});
  const c = new MessageReactions(async command=>{calls.push(command); await gate; return value;});
  const pending = c.details('room','message',()=>true);
  await assert.rejects(c.summary('room','message',()=>true),/worker:busy/);
  c.reset();release();
  await assert.rejects(pending,/context:unverified/);
  const second = new MessageReactions(async command=>{calls.push(command);return value;});
  const read = await second.details('room','message',()=>true);
  read.actors.length=0;assert.equal(value.actors.length,1,'detached output');
  await assert.rejects(second.prepare('room','message','remove','heart',()=>true));
  assert.ok(calls.every(c=>c.action==='summary'));
  const foreign = new MessageReactions(async()=>({...value,snapshot:{...value.snapshot,messageId:'foreign'}}));
  await assert.rejects(foreign.details('room','message',()=>true),/summary:unverified/);
});

test('engine resolves only disclosed exact actors, bounds name GETs and never caches relationships',async t=>{
  const e = new EditorEngine(), requests:string[]=[];
  try {
    await e.start('demo');await e.select('demo-general');
    const roomId = 'demo-general', messageId = e.snapshot().messages[0]!.id, internal = e as any;
    Object.assign(e,{mode:'live',token:'SYNTHETIC',expiresAt:Date.now()+60000,grantedScope:'spark:all'});
    t.mock.method(internal.reads,'readable',()=>true);
    t.mock.method(internal.reads,'lease',()=>()=>true);
    const value = {...details(),snapshot:{...details().snapshot,roomId,messageId},
      actors:Array.from({length:10},(_,i)=>({reaction:'heart',personId:'p'+i}))};
    t.mock.method(internal,'reactionProvider',async(command:any)=>command.details ? value : value.snapshot);
    const cache = t.mock.method(internal,'cacheReaction',()=>{});
    t.mock.method(internal.actionREST,'call',async(path:string,method:string)=>{
      assert.equal(method,'GET'); requests.push(path);
      const id = decodeURIComponent(path.split('/').at(-1)!);
      return {value:{id,displayName:'Name '+id},status:200};
    });
    const got = await e.reactionDetails(roomId,messageId);
    assert.equal(requests.length,REACTION_LIMITS.names);
    assert.ok(requests.every(p=>p.startsWith('/v1/people/p')));
    assert.equal(got.actors[0]!.name,'Name p0');
    assert.equal(got.actors.at(-1)!.name,undefined,'name budget never invents an identity');
    assert.equal(cache.mock.callCount(),1);
    assert.deepEqual(cache.mock.calls[0]!.arguments,[value.snapshot],'only the unchanged closed summary enters the display cache');
    assert.equal(JSON.stringify(e.snapshot()).includes('"actors"'),false);
    await assert.rejects(e.reactionDetails(roomId,'unloaded'));
    assert.equal(requests.length,REACTION_LIMITS.names);
  } finally {e.stop();}
});

test('failed names preserve actor IDs and late name completions cannot return stale message details',async t=>{
  const e = new EditorEngine();
  try {
    await e.start('demo');await e.select('demo-general');
    const roomId='demo-general',messageId=e.snapshot().messages[0]!.id,internal=e as any;
    const value={...details(),snapshot:{...details().snapshot,roomId,messageId},
      actors:[{reaction:'heart',personId:'disclosed'}]};
    t.mock.method(internal,'reactionProvider',async()=>value);
    Object.assign(e,{mode:'live',token:'SYNTHETIC',expiresAt:Date.now()+60000,grantedScope:'spark:all'});
    t.mock.method(internal.reads,'readable',()=>true);t.mock.method(internal.reads,'lease',()=>()=>true);
    const request=t.mock.method(internal.actionREST,'call',async()=>{throw new Error('PRIVATE failure');});
    const got=await e.reactionDetails(roomId,messageId);
    assert.deepEqual(got.actors,value.actors);
    let release!:()=>void;
    const gate=new Promise<void>(r=>{release=r;});
    request.mock.mockImplementation(async()=>{await gate;return {value:{id:'disclosed',displayName:'Late name'},status:200};});
    const pending=e.reactionDetails(roomId,messageId);
    await new Promise<void>(r=>setImmediate(r));
    internal.generation++;release();
    await assert.rejects(pending,/context:unverified/);
    assert.equal(internal.featureAbort,undefined);
  } finally {e.stop();}
});
