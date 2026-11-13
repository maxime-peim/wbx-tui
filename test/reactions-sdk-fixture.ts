/** Approved implementation, OFFLINE ONLY. Actual SDK mutations/interceptors and
 * http-core; metadata, KMS text transforms and final request primitive synthetic. */
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SDKReactions } from '../src/reactions-sdk.js';
import { ReactionReadError, reactionBatchMatches, validReactionSnapshot, validReactionDetails, type ReactionCommand, type ReactionSnapshot } from '../src/reaction-contracts.js';
import { until, handled } from './async-test.js';

if (process.env.WBX_READ_STATUS_SDK_TEST !== '1') throw new Error('Explicit offline SDK opt-in required');
let forbidden=0,registrations=0,refreshes=0;
const deny = ():never=>{ forbidden++; throw new Error('Native I/O forbidden'); };
net.Socket.prototype.connect=deny; tls.connect=deny; http.request=deny; https.request=deny;
for (const api of [dns,dns.promises,dns.Resolver.prototype,dns.promises.Resolver.prototype])
  for (const name of Object.getOwnPropertyNames(api))
    if (name === 'lookup' || name === 'lookupService' || name === 'reverse' || name.startsWith('resolve')) Object.defineProperty(api,name,{ value:deny });
dgram.createSocket=deny;
for (const name of ['send','bind','connect']) Object.defineProperty(dgram.Socket.prototype,name,{ value:deny });
globalThis.fetch=deny;
const deadline = setTimeout(()=>process.exit(2),20_000);
const require = createRequire(new URL('../optional/read-status-sdk/package.json',import.meta.url));
const primitive = require.resolve('request'); require(primitive);
let scenario:any = {}, lastPrimitive!:(error:Error|null,response?:any)=>void, nativeReadBody:any, nativeChildReadBody:any;
let nativeReads=0,decryptions=0;
const attempts:any[] = [];
const room='11111111-1111-4111-8111-111111111111', root='22222222-2222-4222-8222-222222222222';
const self='33333333-3333-4333-8333-333333333333', reply='44444444-4444-4444-8444-444444444444';
const own='66666666-6666-4666-8666-666666666666', ack='55555555-5555-4555-8555-555555555555';
const base='https://synthetic.invalid/conversation/api/v1', url=`${base}/conversations/${room}`, keyUrl='kms://synthetic/key';
require.cache[primitive]!.exports = (options:any,callback:(error:Error|null,response?:any)=>void)=>{
  if (options.method === 'GET') {
    const child=options.uri === `${url}/parents/${root}`;
    const body=child ? nativeChildReadBody : nativeReadBody;
    assert.ok(body,'only the explicit synthetic parent/child GET is allowed');
    nativeReads++;
    if(child) {
      assert.equal(options.qs.activityType,'reaction');
      const limit=options.qs.limit;
      assert.ok(Number.isSafeInteger(limit) && limit>0);
      if(limit>10) {
        setImmediate(()=>callback(null,{statusCode:400,headers:{},body:{message:'Synthetic child page limit exceeds 10'}}));
        return new EventEmitter();
      }
    }
    setImmediate(()=>callback(null,{statusCode:200,headers:{},body:structuredClone(body)}));
    return new EventEmitter();
  }
  attempts.push({ ...options,body:structuredClone(options.body) }); lastPrimitive=callback;
  const current=scenario, body=structuredClone(options.body);
  if (body.verb === 'delete') Object.assign(body.object,{ verb:'tombstone',parent:{ type:'reaction',id:root } });
  if (!current.hold) setImmediate(()=>callback(current.error ?? null,current.error ? undefined : {
    statusCode:current.status ?? 200,headers:current.headers ?? {},body:current.body ?? { ...body,id:ack },
  }));
  return new EventEmitter();
};
try {
  const { createReadStatusSDK } = await import('../src/read-status-sdk.js');
  const sdk:any = createReadStatusSDK({ token:'SYNTHETIC-NEVER-LIVE',scope:'spark:all spark:kms',expiresAt:Date.now()+60_000 });
  const c=sdk.internal.conversation;
  sdk.internal.device.userId=self;
  sdk.internal.device.register=async()=>{ registrations++; throw new Error('Forbidden'); };
  sdk.internal.device.unregister=async()=>{ registrations++; throw new Error('Forbidden'); };
  sdk.internal.services.waitForCatalog=async()=>{};
  sdk.internal.services.getServiceUrlFromClusterId=()=>base;
  sdk.internal.services.getServiceFromUrl=(v:string)=>v.startsWith(base) ? { name:'conversation' } : undefined;
  sdk.internal.services.waitForService=async()=>base;
  sdk.internal.services.replaceHostFromHostmap=(v:string)=>v;
  sdk.internal.encryption.unboundedStorage.get=async()=>JSON.stringify({ jwk:{ k:'SYNTHETIC',kid:'synthetic',kty:'oct' } });
  sdk.internal.encryption.encryptText=async()=>'SYNTHETIC-CIPHERTEXT';
  sdk.internal.encryption.decryptText=async(_key:string,text:string)=>{ decryptions++; return text === 'ENCRYPTED-CELEBRATE' ? 'celebrate' : 'heart'; };
  Object.defineProperty(sdk.credentials,'canRefresh',{ value:true });
  sdk.credentials.refresh=async()=>{ refreshes++; throw new Error('Forbidden'); };
  await until(()=>sdk.ready,'SDK ready');
  const common=require('@webex/common'), publicRoom=common.constructHydraId('ROOM',room,'us');
  const messageId=(v:string)=>common.constructHydraId('MESSAGE',v,'us');
  const command=(action:ReactionCommand['action'],message=root):ReactionCommand=>({ action,roomId:publicRoom,messageId:messageId(message),
    ...(action !== 'summary' ? { reaction:'heart' as const } : {}) });
  let parentPatch:any={},publicPatch:any={},childPatch:any={}, freshOwnPatch:any={}, conversationPatch:any={}, children:any[]=[], activityItems:any[]|undefined, ownReadFails=false, parentDenied=false;
  const batchIds=[root,reply,...Array.from({length:6},(_,i)=>`77777777-7777-4777-8777-77777777777${i}`)];
  let roomGets=0,messageGets=0,parentGets=0,ownGets=0,parentActive=0,maxParent=0,deniedMessage='',parentGate:Promise<void>|undefined;
  const parentGates=new Map<string,Promise<void>>();
  const ownActivity=()=>({ id:own,objectType:'activity',verb:'add',actor:{ id:self,objectType:'person' },
    target:{ id:room,objectType:'conversation' },parent:{ id:root,type:'reaction' },object:{ objectType:'reaction2',displayName:'heart' },...childPatch });
  sdk.messages.get=async(id:string)=>{ messageGets++; return { id,roomId:publicRoom,...publicPatch }; };
  c.get=async(value:any)=>{ roomGets++; assert.equal(value.url,url); return { id:room,url,defaultActivityEncryptionKeyUrl:keyUrl,kmsResourceObjectUrl:'kms://synthetic/resource',...conversationPatch }; };
  const request=c.request;
  c.request=async function(value:any) {
    if (value.method === 'GET') {
      if(nativeChildReadBody && value.url === `${url}/parents/${root}`) return request.call(this,value);
      if (value.url === `${url}/activities/${own}`) return {body:{...ownActivity(),...freshOwnPatch}};
      if (nativeReadBody) return request.call(this,value);
      const id=value.url.split('/').at(-1); assert.ok(batchIds.includes(id));
      parentGets++; parentActive++; maxParent=Math.max(maxParent,parentActive);
      try { await (parentGates.get(id) ?? parentGate ?? new Promise<void>(resolve=>setImmediate(resolve))); } finally { parentActive--; }
      if (parentDenied || deniedMessage === id) throw { statusCode:403,body:{ message:'PRIVATE' } };
      // Match the actual SDK read contract: children are requested, not implicit.
      const include = value.qs?.activityType === 'reactionSummary' && value.qs?.includeChildren === true;
      return { body:{ id,objectType:'activity',verb:'post',target:{ id:room,objectType:'conversation' },encryptionKeyUrl:keyUrl,
        ...(include ? { children } : {}),...parentPatch } };
    }
    return request.call(this,value);
  };
  const metadataRequest=c.request;
  const nativeChildReader=c.listChildActivitiesByParentId.bind(c);
  c.listChildActivitiesByParentId=async(gotUrl:string,message:string,kind:string,options:any)=>{
    ownGets++;
    assert.equal(gotUrl,url); assert.ok([root,reply].includes(message)); assert.equal(kind,'reaction'); assert.deepEqual(options,{ limit:10 });
    if (ownReadFails) throw new Error('PRIVATE own-activity read denied');
    return { body:{ items:activityItems ?? [ownActivity()] },headers:{ link:'<https://synthetic.invalid/more>; rel=next' } };
  };
  const adapter=new SDKReactions(sdk);
  // Match the pinned SDK's decryptActivity traversal: child.activity.object.
  children=[{ type:'reactionSummary',activity:{ objectType:'activity',
    object:{ objectType:'reaction2Summary',reactions:[{ displayName:'heart',count:9000 },{ displayName:'celebrate',count:3 }] } } },
    { type:'reactionSelfSummary',activity:{ objectType:'activity',
      object:{ objectType:'reaction2SelfSummary',reactions:[{ displayName:'heart',count:123456 }] } } }];
  let s=await adapter.perform(command('summary')) as ReactionSnapshot;
  assert.ok(validReactionSnapshot(s)); assert.equal(s.partial,true); assert.equal(s.groups[0]!.count,9000);
  assert.equal(s.groups[0]!.mine,true); assert.equal(s.groups[1]!.count,3);
  assert.ok(s.groups[0]!.own); assert.equal(attempts.length,0);
  assert.ok(s.groups.some(g=>g.reaction === 'celebrate' && !g.own),'other people’s reactions require the SDK summary-child query, not our own activity list');
  const selfChild=children[1];
  for (const actor of [{id:self},{entryUUID:self},{id:self,objectType:'person'},{entryUUID:self,objectType:'person'},
    {id:self,entryUUID:self,objectType:'person'}]) {
    selfChild.activity.actor=actor;
    const ownSummary=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
    const item=ownSummary.items[0]!;
    assert.ok('groups' in item);
    assert.equal(item.groups.find(group=>group.reaction==='heart')?.mine,true,
      'both canonical SDK actor identity fields preserve the inline (you) marker');
    assert.equal(item.groups.find(group=>group.reaction==='celebrate')?.mine,undefined,'other reactions remain unmarked');
    assert.ok(item.groups.every(group=>!group.own),'display evidence never mints removal handles');
  }
  activityItems=[]; // No independent own-activity evidence for rejected summaries.
  for (const actor of [{id:reply,objectType:'person'},{id:reply,entryUUID:self,objectType:'person'},
    {entryUUID:self,objectType:'bot'},{id:self,objectType:'bot'}]) {
    selfChild.activity.actor=actor;
    const rejected=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
    assert.ok('groups' in rejected.items[0]!);
    assert.equal(rejected.items[0]!.groups.find(group=>group.reaction==='heart')?.mine,undefined,
      'foreign, contradictory and non-person actors cannot acquire the inline own marker');
  }
  delete selfChild.activity.actor;
  children.splice(1,1);
  activityItems=[ownActivity(),{...ownActivity(),actor:{id:reply,objectType:'person'},object:{objectType:'reaction2',displayName:'celebrate'}}];
  const beforeFallback=ownGets;
  const fallback=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
  assert.ok('groups' in fallback.items[0]!);
  assert.equal(ownGets,beforeFallback+1,'an aggregate-only parent needs one bounded read-only self-activity supplement');
  assert.equal(fallback.items[0]!.groups.find(group=>group.reaction==='heart')?.mine,true,
    'omitted self-summary cannot hide a disclosed own reaction in inline history');
  assert.equal(fallback.items[0]!.groups.find(group=>group.reaction==='heart')?.count,9000,'own activity is not a total');
  assert.equal(fallback.items[0]!.groups.find(group=>group.reaction==='celebrate')?.mine,undefined);
  assert.ok(fallback.items[0]!.groups.every(group=>!group.own),'passive fallback has no removal authority');
  for (const patch of [{actor:{id:reply,objectType:'person'}},{actor:{id:reply,entryUUID:self,objectType:'person'}},
    {target:{id:self,objectType:'conversation'}},{parent:{id:reply,type:'reaction'}},{verb:'delete'}]) {
    activityItems=[{...ownActivity(),...patch}];
    const rejected=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
    assert.ok('groups' in rejected.items[0]!);
    assert.ok(rejected.items[0]!.groups.every(group=>!group.mine && !group.own),'foreign/contradictory activity cannot mark a chip as yours');
  }
  activityItems=Array.from({length:11},()=>ownActivity());
  const oversizedFallback=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
  assert.ok('groups' in oversizedFallback.items[0]!);
  assert.ok(oversizedFallback.items[0]!.groups.every(group=>!group.mine && !group.own),'oversized pages do not establish self participation');
  activityItems=undefined;ownReadFails=true;
  const deniedFallback=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
  assert.ok('groups' in deniedFallback.items[0]!);
  assert.equal(deniedFallback.items[0]!.groups.find(group=>group.reaction==='heart')?.count,9000);
  assert.ok(deniedFallback.items[0]!.groups.every(group=>!group.mine && !group.own),'denied self reads cannot fabricate participation');
  ownReadFails=false;children.push(selfChild);
  const other={...ownActivity(),actor:{id:reply,objectType:'person',displayName:"Other\nperson\u202e"},
    object:{objectType:'reaction2',displayName:'celebrate'}};
  activityItems=[ownActivity(),other,other];
  const beforeDetails=ownGets;
  const details=await adapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(details));assert.equal(ownGets,beforeDetails+1,'one bounded page; never follow provider next links');
  assert.deepEqual(details.actors,[{reaction:'heart',personId:common.buildHydraPersonId(self)},
    {reaction:'celebrate',personId:common.buildHydraPersonId(reply),name:'Other person'}]);
  assert.ok(details.snapshot.groups.every(g=>!g.own),'details cannot mint removal authority, including for self');
  assert.equal(details.snapshot.groups.find(g=>g.reaction==='celebrate')!.count,3,'actor cardinality is not a total');
  for (const patch of [{target:{id:self,objectType:'conversation'}},{parent:{id:reply,type:'reaction'}},{verb:'delete'},
    {actor:{id:'not-a-uuid',objectType:'person'}},{object:{objectType:'reaction2',displayName:'unknown'}}]) {
    activityItems=[{...other,...patch}];
    const rejected=await adapter.perform({...command('summary'),details:true});
    assert.ok(validReactionDetails(rejected));assert.deepEqual(rejected.actors,[]);
  }
  const bound={...other};delete (bound as any).target;delete (bound as any).parent;
  activityItems=[bound];
  const boundDetails=await adapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(boundDetails));assert.equal(boundDetails.actors.length,1,'exact parent collection can bind display evidence only');
  activityItems=Array.from({length:11},()=>other);
  const oversized=await adapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(oversized));assert.deepEqual(oversized.actors,[]);
  activityItems=undefined;ownReadFails=true;
  const deniedDetails=await adapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(deniedDetails));assert.deepEqual(deniedDetails.actors,[]);
  assert.ok(deniedDetails.snapshot.groups.length>0,'undisclosed actors cannot erase summary labels');
  assert.equal(attempts.length,0,'all details requests are read-only');
  ownReadFails=false;
  childPatch={parent:undefined,target:undefined};
  freshOwnPatch={parent:{id:root,type:'reaction'},target:{id:room,objectType:'conversation'}};
  const hydrated=await adapter.perform(command('summary')) as ReactionSnapshot;
  assert.ok(hydrated.groups.find(g=>g.reaction==='heart')?.own,'partial own collection rows need a fresh exact full-activity read');
  freshOwnPatch={...freshOwnPatch,actor:{id:reply,objectType:'person'}};
  assert.deepEqual(await adapter.perform({...command('remove'),own:hydrated.groups.find(g=>g.reaction==='heart')!.own}),{status:'failed'},
    'a fresh exact activity owned by somebody else cannot authorize removal');
  freshOwnPatch={parent:{id:root,type:'reaction'},target:{id:room,objectType:'conversation'}};
  assert.equal((await adapter.perform(command('summary')) as ReactionSnapshot).groups[0]!.mine,true);
  childPatch={};freshOwnPatch={};
  childPatch={actor:{entryUUID:self,objectType:'person'}};
  assert.ok((await adapter.perform(command('summary')) as ReactionSnapshot).groups[0]!.own,'the pinned SDK internal actor entryUUID identifies self too');
  childPatch={actor:{id:reply,entryUUID:self,objectType:'person'}};
  assert.equal((await adapter.perform(command('summary')) as ReactionSnapshot).groups[0]!.own,undefined,'contradictory actor identity fields fail closed');
  childPatch={};
  nativeReadBody={id:root,objectType:'activity',verb:'post',target:{id:room,objectType:'conversation'},encryptionKeyUrl:keyUrl,
    children:[{type:'reactionSummary',activity:{objectType:'activity',encryptionKeyUrl:keyUrl,
      object:{objectType:'reaction2Summary',reactions:[{displayName:'ENCRYPTED-CELEBRATE'}]}}}]};
  ownReadFails=true;
  const decrypted=await adapter.perform(command('summary')) as ReactionSnapshot;
  assert.equal(nativeReads,1);
  assert.ok(decryptions > 0,'actual pinned inbound transforms decrypt the nested summary before normalization');
  assert.deepEqual(decrypted.groups,[{reaction:'celebrate',label:'Celebrate'}],'another person’s encrypted nested label reaches the production reader');
  const decryptedBatch=await adapter.summaries({roomId:publicRoom,messageIds:[messageId(root)]});
  assert.ok('groups' in decryptedBatch.items[0]!);
  assert.deepEqual(decryptedBatch.items[0]!.groups,[{reaction:'celebrate',label:'Celebrate'}],'optimized viewport reads still run the actual inbound decrypt/parent path');
  nativeReadBody=undefined;ownReadFails=false;
  nativeChildReadBody={items:[{...ownActivity(),encryptionKeyUrl:keyUrl,
    object:{objectType:'reaction2',displayName:'ENCRYPTED-CELEBRATE'}}]};
  await assert.rejects(nativeChildReader(url,root,'reaction',{limit:64}),(error:any)=>error.statusCode===400,
    'the actual child reader must reproduce the observed service rejection, not hide it behind a mocked helper');
  const nativeChildren=await nativeChildReader(url,root,'reaction',{limit:10});
  assert.equal(nativeChildren.body.items[0].object.displayName,'celebrate',
    'the actual pinned child reader and inbound transforms must run, not only a stubbed helper');
  const stubbedChildren=c.listChildActivitiesByParentId;
  c.listChildActivitiesByParentId=nativeChildReader;
  const nativeAdapter=new SDKReactions(sdk);
  const nativeSummary=await nativeAdapter.perform(command('summary')) as ReactionSnapshot;
  assert.ok(nativeSummary.groups.find(g=>g.reaction==='celebrate')?.own,'the production reader must request the supported page size and recover verified removal handles');
  const nativeDetails=await nativeAdapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(nativeDetails));
  assert.equal(nativeDetails.activityReadFailure,undefined);
  assert.deepEqual(nativeDetails.actors,[{reaction:'celebrate',personId:common.buildHydraPersonId(self)}]);
  c.listChildActivitiesByParentId=stubbedChildren;
  nativeChildReadBody=undefined;
  const batch={ roomId:publicRoom,messageIds:batchIds.map(messageId) }, counts=[roomGets,messageGets,parentGets,ownGets];
  maxParent=0;
  const batchResult=await adapter.summaries(batch);
  assert.ok(reactionBatchMatches(batchResult,batch));
  assert.deepEqual([roomGets-counts[0]!,messageGets-counts[1]!,parentGets-counts[2]!,ownGets-counts[3]!],[1,0,8,0],
    'already-loaded viewport targets use nine reads, not duplicate public-message reads or removal-ownership lookups');
  assert.equal(maxParent,3,'bounded read chains overlap instead of serial message-at-a-time loading');
  for (const item of batchResult.items) {
    assert.ok('groups' in item);
    assert.ok(item.groups.some(group=>group.reaction === 'celebrate'));
    assert.ok(item.groups.every(group=>!group.own),'viewport reads never mint removal handles');
    assert.equal(item.groups.find(group=>group.reaction==='heart')!.mine,true,'self-summary evidence can highlight without a removal handle');
    assert.equal(item.groups.find(group=>group.reaction==='heart')!.count,9000,'self-summary counts cannot replace aggregate counts');
  }
  const one={roomId:publicRoom,messageIds:[messageId(root)]};
  for (const patch of [{id:reply},{target:{id:self}},{verb:'delete'},{encryptionKeyUrl:undefined}]) {
    parentPatch=patch;
    assert.deepEqual((await adapter.summaries(one)).items,[{messageId:messageId(root),reason:'parent:unverified'}],
      'removing duplicate public GETs must not weaken exact canonical parent, room, verb or key checks');
  }
  parentPatch={};
  conversationPatch={id:self};
  assert.deepEqual((await adapter.summaries(one)).items,[{messageId:messageId(root),reason:'conversation:unverified'}]);
  conversationPatch={};
  sdk.internal.device.userId='unverified';
  const beforeActor=parentGets+roomGets;
  assert.deepEqual((await adapter.summaries(one)).items,[{messageId:messageId(root),reason:'actor:unverified'}]);
  assert.equal(parentGets+roomGets,beforeActor,'an unverified actor admits no viewport I/O');
  sdk.internal.device.userId=self;
  deniedMessage=reply;
  const mixed=await adapter.summaries(batch);
  assert.deepEqual(mixed.items[1],{ messageId:messageId(reply),reason:'parent:denied' });
  assert.ok(mixed.items.every((item,index)=>index === 1 || 'groups' in item),'one denied message cannot erase the rest of the viewport');
  deniedMessage='';
  let releaseLast!:()=>void;
  parentGates.set(batchIds.at(-1)!,new Promise(resolve=>{releaseLast=resolve;}));
  const staggered=new SDKReactions(sdk,80),beforeStaggered=parentGets;
   const progress:ReactionSnapshot[]=[];
   let finished=false;
   const staggeredRead=handled(staggered.summaries(batch,item=>progress.push(item))).then(value=>{finished=true;return value;});
   await until(()=>parentGets-beforeStaggered===8 && parentActive===1,'seven completed parents and one physically held target');
   assert.equal(progress.length,7,'completed summaries publish before the stalled sibling or batch deadline');
   assert.equal(finished,false,'progress is not completion or permission to admit another operation');
   assert.ok(progress.every(item=>item.groups.every(group=>group.own===undefined)));
  const surviving=await staggeredRead;
  assert.ok(reactionBatchMatches(surviving,batch));
  assert.equal(surviving.items.filter(item=>'groups' in item).length,7,'one stalled target cannot erase seven verified observations');
  assert.deepEqual(surviving.items.at(-1),{messageId:batch.messageIds.at(-1),reason:'summary:timeout'});
  for (const item of surviving.items.slice(0,7)) {
    assert.ok('groups' in item && item.groups.some(group=>group.reaction==='celebrate'));
    assert.equal(item.partial,true);assert.ok(item.groups.every(group=>group.own===undefined));
    assert.equal(item.groups.find(group=>group.reaction==='celebrate')!.count,3);
  }
  assert.equal(staggered.busy(),true,'returning partial observations never releases unfinished physical admission');
  const published=JSON.stringify(surviving),beforeBusy=parentGets;
  await assert.rejects(staggered.perform(command('add')),/worker:busy/);
  await assert.rejects(staggered.summaries(one),/worker:busy/);
  assert.equal(parentGets,beforeBusy,'busy calls do not start or queue reads/writes');
   releaseLast();
   await until(()=>!staggered.busy(),'last physical parent settled');
   assert.equal(progress.length,7,'late completion after the logical deadline cannot emit another progress item');
  assert.equal(JSON.stringify(surviving),published,'late completion cannot mutate the detached published batch');
  parentGates.clear();
  let releaseParents!:()=>void;
  parentGate=new Promise(resolve=>{ releaseParents=resolve; });
  const heldBatch=new SDKReactions(sdk,35), readsBefore=parentGets;
  const held=handled(heldBatch.summaries(batch));
  await until(()=>parentActive === 3,'three held read chains');
  assert.deepEqual((await held).items,batch.messageIds.map(messageId=>({messageId,reason:'summary:timeout'})),
    'unfinished and never-started targets each carry a finite timeout, not absence');
  assert.equal(heldBatch.busy(),true);
  await assert.rejects(heldBatch.perform(command('add')),/worker:busy/);
  releaseParents();
  await until(()=>!heldBatch.busy(),'physical batch settlement');
  assert.equal(parentGets-readsBefore,3,'timed-out batches never start their queued reads');
  parentGate=undefined;
  ownReadFails=true;
  const partial=await adapter.perform(command('summary')) as ReactionSnapshot;
  assert.ok(partial.groups.some(g=>g.reaction === 'celebrate'),'a failed own-activity supplement cannot erase a verified aggregate label');
  assert.ok(partial.groups.every(g=>!g.own),'failed ownership reads never grant removal handles');
  assert.equal(partial.partial,true); assert.equal(partial.unknown,true);
  ownReadFails=false;
  const aggregate = children[0].activity.object.reactions;
  for (const count of ['3', -1, 1.5, Number.MAX_SAFE_INTEGER+1]) {
    children[0].activity.object.reactions=[{displayName:'heart',count}];
    const invalid=(await adapter.summaries(one)).items[0]!;
    assert.ok('groups' in invalid); assert.equal(invalid.groups[0]!.count,undefined);
    assert.equal(invalid.unknown,true,'invalid supplied counts remain unknown, never coerced or fabricated');
  }
  children[0].activity.object.reactions=aggregate;
  parentDenied=true;
  await assert.rejects(adapter.perform(command('summary')),error=>error instanceof ReactionReadError && error.reason === 'parent:denied' && !String(error).includes('PRIVATE'));
  parentDenied=false;
  parentPatch={ target:{ id:self } };
  await assert.rejects(adapter.perform(command('summary')),error=>error instanceof ReactionReadError && error.reason === 'parent:unverified');
  parentPatch={};
  conversationPatch={ defaultActivityEncryptionKeyUrl:undefined,kmsResourceObjectUrl:undefined };
  assert.ok((await adapter.perform(command('summary')) as ReactionSnapshot).groups.some(g=>g.reaction === 'celebrate'),'summary display does not require conversation write-encryption fields');
  assert.deepEqual(await adapter.perform(command('add')),{ status:'failed' },'write-encryption guards remain mandatory for mutation');
  conversationPatch={};
  for (const patch of [{ actor:{ id:room,objectType:'person' } },{ target:{ id:self,objectType:'conversation' } },
    { parent:{ id:reply,type:'reaction' } },{ verb:'delete' },{ object:{ objectType:'reaction2',displayName:'forged' } }]) {
    childPatch=patch; s=await adapter.perform(command('summary')) as ReactionSnapshot;
    assert.equal(s.groups[0]!.own,undefined,'unverified own activity cannot expose a removal handle');
  }
  childPatch={}; s=await adapter.perform(command('summary')) as ReactionSnapshot;
  const handle=s.groups[0]!.own!;
  childPatch={ actor:{ id:room,objectType:'person' } };
  assert.deepEqual(await adapter.perform({ ...command('remove'),own:handle }),{ status:'failed' }); assert.equal(attempts.length,0);
  childPatch={};
  assert.deepEqual(await adapter.perform({ ...command('remove'),own:handle }),{ status:'changed' });
  for (const parent of [root,reply]) {
    assert.deepEqual(await adapter.perform(command('add',parent)),{ status:'changed' });
    assert.equal(attempts.at(-1).body.parent.id,parent);
  }
  const encrypt=sdk.internal.encryption.encryptText,decrypt=sdk.internal.encryption.decryptText;
  for (const reaction of ['🔥','👩🏽‍💻']) {
    sdk.internal.encryption.encryptText=async()=>'SYNTHETIC-UNICODE-CIPHERTEXT';
    sdk.internal.encryption.decryptText=async()=>reaction;
    children[0].activity.object.reactions=[{displayName:reaction,count:5}];
    childPatch={object:{objectType:'reaction2',displayName:reaction}};
    const unicode=await adapter.perform(command('summary')) as ReactionSnapshot;
    assert.ok(validReactionSnapshot(unicode));
    assert.equal(unicode.groups.find(g=>g.reaction===reaction)?.count,5,'Unicode aggregate labels are not dropped');
    const own=unicode.groups.find(g=>g.reaction===reaction)?.own;
    assert.ok(own,'Unicode still needs a verified own activity');
    childPatch={...childPatch,actor:{id:reply,objectType:'person'}};
    const before:number=attempts.length;
    assert.deepEqual(await adapter.perform({...command('remove'),reaction,own}),{status:'failed'});
    assert.equal(attempts.length,before,'Unicode does not weaken the fresh actor check');
    childPatch={object:{objectType:'reaction2',displayName:reaction}};
    assert.deepEqual(await adapter.perform({...command('remove'),reaction,own}),{status:'changed'});
    assert.deepEqual(await adapter.perform({...command('add'),reaction}),{status:'changed'},
      'actual pinned add/encryption/transport/decryption supports a Unicode label offline');
    assert.equal(attempts.at(-1).body.object.displayName,'SYNTHETIC-UNICODE-CIPHERTEXT');
  }
  sdk.internal.encryption.encryptText=encrypt;sdk.internal.encryption.decryptText=decrypt;
  children[0].activity.object.reactions=Array.from('😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚').map(displayName=>({displayName,count:2}));
  const many=await adapter.perform({...command('summary'),details:true});
  assert.ok(validReactionDetails(many),'a larger Unicode vocabulary stays bounded without discarding the whole message snapshot');
  assert.equal(many.snapshot.groups.length,16);assert.equal(many.snapshot.unknown,true);
  assert.ok(many.actors.every(a=>many.snapshot.groups.some(g=>g.reaction===a.reaction)),'truncated details never refer to undisclosed labels');
  const manyOwn=await adapter.perform(command('summary')) as ReactionSnapshot;
  assert.ok(validReactionSnapshot(manyOwn));
  assert.ok(manyOwn.groups.find(g=>g.reaction==='👩🏽‍💻')?.own,'bounded overflow retains freshly verified own types for removal');
  children[0].activity.object.reactions=aggregate;childPatch={};
  for (const patch of [{ roomId:messageId(root) },{ id:messageId(reply) }]) {
    publicPatch=patch; const before:number=attempts.length;
    assert.deepEqual(await adapter.perform(command('add')),{ status:'failed' }); assert.equal(attempts.length,before);
  }
  publicPatch={}; parentPatch={ target:{ id:self } };
  assert.deepEqual(await adapter.perform(command('add')),{ status:'failed' });
  parentPatch={};
  let cases=0;
  for (const next of [
    ...[1400087,1409004,1400049].map(errorCode=>({ status:409,body:{ errorCode,secret:'PRIVATE' } })),
    ...[301,302,303,307,308].map(status=>({ status,headers:{ location:base+'/redirect' } })),
    { headers:{ 'cisco-location':base+'/redirect' } },{ status:404,body:{ code:404100,data:{ siteFullUrl:'PRIVATE' } } },
    ...[400,401,403,404,410,413,415,422,429,500,503].map(status=>({ status })),
    { error:Object.assign(new Error('PRIVATE reset'),{ code:'ECONNRESET' }) },{ body:{} },
    { body:{ id:ack,verb:'add',objectType:'activity',actor:{ id:room },target:{ id:room } } },
  ]) {
    scenario=next; const before:number=attempts.length, result=await adapter.perform(command('add'));
    assert.notEqual((result as any).status,'changed');
    assert.ok(!JSON.stringify(result).includes('PRIVATE')); await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(attempts.length,before+1); assert.equal(c.request,metadataRequest); cases++;
  }
  const last=attempts.at(-1), beforeReplay=attempts.length;
  const Auth=require('@webex/webex-core/dist/interceptors/auth.js').default;
  const Redirect=require('@webex/webex-core/dist/interceptors/redirect.js').default;
  await assert.rejects(new Auth({ webex:sdk }).replay({ ...last }));
  await assert.rejects(new Redirect({ webex:sdk }).onResponse({ ...last },{ headers:{ 'cisco-location':base+'/redirect' } }));
  assert.equal(attempts.length,beforeReplay);
  scenario={ hold:true };
  const slow=new SDKReactions(sdk,35), pending=handled(slow.perform(command('add')));
  await until(()=>attempts.length===beforeReplay+1,'held native attempt');
  assert.equal((await c.request({ method:'GET',url:url+'/activities/'+root })).body.id,root,'the reaction fence never captures unrelated metadata GETs');
  assert.deepEqual(await pending,{ status:'unknown' }); assert.equal(slow.busy(),true);
  await assert.rejects(slow.perform(command('add')));
  lastPrimitive(null,{ statusCode:200,headers:{},body:{} });
  await until(()=>!slow.busy(),'physical settlement');
  assert.equal(attempts.length,beforeReplay+1);
  const messageGet=sdk.messages.get;
  let release!:(value:unknown)=>void;
  sdk.messages.get=(id:string)=>new Promise(resolve=>{ release=resolve; });
  const preparing=new SDKReactions(sdk,35), beforePreparation=attempts.length;
  assert.deepEqual(await preparing.perform(command('add')),{ status:'unknown' });
  assert.equal(preparing.busy(),true,'logical expiry retains stalled preparation');
  await assert.rejects(preparing.perform(command('add')));
  release({ id:messageId(root),roomId:publicRoom });
  await until(()=>!preparing.busy(),'aborted preparation settlement');
  assert.equal(attempts.length,beforePreparation,'late preparation cannot submit after logical timeout');
  sdk.messages.get=messageGet;
  for (const attempt of attempts) {
    assert.equal(attempt.method,'POST'); assert.equal(attempt.uri,url+'/activities');
    for (const key of ['followRedirect','followAllRedirects','shouldRefreshAccessToken','pool','agent','forever']) assert.equal(attempt[key],false,key);
    assert.equal(attempt.maxRedirects,0);
  }
  assert.equal(forbidden,0); assert.equal(registrations,0); assert.equal(refreshes,0);
  const inventory=JSON.parse(await readFile(new URL('research/sdk-inventory.json',import.meta.url),'utf8'));
  for (const [path,hash] of Object.entries(inventory.sha256))
    assert.equal(createHash('sha256').update(await readFile(new URL(path,new URL('../optional/read-status-sdk/',import.meta.url)))).digest('hex'),hash,path);
  console.log('PASS: production reaction adapter '+JSON.stringify({ cases,partialBatchTimeout:true,admissions:attempts.length,nativeIO:forbidden,registrations,refreshes,liveAcceptance:false }));
} catch (error) { console.error(error); process.exitCode=1; }
finally { clearTimeout(deadline); process.exit(process.exitCode ?? 0); }
