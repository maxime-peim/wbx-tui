import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings, meetingWorkerArguments } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';
import { OAuthSession, type OAuthSeed } from '../src/oauth.js';
import { SharedOAuthOwner, SharedOAuthClient, openMeetingAuthorization } from '../src/oauth-share.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';

test('connected messaging lends its login to a detached meeting, shares renewal both ways and never opens another browser', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-meeting-auth-'), config = join(directory, 'config.json');
  let authorizations = 0, browsers = 0, grants = 0, shares = 0;
  let owner: SharedOAuthOwner | undefined, adopted: OAuthSession | undefined, meeting: SharedOAuthClient | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    grants++; const fields = new URLSearchParams(String(init?.body));
    assert.equal(fields.get('grant_type'), 'refresh_token'); assert.equal(fields.get('refresh_token'), `PRIVATE-refresh-${grants}`);
    return new Response(JSON.stringify({ access_token: `PRIVATE-access-${grants + 1}`, refresh_token: `PRIVATE-refresh-${grants + 1}`, scope: 'spark:all spark:kms', expires_in: 3600 }), { status: 200 });
  };
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('External network forbidden.'); });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  const engine = new EditorEngine(async () => { browsers++; throw new Error('Second browser forbidden.'); }, undefined, undefined, undefined, {
    create(profile, secret) {
      const seed: OAuthSeed = { config: profile, clientSecret: secret, pair: { token: 'PRIVATE-access-1', refreshToken: 'PRIVATE-refresh-1', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 } };
      adopted = OAuthSession.adopt(seed, { fetch: async () => { throw new Error('Old owner must not POST a copied grant.'); } });
      t.mock.method(adopted, 'authorize', async () => { authorizations++; return { token: seed.pair.token, scope: seed.pair.scope, expiresAt: seed.pair.expiresAt }; });
      return adopted;
    },
    async share(seed) { shares++; owner = await SharedOAuthOwner.open(seed, { fetch: fetcher }); return SharedOAuthClient.open(owner.path); },
  });
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'PRIVATE-secret', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] } }), { mode: 0o600 });
  try {
    await engine.start('live', config);
    const auth = await engine.meetingAuthorization();
    assert.ok(auth); assert.equal(auth.config, config);
    const lease = await openMeetingAuthorization(auth.socket, 'synthetic'); meeting = lease.oauth;
    assert.equal(lease.access.token, 'PRIVATE-access-1'); assert.equal(grants, 0); assert.equal(authorizations, 1); assert.equal(browsers, 0);
    assert.deepEqual(await engine.meetingAuthorization(), auth); assert.equal(shares, 1, 'repeated joins reuse one refresh owner');
    let renewed = 0; const renew = engine.refreshAuth.bind(engine);
    t.mock.method(engine, 'refreshAuth', async () => { await renew(); renewed++; });
    await meeting.refresh();
    for (let i = 0; i < 200 && !renewed; i++) await delay(2);
    assert.equal(renewed, 1, 'meeting-side grant adoption refreshes messaging through the same owner'); assert.equal(grants, 1);
    assert.equal(adopted!['pair'], undefined);
    assert.ok(!JSON.stringify(engine.snapshot()).includes('PRIVATE'), 'editor state never carries access/refresh/secret/socket state');
    await engine.refreshAuth(); assert.equal(grants, 2);
    assert.equal((await meeting.refresh()).token, 'PRIVATE-access-3'); assert.equal(grants, 2, 'SDK adoption of a remote renewal does not rotate a second time');
    engine.stop();
    assert.equal((await meeting.refresh()).token, 'PRIVATE-access-4', 'detached meeting can renew after messaging disconnect');
    assert.equal(grants, 3); assert.equal(authorizations, 1); assert.equal(browsers, 0);
  } finally { engine.stop(); meeting?.close(); await owner?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('restricted grant/account switch and in-progress login never fall back to another interactive meeting authorization', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-meeting-auth-scope-'), config = join(directory, 'config.json');
  let handoffs = 0, browser = 0;
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:rooms_read' }));
  t.mock.method(OAuthSession.prototype, 'handoff', async () => { handoffs++; return '/private/not-started'; });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  const engine = new EditorEngine(async () => { browser++; });
  try {
    await engine.start('live', config);
    await assert.rejects(engine.meetingAuthorization(), /lacks.*meeting authorization/);
    await assert.rejects(engine.meetingAuthorization(join(directory, 'other.json')), /differs/);
    assert.equal(handoffs, 0); assert.equal(browser, 0);
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('meeting requests during messaging login wait rather than launch a competing OAuth flow', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-meeting-auth-pending-'), config = join(directory, 'config.json');
  let entered = false, finish!: () => void;
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => { entered = true; await new Promise<void>(resolve => { finish = resolve; }); return { token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all' }; });
  const engine = new EditorEngine(async () => { assert.fail('No extra sign-in'); });
  const pending = engine.start('live', config);
  try {
    for (let i = 0; i < 200 && !entered; i++) await delay(2);
    assert.ok(entered); await assert.rejects(engine.meetingAuthorization(), /already in progress/);
  } finally { engine.stop(); finish(); await pending; await rm(directory, { recursive: true, force: true }); }
});

test('meeting worker arguments carry only a socket address; RPC cannot request/inject credential leases', async () => {
  const engine = new EditorEngine(), controller = new EditorMeetings(), output: any[] = [];
  const rpc = new EditorRPC(engine, controller, value => output.push(value));
  try {
    assert.equal(await controller.authorization?.(), undefined, 'standalone live join retains its independent explicit login when messaging is not connected');
    const options = { mode: 'live' as const, meeting: 'https://example.webex.com/meet/synthetic', display: 'editor' as const, fallback: 'editor' as const };
    const args = meetingWorkerArguments(options, 'editor', '/private/config.json', { socket: '/tmp/opencode/wbx-oauth-synthetic/access.sock', config: '/private/config.json' });
    assert.deepEqual(args.slice(-2), ['--auth-socket', '/tmp/opencode/wbx-oauth-synthetic/access.sock']); assert.ok(!args.includes('--headless'));
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } }));
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'meeting.start', params: { ...options, authSocket: '/private', token: 'PRIVATE' } }));
    assert.equal(output.at(-1).error.code, -32602); assert.ok(!JSON.stringify(output).includes('PRIVATE'));
  } finally { await rpc.close(); }
});
