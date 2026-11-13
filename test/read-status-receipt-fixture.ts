// Network-forbidden regression derived from wbx-receipt-replay.mtalNG/repro.mjs.
// Unlike the original reproduction, keep prepare, submit, the adapter request,
// SDK interceptors AND the Node transport real. Only its final request primitive
// and service-catalog data are synthetic. Never contact Webex or any other host.
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

let sockets = 0;
(net.Socket.prototype as any).connect = () => { sockets++; throw new Error('All sockets forbidden in receipt fixture.'); };
globalThis.fetch = async () => { sockets++; throw new Error('Fetch forbidden in receipt fixture.'); };
const deadline = setTimeout(() => { console.error('Receipt fixture deadline.'); process.exit(2); }, 10_000);
const require = createRequire(new URL('../optional/read-status-sdk/package.json', import.meta.url));
const primitive = require.resolve('request');
require(primitive);
type Scenario = { name: string; status?: number; headers?: Record<string, string>; body?: unknown; error?: Error; hang?: boolean };
let scenario: Scenario = { name: 'success', status: 200 };
const attempts: any[] = [];
require.cache[primitive]!.exports = (options: any, callback: (error: Error | null, response?: unknown) => void) => {
  attempts.push({ ...options, body: structuredClone(options.body) });
  if (!scenario.hang) {
    const current = scenario;
    setImmediate(() => callback(current.error ?? null, current.error ? undefined : {
      statusCode: current.status ?? 200, headers: current.headers ?? {}, body: current.body ?? activity(),
    }));
  }
  return new EventEmitter();
};
const room = '11111111-1111-4111-8111-111111111111', message = '22222222-2222-4222-8222-222222222222';
const person = '33333333-3333-4333-8333-333333333333', org = '44444444-4444-4444-8444-444444444444';
const base = 'https://offline.invalid/conversation/api/v1';
const hydra = (type: string, id: string) => Buffer.from(`ciscospark://us/${type}/${id}`).toString('base64');
function activity() {
  return { objectType: 'activity', verb: 'acknowledge', object: { objectType: 'activity', id: message },
    target: { objectType: 'conversation', id: room, tags: [] }, actor: { objectType: 'person', entryUUID: person, orgId: org },
    published: '2026-11-09T12:00:00.000Z' };
}

