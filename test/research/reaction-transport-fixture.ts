/** RESEARCH ONLY: actual add/delete, prepare/submit, SDK interceptors and
 * http-core Node transport; synthetic catalog/KMS boundary and request primitive.
 * No real account, wire schema, encryption/KMS acceptance or runtime approval. */
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createHmac, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CandidateSlot, installCandidate, type CandidateBinding } from './reaction-boundary-candidate.js';
import { until, handled } from '../async-test.js';

if (process.env.WBX_REACTIONS_RESEARCH_TEST !== '1') throw new Error('Reaction research requires explicit offline opt-in.');
let forbidden = 0, registrations = 0, refreshes = 0, failKey = false, failEncryption = false;
const deny = (): never => { forbidden++; throw new Error('Research native I/O forbidden'); };
net.Socket.prototype.connect = deny;
tls.connect = deny; http.request = deny; https.request = deny;
for (const api of [dns,dns.promises,dns.Resolver.prototype,dns.promises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(api)) {
    if (name === 'lookup' || name === 'lookupService' || name === 'reverse' || name.startsWith('resolve'))
      Object.defineProperty(api,name,{ value:deny });
  }
}
dgram.createSocket = deny;
for (const name of ['send','bind','connect']) Object.defineProperty(dgram.Socket.prototype,name,{ value:deny });
globalThis.fetch = deny;
const deadline = setTimeout(() => { console.error('Reaction research child deadline'); process.exit(2); }, 15_000);
const require = createRequire(new URL('../../optional/read-status-sdk/package.json', import.meta.url));
const primitive = require.resolve('request');
require(primitive);
type Scenario = { name: string; status?: number; headers?: Record<string, string>; body?: unknown; error?: Error; hold?: boolean };
let scenario: Scenario = { name: 'success' }, lastPrimitive!: (error: Error | null, response?: unknown) => void;
const attempts: any[] = [], encryption: any[] = [], keyReads: string[] = [], trace: string[] = [];
require.cache[primitive]!.exports = (options: any, callback: (error: Error | null, response?: unknown) => void) => {
  const copy = { ...options, body: structuredClone(options.body) };
  attempts.push(copy); lastPrimitive = callback;
  const current = scenario;
  if (!current.hold) setImmediate(() => callback(current.error ?? null, current.error ? undefined : {
    statusCode: current.status ?? 200, headers: current.headers ?? {},
    body: current.body ?? { ...structuredClone(copy.body), id: '55555555-5555-4555-8555-555555555555', published: '2026-11-17T00:00:00.000Z' },
  }));
  return new EventEmitter();
};
const room = '11111111-1111-4111-8111-111111111111', root = '22222222-2222-4222-8222-222222222222';
const person = '33333333-3333-4333-8333-333333333333', reply = '44444444-4444-4444-8444-444444444444';
const own = '66666666-6666-4666-8666-666666666666', base = 'https://synthetic.invalid/conversation/api/v1';
const key = { k: 'SYNTHETIC-NOT-A-KEY', kid: 'synthetic-key', kty: 'oct' };
const keyUrl = 'kms://synthetic/key';
const hmac = (parent: string) => createHmac('sha256', parent).update(JSON.stringify(key) + parent + 'heart').digest('hex');
const binding = (action: CandidateBinding['action'], parent = root): CandidateBinding => ({
  action, parent, conversation: room, actor: person, emoji: 'heart', hmac: hmac(parent), ownReaction: own,
  endpoint: `${base}/conversations/${room}/activities`,
});
try {
  const { createReadStatusSDK } = await import('../../src/read-status-sdk.js');
  const sdk = createReadStatusSDK({ token: 'SYNTHETIC-NEVER-LIVE', scope: 'spark:all spark:kms', expiresAt: Date.now() + 60000 }) as any;
  const conversation = sdk.internal.conversation;
  const methods = Object.fromEntries(['addReaction','deleteReaction','sendReaction','prepare','prepareConversation','submit','acknowledge']
    .map(name => [name, conversation[name]]));
  sdk.internal.device.register = async () => { registrations++; throw new Error('Registration forbidden'); };
  sdk.internal.device.unregister = async () => { registrations++; throw new Error('Unregistration forbidden'); };
  sdk.internal.device.userId = person;
  sdk.internal.services.waitForCatalog = async () => {};
  sdk.internal.services.getServiceUrlFromClusterId = () => base;
  sdk.internal.services.getServiceFromUrl = (url: string) => url.startsWith(base) ? { name: 'conversation' } : undefined;
  sdk.internal.services.waitForService = async () => base;
  sdk.internal.services.replaceHostFromHostmap = (url: string) => url;
  sdk.internal.encryption.unboundedStorage.get = async (url: string) => {
    keyReads.push(url); if (failKey) throw new Error('PRIVATE synthetic key failure'); return JSON.stringify({ jwk:key });
  };
  // Preserve actual transform dispatch, not real cryptography/KMS service proof.
  sdk.internal.encryption.encryptText = async (url: string, text: string) => {
    encryption.push({ url, text }); if (failEncryption) throw new Error('PRIVATE synthetic transform failure');
    return 'SYNTHETIC-CIPHERTEXT';
  };
  sdk.internal.encryption.decryptText = async () => 'heart';
  const transform = sdk.applyNamedTransform;
  sdk.applyNamedTransform = function (...args: any[]) {
    trace.push(typeof args[1] === 'string' ? args[1] : args[2]); return transform.apply(this,args);
  };
  Object.defineProperty(sdk.credentials,'canRefresh',{ value:true });
  sdk.credentials.refresh = async () => { refreshes++; throw new Error('Credential refresh forbidden'); };
  await until(() => sdk.ready, 'synthetic SDK readiness');
  const transport = require('@webex/http-core/dist/request/request.js').default;
  const slot = new CandidateSlot(), originalRequest = conversation.request;
  const target = { id:room,url:`${base}/conversations/${room}`,defaultActivityEncryptionKeyUrl:keyUrl,kmsResourceObjectUrl:'kms://synthetic/resource' };
  const send = (action: CandidateBinding['action'], parent = root, actor?: string, recipient?: string) =>
    action === 'add' ? conversation.addReaction(target,'heart',{ id:parent,encryptionKeyUrl:keyUrl },actor,recipient)
      : conversation.deleteReaction(target,own,actor,recipient);
  function checkAttempt(index: number, action: CandidateBinding['action'], parent: string) {
    const value = attempts[index];
    assert.equal(value.method,'POST'); assert.equal(value.uri,binding(action,parent).endpoint);
    assert.equal(value.body.actor.id,person); assert.equal(value.body.target.id,room);
    assert.equal(value.body.verb,action === 'add' ? 'add' : 'delete');
    assert.equal(value.body.recipients,undefined);
    if (action === 'add') {
      assert.equal(value.body.parent.id,parent); assert.equal(value.body.parent.type,'reaction');
      assert.equal(value.body.object.objectType,'reaction2'); assert.equal(value.body.object.hmac,hmac(parent));
      assert.equal(value.body.object.displayName,'SYNTHETIC-CIPHERTEXT');
    } else { assert.equal(value.body.object.id,own); assert.equal(value.body.object.objectType,'activity'); }
    for (const name of ['followRedirect','followAllRedirects','shouldRefreshAccessToken','pool','agent','forever']) assert.equal(value[name],false,name);
    assert.equal(value.maxRedirects,0); assert.equal(value.headers.authorization,'Bearer SYNTHETIC-NEVER-LIVE');
    assert.ok(!value.noTransform && !value.disableTransform);
  }
  const scenarios: Scenario[] = [
    ...[1400087,1409004,1400049].map(errorCode => ({ name:`key-${errorCode}`,status:409,body:{ errorCode,secret:'PRIVATE' } })),
    ...[301,302,303,307,308].map(status => ({ name:`http-${status}`,status,headers:{ location:`${base}/redirected` } })),
    { name:'cisco-location',status:200,headers:{ 'cisco-location':`${base}/redirected` } },
    { name:'Location-case',status:200,headers:{ Location:`${base}/redirected` } },
    { name:'locus-redirect',status:404,body:{ errorCode:2000002,location:`${base}/redirected` } },
    { name:'appapi-redirect',status:404,body:{ code:404100,data:{ siteFullUrl:'redirected.invalid' } } },
    ...[401,403,429,503].map(status => ({ name:`status-${status}`,status })),
    { name:'reset',error:Object.assign(new Error('PRIVATE reset'),{ code:'ECONNRESET' }) },
    { name:'malformed-success',status:200,body:{} },
    { name:'error-in-success',status:200,body:{ errorCode:1400087 } },
  ];
  let cases = 0;
  for (const action of ['add','remove-own'] as const) {
    for (const parent of [root,reply]) {
      const guard = installCandidate(conversation,transport,binding(action,parent),slot,new AbortController().signal);
      try {
        const before = attempts.length;
        await send(action,parent);
        assert.equal(attempts.length,before+1); checkAttempt(before,action,parent);
        await assert.rejects(send(action,parent));
        assert.equal(attempts.length,before+1,'same operation binding cannot submit twice');
      } finally { guard.restore(); }
    }
    for (const next of scenarios) {
      scenario = next;
      const guard = installCandidate(conversation,transport,binding(action),slot,new AbortController().signal);
      try {
        const before = attempts.length;
        await assert.rejects(send(action), (error: any) => {
          assert.equal(error.body,undefined); assert.ok(!String(error).includes('PRIVATE')); return true;
        },next.name);
        // Actual SDK submit callbacks must settle without detached follow-up work.
        assert.equal(slot.busy(),false);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(attempts.length,before+1,`${action}/${next.name}: one Node request primitive admission`);
        checkAttempt(before,action,root); cases++;
      } finally { guard.restore(); }
    }
    scenario = { name:'success' };
    for (const [actor,recipient] of [['forged',undefined],[undefined,'other-recipient']]) {
      const guard = installCandidate(conversation,transport,binding(action),slot,new AbortController().signal);
      try {
        const before = attempts.length;
        await assert.rejects(send(action,root,actor,recipient));
        assert.equal(attempts.length,before,'actor/meeting-recipient overrides never reach the primitive');
      } finally { guard.restore(); }
    }
    const wrongParent = installCandidate(conversation,transport,binding(action,reply),slot,new AbortController().signal);
    try {
      const before = attempts.length;
      if (action === 'add') await assert.rejects(send(action,root));
      else await assert.rejects(conversation.deleteReaction(target,'another-person-reaction'));
      assert.equal(attempts.length,before,'wrong root/reply or reaction identity never reaches transport');
    } finally { wrongParent.restore(); }
  }
  for (const failure of ['key','encryption']) {
    failKey = failure === 'key'; failEncryption = failure === 'encryption';
    const guard = installCandidate(conversation,transport,binding('add'),slot,new AbortController().signal);
    try {
      const before = attempts.length;
      await assert.rejects(send('add'));
      assert.equal(attempts.length,before,`${failure}: preparation admits no mutation transport`);
      assert.equal(slot.busy(),false);
    } finally { guard.restore(); failKey = false; failEncryption = false; }
  }
  // Real SDK interceptor replay methods receive cloned consumed options.
  const last = attempts.at(-1), beforeReplay = attempts.length;
  const Redirect = require('@webex/webex-core/dist/interceptors/redirect.js').default;
  const Auth = require('@webex/webex-core/dist/interceptors/auth.js').default;
  await assert.rejects(new Redirect({ webex:sdk }).onResponse({ ...last },{ headers:{ 'cisco-location':`${base}/redirected` } }));
  await assert.rejects(new Auth({ webex:sdk }).replay({ ...last }));
  await assert.rejects(last.request({ ...last,uri:`${base}/forged` }));
  assert.equal(attempts.length,beforeReplay);
  const aborted = new AbortController(); aborted.abort();
  const never = installCandidate(conversation,transport,binding('add'),slot,aborted.signal);
  try { await assert.rejects(send('add')); assert.equal(attempts.length,beforeReplay); } finally { never.restore(); }
  // Logical abort cannot release the physical slot or authorize replacement.
  scenario = { name:'held',hold:true };
  const abort = new AbortController();
  const guard = installCandidate(conversation,transport,binding('add'),slot,abort.signal);
  const beforeHeld = attempts.length, pending = handled(send('add'));
  await until(() => attempts.length === beforeHeld+1,'held reaction submission');
  abort.abort(); await assert.rejects(pending); guard.restore();
  assert.equal(slot.busy(),true,'aborted physical work still owns admission');
  const replacement = installCandidate(conversation,transport,binding('remove-own'),slot,new AbortController().signal);
  try { await assert.rejects(send('remove-own')); assert.equal(attempts.length,beforeHeld+1); }
  finally { replacement.restore(); }
  lastPrimitive(null,{ statusCode:200,headers:{},body:{} });
  await until(() => !slot.busy(),'native callback cleanup');
  scenario = { name:'success' };
  const fresh = installCandidate(conversation,transport,binding('remove-own'),slot,new AbortController().signal);
  try { await send('remove-own'); assert.equal(attempts.length,beforeHeld+2); }
  finally { fresh.restore(); }
  assert.equal(conversation.request,originalRequest);
  for (const [name,method] of Object.entries(methods)) assert.equal(conversation[name],method,name);
  for (const name of ['normalizeActivity','encryptActivity','encryptAddActivity','encryptReaction2','encryptPropDisplayName','prepareActivityKmsMessage'])
    assert.ok(trace.includes(name),name);
  assert.ok(encryption.length>0); assert.ok(encryption.every(value => value.url===keyUrl && value.text==='heart'));
  assert.ok(keyReads.length>0); assert.ok(keyReads.every(url => url===keyUrl));
  assert.equal(refreshes,0); assert.equal(registrations,0); assert.equal(forbidden,0);
  assert.ok(attempts.every(value => value.method==='POST' && ['add','delete'].includes(value.body.verb)),'no metadata/key/receipt/message request reached the primitive');
  const inventory = JSON.parse(await readFile(new URL('./sdk-inventory.json',import.meta.url),'utf8'));
  const sdkRoot = new URL('../../optional/read-status-sdk/',import.meta.url);
  for (const [path,hash] of Object.entries(inventory.sha256)) assert.equal(createHash('sha256').update(await readFile(new URL(path,sdkRoot))).digest('hex'),hash,path);
  console.log('PASS: research-only reaction transport candidate ' + JSON.stringify({
    failureCases:cases,rootAndReply:true,nativePrimitiveAdmissions:attempts.length,nativeIO:forbidden,registrations,refreshes,
    actualSDKMethods:true,actualInterceptors:true,actualHttpCore:true,syntheticKMS:true,providerSchemaValidated:false,runtimeApproved:false,
  }));
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally { clearTimeout(deadline); process.exit(process.exitCode ?? 0); }
