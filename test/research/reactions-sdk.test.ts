/** Opt-in RESEARCH ONLY: actual pinned internals, synthetic keys and blocked native I/O.
 * Never imported by src/, normal workers, editor RPC or meeting owners. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { createRequire } from 'node:module';
import { createHmac, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReadStatusSDK } from '../../src/read-status-sdk.js';

test('research: actual pinned SDK reaction preparation, summaries, identity hazards and detached replay characterization; no native I/O', {
  skip: process.env.WBX_REACTIONS_RESEARCH_TEST !== '1',
}, async t => {
  let forbidden = 0, registrations = 0;
  const deny = (): never => { forbidden++; throw new Error('RESEARCH NATIVE I/O FORBIDDEN'); };
  t.mock.method(net.Socket.prototype, 'connect', deny);
  t.mock.method(tls, 'connect', deny);
  t.mock.method(http, 'request', deny);
  t.mock.method(https, 'request', deny);
  t.mock.method(dns, 'lookup', deny);
  t.mock.method(globalThis, 'fetch', deny);
  const require = createRequire(new URL('../../optional/read-status-sdk/package.json', import.meta.url));
  const sdk = createReadStatusSDK({ token: 'SYNTHETIC-NOT-A-TOKEN', scope: 'spark:all', expiresAt: Date.now() + 60000 });
  t.mock.method(sdk.internal.device, 'register', async () => { registrations++; throw new Error('REGISTER FORBIDDEN'); });
  t.mock.method(sdk.internal.device, 'unregister', async () => { registrations++; throw new Error('UNREGISTER FORBIDDEN'); });
  const convo = sdk.internal.conversation as any;
  const key = { k: 'SYNTHETIC-NOT-A-KEY', kid: 'synthetic-key', kty: 'oct' };
  let keyReads = 0;
  convo.webex.internal.encryption.unboundedStorage.get = async (url: string) => {
    keyReads++; assert.equal(url, 'https://synthetic.invalid/key');
    return JSON.stringify({ jwk: { kty: key.kty, k: key.k, kid: key.kid } });
  };
  const parent = { id: 'root-activity', encryptionKeyUrl: 'https://synthetic.invalid/key' };
  const expected = createHmac('sha256', parent.id)
    .update(JSON.stringify({ k: key.k, kid: key.kid, kty: key.kty }) + parent.id + 'heart').digest('hex');
  assert.equal(await convo.createReactionHmac('heart', parent), expected);
  assert.equal(await convo.createReactionHmac('heart', parent), expected);
  const reply = { ...parent, id: 'reply-activity', parent: { id: parent.id, type: 'reply' } };
  assert.notEqual(await convo.createReactionHmac('heart', reply), expected, 'reply identity cannot be replaced by thread root');
  const outgoing: any[] = [], originalSend = convo.sendReaction.bind(convo);
  convo.sendReaction = async (_: unknown, payload: unknown) => { outgoing.push(structuredClone(payload)); return { id: 'synthetic-reaction' }; };
  const room = { id: 'conversation', url: 'https://synthetic.invalid/conversation' };
  await convo.addReaction(room, 'heart', parent, 'untrusted-caller-actor');
  await convo.addReaction(room, 'heart', reply, 'untrusted-caller-actor');
  await convo.deleteReaction(room, 'exact-own-reaction', 'untrusted-caller-actor');
  assert.equal(outgoing[0].actor.id, 'untrusted-caller-actor', 'internal override is a hazard, not an approved editor field');
  assert.equal(outgoing[0].object.hmac, expected);
  assert.deepEqual(outgoing[0].parent, { type: 'reaction', id: parent.id });
  assert.equal(outgoing[1].parent.id, reply.id);
  assert.equal(outgoing[2].verb, 'delete');
  assert.deepEqual(outgoing[2].object, { id: 'exact-own-reaction', objectType: 'activity' });
  await convo.addReaction(room, 'not-a-validated-service-emoji', parent, 'untrusted-caller-actor');
  assert.equal(outgoing[3].object.displayName, 'not-a-validated-service-emoji', 'SDK does not validate the vocabulary comment');

  const originalSubmit = convo.submit.bind(convo);
  let prepared = 0, submitted = 0;
  convo.getConvoUrl = (value: any) => value.url;
  convo.prepareConversation = (value: any) => ({ id: value.id, url: value.url, objectType: 'conversation' });
  convo.prepare = async (activity: any, options: any) => { prepared++; assert.equal(options.target.id, room.id); return activity; };
  convo.submit = async (activity: any) => { submitted++; return activity; };
  await originalSend(room, outgoing[0]);
  assert.equal(prepared, 1); assert.equal(submitted, 1);

  const children = [{ type: 'reactionSummary', id: 'summary' }, { type: 'reactionSelfSummary', id: 'self-summary' }, { type: 'other' }];
  let reads = 0;
  convo.request = async (options: any) => {
    reads++; assert.equal(options.method, 'GET');
    assert.equal(options.url, room.url + '/activities/' + parent.id);
    return { body: { children } };
  };
  assert.deepEqual(await convo.getReactionSummaryByParentId(room.url, parent.id, {}), children.slice(0, 2));
  assert.equal(reads, 1);
  // No real count/own-ID schema is asserted: pinned unit samples contain only
  // type tags. Treat missing children and malformed shapes separately.
  convo.request = async () => ({ body: {} });
  assert.deepEqual(await convo.getReactionSummaryByParentId(room.url, parent.id, {}), []);
  convo.request = async () => ({ body: { children: {} } });
  await assert.rejects(convo.getReactionSummaryByParentId(room.url, parent.id, {}));
  const activities = require('@webex/internal-plugin-conversation/dist/activities.js');
  assert.equal(activities.getActivityType({ verb: 'add', parent: { type: 'reaction', id: parent.id } }), 'REACTION');
  assert.equal(activities.getActivityType({ type: 'reactionSelfSummary' }), 'REACTION_SELF');
  assert.equal(activities.getActivityType({ verb: 'delete', object: { id: 'exact-own-reaction' } }), 'DELETE', 'delete requires separate exact-reaction mapping');

  // Actual submit's detached key-rotation branches, stubbed at request boundary.
  // "writes" here are stub invocations, NOT transport/service submissions.
  const constants = require('@webex/internal-plugin-conversation/dist/constants.js');
  let keyGets = 0;
  Object.defineProperty(convo.webex, 'request', { configurable: true, value: async () => {
    keyGets++; return { body: { defaultActivityEncryptionkeyUrl: 'synthetic-key-url' } };
  } });
  for (const code of [constants.KEY_ROTATION_REQUIRED, constants.KEY_ALREADY_ROTATED, constants.ENCRYPTION_KEY_URL_MISMATCH]) {
    let writes = 0; keyGets = 0;
    convo.request = async (options: any) => {
      assert.equal(options.method, 'POST'); writes++;
      if (writes === 1) throw { body: { errorCode: code } };
      return { body: { id: 'second-stub' } };
    };
    const result = await originalSubmit({ ...outgoing[0], target: { ...room } });
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(result, undefined, 'detached branch is not a truthful final write acknowledgment');
    assert.equal(writes, 2, 'existing receipt-only fence does not protect add/delete reactions');
    assert.equal(keyGets, code === constants.KEY_ROTATION_REQUIRED ? 0 : 1);
  }
  assert.ok(keyReads >= 5);
  assert.equal(registrations, 0); assert.equal(forbidden, 0);
  const versions: Record<string, string> = {};
  for (const name of ['internal-plugin-conversation', 'internal-plugin-encryption', 'internal-plugin-device', 'internal-plugin-mercury', 'webex-core', 'http-core', 'plugin-messages']) {
    versions['@webex/' + name] = require('@webex/' + name + '/package.json').version;
    assert.equal(versions['@webex/' + name], '3.13.0');
  }
  assert.equal(require('request/package.json').version, '2.88.2');
  t.diagnostic(JSON.stringify({ researchOnly: true, nativeIO: forbidden, registrations,
    versions, lockSHA256: createHash('sha256').update(await readFile(new URL('../../optional/read-status-sdk/package-lock.json', import.meta.url))).digest('hex') }));
});