try {
  const { createReadStatusSDK } = await import('../src/read-status-sdk.js');
  const sdk = createReadStatusSDK({ token: 'synthetic-never-live', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' }) as any;
  const conversation = sdk.internal.conversation;
  const acknowledge = conversation.acknowledge, submit = conversation.submit, prepare = conversation.prepare;
  const prepareConversation = conversation.prepareConversation, updateLastSeen = sdk.memberships.updateLastSeen;
  sdk.internal.services.waitForCatalog = async () => {};
  sdk.internal.services.getServiceUrlFromClusterId = () => base;
  sdk.internal.services.getServiceFromUrl = (url: string) => url.startsWith(base) ? { name: 'conversation' } : undefined;
  sdk.internal.services.waitForService = async () => base;
  sdk.internal.services.replaceHostFromHostmap = (url: string) => url;
  sdk.internal.device.userId = person;
  if (!sdk.ready) await new Promise<void>(resolve => sdk.on('ready', resolve));
  let refreshes = 0;
  Object.defineProperty(sdk.credentials, 'canRefresh', { value: true });
  sdk.credentials.refresh = async () => { refreshes++; throw new Error('Authorization refresh forbidden.'); };
  const trace: string[] = [], transform = sdk.applyNamedTransform;
  sdk.applyNamedTransform = function (...args: any[]) {
    trace.push(typeof args[1] === 'string' ? args[1] : args[2]);
    return transform.apply(this, args);
  };
  const receipt = () => sdk.memberships.updateLastSeen({ roomId: hydra('ROOM', room), id: hydra('MESSAGE', message) });
  const turn = () => new Promise<void>(resolve => setImmediate(resolve));
  function checkAttempt(index: number) {
    const post = attempts[index]!;
    assert.equal(post.method, 'POST'); assert.equal(post.uri, `${base}/conversations/${room}/activities`);
    assert.equal(post.body.verb, 'acknowledge'); assert.equal(post.body.object.id, message);
    assert.equal(post.body.objectType, 'activity'); assert.equal(post.body.target.objectType, 'conversation');
    assert.equal(post.body.actor.id, person); assert.equal(post.body.actor.objectType, 'person');
    assert.match(post.body.clientTempId, /^[0-9a-f-]{36}$/); assert.deepEqual(post.qs, { personRefresh: true });
    assert.equal(post.headers.authorization, 'Bearer synthetic-never-live', 'the normal catalog-validated SDK auth path is retained');
    assert.equal(post.followRedirect, false); assert.equal(post.followAllRedirects, false); assert.equal(post.maxRedirects, 0);
    assert.equal(post.shouldRefreshAccessToken, false); assert.equal(post.pool, false); assert.equal(post.agent, false); assert.equal(post.forever, false);
    assert.ok(!post.noTransform && !post.disableTransform, 'never bypass SDK normalization/encryption');
  }
  const result = await receipt();
  assert.equal(result.lastSeenId, hydra('MESSAGE', message)); assert.equal(attempts.length, 1); checkAttempt(0);
  assert.ok(trace.includes('normalizeActivity')); assert.ok(trace.includes('encryptActivity'));
  assert.ok(trace.includes('encryptAcknowledgeActivity')); assert.ok(trace.includes('prepareActivityKmsMessage'));
  assert.ok(trace.includes('encryptKmsMessage'), 'actual SDK encryption dispatch runs, even for an acknowledgement with no encrypted text');

  const scenarios: Scenario[] = [
    ...[1400087, 1409004, 1400049].map(errorCode => ({ name: `key-${errorCode}`, status: 409, body: { errorCode } })),
    ...[301, 302, 303, 307, 308].map(status => ({ name: `http-${status}`, status, headers: { location: `${base}/redirected` } })),
    { name: 'cisco-location', status: 200, headers: { 'cisco-location': `${base}/redirected` } },
    { name: 'locus-redirect', status: 404, body: { errorCode: 2000002, location: `${base}/redirected` } },
    { name: 'appapi-redirect', status: 404, body: { code: 404100, data: { siteFullUrl: 'redirected.invalid' } } },
    { name: 'authorization', status: 401 }, { name: 'denied', status: 403 }, { name: 'rate-limit', status: 429 },
    { name: 'service', status: 503 }, { name: 'uncertain-reset', error: Object.assign(new Error('PRIVATE reset'), { code: 'ECONNRESET' }) },
    { name: 'malformed-success', status: 200, body: {} },
    { name: 'success-with-error', status: 200, body: { errorCode: 1400087 } },
  ];
  for (const next of scenarios) {
    scenario = next;
    const before: number = attempts.length;
    await assert.rejects(receipt(), next.name);
    // Drain detached promise handlers: none may submit again or fetch rotation
    // keys, even after the public receipt promise has already rejected.
    await turn(); await turn();
    assert.equal(attempts.length, before + 1, `${next.name}: exactly one actual transport submission`);
    checkAttempt(before);
  }

  // Even an explicit late replay through the REAL SDK redirect/auth replay
  // methods retains the consumed native closure. This exercises cloned options
  // below conversation.request, not a mocked public acknowledgement method.
  const last = attempts.at(-1)!;
  const Redirect = require('@webex/webex-core/dist/interceptors/redirect.js').default;
  const Auth = require('@webex/webex-core/dist/interceptors/auth.js').default;
  const beforeReplay = attempts.length;
  await assert.rejects(new Redirect({ webex: sdk }).onResponse({ ...last }, { headers: { 'cisco-location': `${base}/redirected` } }));
  await assert.rejects(new Auth({ webex: sdk }).replay({ ...last }));
  assert.equal(attempts.length, beforeReplay, 'replayed option clones never reach the Node transport twice');
  assert.equal(refreshes, 0);

  scenario = { name: 'metadata', status: 200 };
  await conversation.acknowledge({ id: room, url: `${base}/conversations/${room}`, defaultActivityEncryptionKeyUrl: 'kms://synthetic/key',
    kmsResourceObjectUrl: 'kms://synthetic/resource', privateField: 'PRIVATE' }, { id: message, privateField: 'PRIVATE' }, { id: 'synthetic-activity' });
  const metadata = attempts.at(-1)!.body;
  assert.equal(metadata.id, 'synthetic-activity');
  assert.equal(metadata.target.defaultActivityEncryptionKeyUrl, 'kms://synthetic/key');
  assert.equal(metadata.target.kmsResourceObjectUrl, 'kms://synthetic/resource');
  assert.ok(!JSON.stringify(metadata).includes('PRIVATE'), 'real prepareConversation retains only permitted target metadata');

  const failTransform = { name: 'encryptAcknowledgeActivity', direction: 'outbound', fn: () => { throw new Error('PRIVATE encryption failure'); } };
  sdk.config.payloadTransformer.transforms.push(failTransform);
  const beforeEncryptionFailure = attempts.length;
  await assert.rejects(receipt(), /nothing was retried/);
  assert.equal(attempts.length, beforeEncryptionFailure, 'failed actual encryption dispatch admits no transport');
  sdk.config.payloadTransformer.transforms.splice(sdk.config.payloadTransformer.transforms.indexOf(failTransform), 1);

  scenario = { name: 'never-settling', hang: true };
  let settled = false;
  void receipt().then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(settled, false);
  const hungAttempts = attempts.length, hung = attempts.at(-1)!;
  await assert.rejects(hung.request({ ...hung }));
  assert.equal(attempts.length, hungAttempts, 'a pending native operation cannot be replayed either');

  for (const name of ['webex-core', 'http-core', 'internal-plugin-conversation', 'internal-plugin-encryption', 'plugin-memberships']) {
    const manifest = require(`@webex/${name}/package.json`), version = manifest.version;
    manifest.version = 'unreviewed';
    assert.throws(() => createReadStatusSDK({ token: 'synthetic', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' }), /Unsupported/);
    manifest.version = version;
  }
  assert.equal(conversation.acknowledge, acknowledge); assert.equal(conversation.submit, submit);
  assert.equal(conversation.prepare, prepare); assert.equal(conversation.prepareConversation, prepareConversation);
  assert.equal(sdk.memberships.updateLastSeen, updateLastSeen);
  assert.equal(sockets, 0);
  console.log(`PASS: actual SDK one-shot receipt chain; ${scenarios.length} failure/redirect/rotation cases, encryption and replay guards; sockets=${sockets}`);
  clearTimeout(deadline); process.exit(0);
} catch (error) {
  console.error(error); clearTimeout(deadline); process.exit(1);
}
