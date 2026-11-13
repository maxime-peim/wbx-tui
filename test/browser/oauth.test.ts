import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import type { WorkerEvent } from '../../src/protocol.js';
import { OAuthError } from '../../src/oauth.js';
import { oauthFixture } from '../oauth-fixture.js';

for (const real of [false, true]) test(`OAuth → real Chrome → ${real ? 'ACTUAL pinned SDK credential refresh and messaging plugins' : 'fake SDK'}: renewal keeps one join and changes API credentials; revocation stops media`, {
  skip: process.env.WBX_BROWSER_TEST !== '1' || real && process.env.WBX_SDK_TEST !== '1', timeout: 30_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const f = await oauthFixture(); f.setLifetime(real ? 6 : 3600);
  const credentials = await f.session.authorize(f.open); f.setLifetime(3600);
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: true, live: real });
  host.page.setDefaultTimeout(5000);
  const events: WorkerEvent[] = [], faults: Error[] = [];
  host.on('fault', error => faults.push(error));
  host.on('event', (event: WorkerEvent) => {
    events.push(event);
    if (event.type === 'auth-state' && event.method === 'oauth' && event.state === 'ready' && event.expiresAt) f.session.watch(event.expiresAt,
      () => host.send({ type: 'oauth-renew' }), () => host.send({ type: 'leave' }));
    if (event.type === 'oauth-refresh') void f.session.refresh().then(credentials => host.send({ type: 'oauth-token', requestId: event.requestId, credentials }))
      .catch(error => host.send({ type: 'oauth-failed', requestId: event.requestId, reason: error instanceof OAuthError ? error.reason : 'failed' }));
  });
  const until = async (check: () => boolean | Promise<boolean>, label: string) => {
    for (let i = 0; i < 1000; i++) { if (await check()) return; await delay(10); }
    const sdk = real ? await host.page.evaluate('JSON.stringify({now:Date.now(),ready:window.testActualAuthSDK?.ready, credentialReady:window.testActualAuthSDK?.credentials.ready, canRefresh:window.testActualAuthSDK?.credentials.canRefresh, expires:window.testActualAuthSDK?.credentials.supertoken?.expires, timer:window.testActualAuthSDK?.credentials.refreshTimer, hasCallback:typeof window.testActualAuthSDK?.config.credentials.refreshCallback})') : '';
    throw new Error(`Timed out: ${label}; grants=${f.forms.length}; sdk=${sdk}; auth=${JSON.stringify(events.filter(event => ['auth-state','oauth-refresh','status'].includes(event.type)))}; faults=${faults.map(error => error.message).join(',')}`);
  };
  try {
    if (real) {
      await host.page.setRequestInterception(true);
      host.page.on('request', request => { void (request.url().startsWith(host.origin + '/') ? request.continue() : request.abort()); });
      await host.page.addScriptTag({ url: host.origin + '/sdk.js' });
      await host.page.evaluate('window.testActualFactory = window.Webex');
    }
    for (const file of ['fixture.js', 'chat-fixture.js', 'outgoing-fixture.js', 'oauth-fixture.js']) await host.page.addScriptTag({ content: await readFile(new URL(file, import.meta.url), 'utf8') });
    host.send({ type: 'start', mode: 'live', token: credentials.token, oauth: { expiresAt: credentials.expiresAt, scope: credentials.scope, clientId: f.config.clientId }, meeting: 'https://example.webex.com/meet/test' });
    await until(() => events.some(event => event.type === 'status' && event.state === 'connected'), 'joined fake meeting');
    assert.equal(await host.page.evaluate('JSON.stringify(window.testAuthOptions).includes("synthetic-client-secret")'), false);
    assert.equal(await host.page.evaluate('JSON.stringify(window.testAuthOptions).includes("synthetic-refresh-")'), false);
    assert.equal(await host.page.evaluate('window.testAuthOptions.credentials.refresh_token'), 'owner-managed');
    assert.equal(await host.page.evaluate('window.testCredentialRead()'), 'Bearer synthetic-access-1');
    host.send({ type: 'chat', action: 'rooms', requestId: 'rooms-before-renewal' });
    await until(() => events.some(event => event.type === 'chat-state' && event.chat.rooms.length === 2), 'initial space access');

    if (!real) { host.send({ type: 'oauth-renew' }); host.send({ type: 'oauth-renew' }); }
    // In the real SDK case no manual command is sent: the Node owner timer
    // invokes the actual public SDK refresh() and its configured callback.
    await until(async () => f.forms.length === 2 && await host.page.evaluate('window.testCredentialRead()') === 'Bearer synthetic-access-2', 'renewed credentials adopted without another join');
    assert.equal(f.forms[1]!.get('refresh_token'), 'synthetic-refresh-1');
    host.send({ type: 'chat', action: 'select', roomId: 'space-one', requestId: 'select-after-renewal' });
    await until(() => events.some(event => event.type === 'chat-state' && event.chat.room?.id === 'space-one' && event.chat.state === 'ready'), 'history after renewal');
    host.send({ type: 'chat', action: 'send', roomId: 'space-one', text: 'Synthetic message after renewal', requestId: 'send-after-renewal' });
    await until(() => events.some(event => event.type === 'chat-result' && event.requestId === 'send-after-renewal' && event.status === 'sent'), 'message after renewal');
    if (real) assert.ok(await host.page.evaluate('window.testCredentialReads.includes("Bearer synthetic-access-2")'));
    assert.equal(await host.page.evaluate('window.testJoins'), 1); assert.equal(await host.page.evaluate('window.testCaptureCalls'), 0);
    assert.ok(await host.capture({ source: 'video', width: 80, height: 45, format: 'rgba' }));
    assert.ok(!JSON.stringify(events).includes('synthetic-access-'), 'no access tokens in broker-visible events');

    host.send({ type: 'send', kind: 'camera', enabled: true, requestId: 1 });
    await host.page.waitForFunction(() => document.querySelector('#send-status')?.textContent?.includes('Meeting camera: awaiting.'));
    await host.page.click('#send-camera');
    await host.page.waitForFunction(() => document.querySelector('#send-status')?.textContent?.includes('Meeting camera: on.'));
    f.setMode('denied'); host.send({ type: 'oauth-renew' });
    await until(() => events.some(event => event.type === 'auth-state' && event.state === 'failed'), 'bounded revocation/refresh failure');
    await until(() => events.some(event => event.type === 'status' && event.state === 'ended'), 'authentication failure leaves instead of rejoining');
    assert.ok(await host.page.evaluate('window.testSendingStreams.every(value => value.outputStream.getTracks().every(track => track.readyState === "ended"))'));
    assert.equal(await host.page.evaluate('window.testJoins'), 1); assert.equal(f.forms.length, 3);
    assert.ok(!JSON.stringify(events).includes('private')); assert.equal(faults.length, 0);
  } finally { await host.close(); await f.close(); }
});
