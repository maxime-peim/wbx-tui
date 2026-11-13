// Actual pinned core/service/auth/Node transport; only the final HTTP primitive and catalog are synthetic.
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { SDKJoinedMeetings } from '../src/joined-meetings-sdk.js';
import type { JoinedMeetingsSnapshot } from '../src/joined-meetings.js';

net.Socket.prototype.connect = (() => { throw new Error('Network forbidden.'); }) as typeof net.Socket.prototype.connect;
globalThis.fetch = async () => { throw new Error('Fetch forbidden.'); };
const deadline = setTimeout(() => process.exit(2), 10_000);
const require = createRequire(new URL('../optional/read-status-sdk/package.json', import.meta.url));
const primitive = require.resolve('request'); require(primitive);
const requests: any[] = [], snapshots: JoinedMeetingsSnapshot[] = [];
require.cache[primitive]!.exports = (options: any, callback: (error: null, response: unknown) => void) => {
  requests.push(options);
  setImmediate(() => callback(null, { statusCode: 200, headers: {}, body: { loci: [{
    url: 'https://locus.offline.invalid/locus/api/v1/loci/synthetic', fullState: { state: 'ACTIVE' }, info: { topic: 'Pinned SDK call' },
    self: { state: 'JOINED', devices: [{ state: 'JOINED', url: 'https://wdm.offline.invalid/devices/desktop' }] },
  }] } }));
  return new EventEmitter();
};
const { createReadStatusSDK } = await import('../src/read-status-sdk.js');
const sdk = createReadStatusSDK({ token: 'synthetic-never-live', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 }) as any;
sdk.internal.device.url = 'https://wdm.offline.invalid/devices/metadata';
for (const method of ['register', 'unregister']) sdk.internal.device[method] = async () => { throw new Error('Device action forbidden.'); };
sdk.internal.mercury.connect = async () => { throw new Error('Connect forbidden.'); };
const base = 'https://locus.offline.invalid/locus/api/v1';
sdk.internal.services.waitForCatalog = async () => {};
sdk.internal.services.waitForService = async ({ name, url }: { name?: string; url?: string }) => {
  assert.ok(name === 'locus' || url?.startsWith(base) || url === sdk.internal.device.url);
  return url ?? base;
};
sdk.internal.services.getServiceFromUrl = (url: string) => url.startsWith(base) ? { name: 'locus' } : undefined;
sdk.internal.services.replaceHostFromHostmap = (url: string) => url;
if (!sdk.ready) await new Promise<void>(resolve => sdk.on('ready', resolve));
assert.equal(sdk.meetings, undefined, 'the metadata SDK has no meeting plugin');
const discovery = new SDKJoinedMeetings(sdk, value => snapshots.push(value));
discovery.refresh();
for (let i = 0; i < 100 && !snapshots.length; i++) await new Promise<void>(resolve => setImmediate(resolve));
assert.equal(requests.length, 1);
assert.equal(requests[0].method, 'GET'); assert.equal(requests[0].uri, base + '/loci');
assert.equal(requests[0].headers.authorization, 'Bearer synthetic-never-live', 'existing catalog-gated auth is unchanged');
assert.equal(requests[0].shouldRefreshAccessToken, false);
assert.equal(snapshots.at(-1)!.items[0]!.title, 'Pinned SDK call');
for (let i = 0; i < 1000; i++) sdk.internal.mercury.trigger('event:locus', { data: { PRIVATE: 'discarded' } });
assert.equal(requests.length, 1); assert.equal(snapshots.length, 2);
assert.equal(snapshots.at(-1)!.state, 'loading');
discovery.close(); clearTimeout(deadline);
console.log('PASS: actual SDK read-only joined-elsewhere proxy and Mercury hints, no device/meeting/socket actions');
process.exit(0);
