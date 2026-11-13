import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, createServer } from 'node:http';
import { OAuthError, OAuthSession, validateOAuth, AUTHORIZE_URL } from '../src/oauth.js';
import { CredentialRefresh } from '../src/browser/auth.js';
import { parseCommand, parseEvent } from '../src/protocol.js';
import { parseConfig } from '../src/config.js';
import { oauthFixture } from './oauth-fixture.js';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function raw(url: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; text: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers, method }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, text, headers: response.headers }));
    }); request.on('error', reject); request.end();
  });
}
test('OAuth public configuration fails closed for secrets, unsafe redirects, implicit scopes and OIDC assumptions', () => {
  const valid = { clientId: 'public-client', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] };
  validateOAuth(valid); assert.deepEqual(parseConfig({ oauth: valid }).oauth, valid);
  assert.throws(() => validateOAuth({ ...valid, clientSecret: 'private' }));
  assert.deepEqual(parseConfig({ oauth: { ...valid, clientSecret: 'private' } }).oauth, valid, 'private file field is stripped from shared configuration');
  for (const bad of [{ ...valid, clientSecret: '' }, { ...valid, refreshToken: 'never-save' }, { ...valid, scopes: [] },
    { ...valid, scopes: ['openid'] }, { ...valid, scopes: ['spark:rooms_read', 'spark:rooms_read'] },
    ...['http://localhost:53682/oauth/callback', 'https://remote.test/oauth/callback', 'http://0.0.0.0:53682/oauth/callback',
      'http://127.0.0.1:80/oauth/callback', 'http://127.0.0.1:53682/oauth/callback?next=evil', 'http://127.0.0.1:53682/oauth/callback#x'].map(redirectUri => ({ ...valid, redirectUri }))]) {
    assert.throws(() => validateOAuth(bad)); assert.throws(() => parseConfig({ oauth: bad }));
  }
});
test('real loopback OAuth uses S256/state/exact redirect, guards host/path/method/duplicates, and exchanges one code without exposing tokens', async () => {
  const f = await oauthFixture();
  try {
    const access = await f.session.authorize(async url => {
      const auth = new URL(url); assert.equal(auth.origin + auth.pathname, AUTHORIZE_URL);
      assert.equal(auth.searchParams.get('response_type'), 'code'); assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(auth.searchParams.get('redirect_uri'), f.config.redirectUri);
      assert.ok(!url.includes('secret')); assert.ok(!url.includes('code_verifier'));
      f.setChallenge(auth.searchParams.get('code_challenge')!);
      const callback = `${f.config.redirectUri}?code=synthetic-code&state=${auth.searchParams.get('state')}`;
      assert.equal((await raw(callback, { Host: 'evil.example' })).status, 403);
      assert.equal((await raw(callback, {}, 'POST')).status, 403);
      assert.equal((await raw(callback.replace('/oauth/callback?', '/wrong?'))).status, 404);
      assert.equal((await raw(callback.replace(/state=.*/, 'state=wrong'))).status, 403);
      assert.equal((await raw(callback.replace(/state=.*/, 'state=' + '世'.repeat(43)))).status, 403);
      assert.equal((await raw(callback + '&state=duplicate')).status, 403);
      assert.equal((await raw(callback + '&code=duplicate')).status, 400);
      const response = await raw(callback);
      assert.equal(response.status, 200); assert.match(String(response.headers['cache-control']), /no-store/);
      assert.equal(response.headers['referrer-policy'], 'no-referrer'); assert.ok(!response.text.includes('synthetic-code'));
      assert.ok(!response.text.includes('access_token'));
    });
    assert.equal(access.token, 'synthetic-access-1'); assert.ok(access.expiresAt > Date.now());
    assert.deepEqual(Object.keys(access).sort(), ['expiresAt', 'scope', 'token']);
    assert.equal(f.forms.length, 1); assert.equal(f.forms[0]!.get('code'), 'synthetic-code');
    await assert.rejects(f.session.authorize(f.open), /cannot be reused/);
    await assert.rejects(fetch(f.config.redirectUri), 'listener is gone after login');
  } finally { await f.close(); }
});
test('renewal coalesces concurrent requests, rotates refresh tokens and conservatively retains omitted refresh expiry', async () => {
  const f = await oauthFixture();
  try {
    await f.session.authorize(f.open);
    const a = f.session.refresh(), b = f.session.refresh(); assert.equal(a, b);
    const refreshed = await a; assert.equal(refreshed.token, 'synthetic-access-2'); assert.equal(f.forms.length, 2);
    assert.equal(f.forms[1]!.get('refresh_token'), 'synthetic-refresh-1');
    f.setMode('retain-refresh'); await f.session.refresh(); await f.session.refresh();
    assert.equal(f.forms[2]!.get('refresh_token'), 'synthetic-refresh-2'); assert.equal(f.forms[3]!.get('refresh_token'), 'synthetic-refresh-2');
    assert.ok(f.forms.every(form => !form.has('access_token')));
  } finally { await f.close(); }
});
test('accepted OAuth callbacks cannot be replayed while the token exchange is still in flight', async () => {
  const f = await oauthFixture(); f.setMode('held'); const statuses: number[] = [];
  try {
    await f.session.authorize(async url => {
      const auth = new URL(url); f.setChallenge(auth.searchParams.get('code_challenge')!);
      const callback = `${f.config.redirectUri}?code=synthetic-code&state=${auth.searchParams.get('state')}`;
      statuses.push((await raw(callback)).status);
      while (f.forms.length < 1) await tick();
      statuses.push((await raw(callback)).status);
      f.setMode('ok'); f.release();
    });
    assert.deepEqual(statuses, [200, 409]); assert.equal(f.forms.length, 1);
  } finally { await f.close(); }
});
test('denial, token endpoint rejection/redirect/oversize, timeout, cancellation and port collisions are bounded and leave no listener', async () => {
  const denied = await oauthFixture();
  try {
    await assert.rejects(denied.session.authorize(async url => {
      const callback = new URL(denied.config.redirectUri); callback.searchParams.set('state', new URL(url).searchParams.get('state')!);
      callback.searchParams.set('error', 'access_denied'); callback.searchParams.set('error_description', 'private details');
      await fetch(callback).catch(() => {});
    }), error => error instanceof OAuthError && error.reason === 'denied' && !error.message.includes('private'));
    assert.equal(denied.forms.length, 0);
  } finally { await denied.close(); }
  for (const mode of ['denied', 'redirect', 'oversized']) {
    const f = await oauthFixture(); f.setMode(mode);
    try { await assert.rejects(f.session.authorize(f.open), error => error instanceof OAuthError && !/private|synthetic-client-secret/.test(error.message)); }
    finally { await f.close(); }
  }
  const timeout = await oauthFixture({ loginTimeoutMs: 15 });
  try { await assert.rejects(timeout.session.authorize(async () => {}), /canceled or timed out/); await assert.rejects(fetch(timeout.config.redirectUri)); }
  finally { await timeout.close(); }
  const canceled = await oauthFixture(), abort = new AbortController();
  try { await assert.rejects(canceled.session.authorize(async () => { abort.abort(); }, abort.signal), /canceled/); await assert.rejects(fetch(canceled.config.redirectUri)); }
  finally { await canceled.close(); }
  const collision = await oauthFixture(), occupied = createServer();
  await new Promise<void>(resolve => occupied.listen(Number(new URL(collision.config.redirectUri).port), '127.0.0.1', resolve));
  try { await assert.rejects(collision.session.authorize(async () => assert.fail('must not navigate')), /port unavailable/); }
  finally { await collision.close(); await new Promise<void>(resolve => occupied.close(() => resolve())); }
});
test('refresh failure is not replayed, expired refresh grants never POST, and close aborts a pending native renewal', async () => {
  const f = await oauthFixture();
  try {
    await f.session.authorize(f.open); f.setMode('denied');
    await assert.rejects(f.session.refresh(), error => error instanceof OAuthError && error.reason === 'denied');
    await assert.rejects(f.session.refresh()); assert.equal(f.forms.length, 2, 'no grant retry after uncertain/rejected refresh');
  } finally { await f.close(); }
  let now = Date.now(); const expired = await oauthFixture({ now: () => now });
  try {
    await expired.session.authorize(expired.open); now += 86400_001;
    await assert.rejects(expired.session.refresh(), error => error instanceof OAuthError && error.reason === 'expired'); assert.equal(expired.forms.length, 1);
  } finally { await expired.close(); }
  const held = await oauthFixture();
  try {
    await held.session.authorize(held.open); held.setMode('held'); const pending = held.session.refresh();
    void pending.catch(() => {});
    while (held.forms.length < 2) await tick(); held.session.close(); await assert.rejects(pending);
    held.setMode('ok'); held.release(); await assert.rejects(held.session.refresh());
  } finally { await held.close(); }
});
test('owner proactively requests renewal and expires the call if fresh credentials are not acknowledged by the SDK', async t => {
  let now = Date.now(); const f = await oauthFixture({ now: () => now }); f.setLifetime(1);
  let renewal: Promise<unknown> | undefined, requests = 0;
  try {
    const access = await f.session.authorize(f.open); f.setLifetime(3600); now = access.expiresAt - 100;
    // Test the exact renewal/expiry boundary, not whether real loopback I/O
    // happens to finish inside 20 ms under concurrent build/test load.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let clock = 0, reason = '';
    t.mock.method(performance, 'now', () => clock);
    f.session.watch(access.expiresAt, () => {
      requests++; renewal = f.session.refresh(); void renewal.catch(() => {});
    }, value => { reason = value; });
    clock = 80; t.mock.timers.tick(80);
    assert.equal(requests, 1);
    await renewal;
    assert.equal(reason, '', 'a successful grant alone does not move the unacknowledged SDK expiry');
    clock = 100; t.mock.timers.tick(20);
    assert.equal(requests, 1); assert.equal(f.forms.length, 2); assert.equal(reason, 'expired');
    await assert.rejects(f.session.refresh(), 'successful Node grant alone cannot extend an unacknowledged SDK token');
  } finally { await f.close(); }
});
test('browser refresh bridge is one-flight, rejects stale responses, and cancels on close without exposing refresh credentials', async () => {
  const requests: number[] = [], errors: string[] = [];
  const bridge = new CredentialRefresh(id => requests.push(id), reason => errors.push(reason), 100);
  const a = bridge.refresh(), b = bridge.refresh(); assert.equal(a, b); assert.deepEqual(requests, [1]);
  bridge.receive({ type: 'oauth-token', requestId: 99, credentials: { token: 'stale', expiresAt: Date.now() + 10000, scope: '' } });
  bridge.receive({ type: 'oauth-token', requestId: 1, credentials: { token: 'renewed', expiresAt: Date.now() + 10000, scope: '' } });
  assert.equal((await a).token, 'renewed'); const pending = bridge.refresh(); bridge.close(); await assert.rejects(pending); assert.equal(errors.length, 0);
  const fail = new CredentialRefresh(() => {}, reason => errors.push(reason), 10);
  await assert.rejects(fail.refresh(), /sign in again/); assert.deepEqual(errors, ['failed']); fail.close();
});
test('auth protocol refuses secret-bearing metadata/events and validates refresh IDs/expiries', () => {
  const start = { type: 'start', mode: 'live', token: 'synthetic-token', meeting: 'https://example.webex.com/meet/test', oauth: { expiresAt: Date.now() + 10000, scope: 'spark:all', clientId: 'synthetic-client' } };
  assert.equal(parseCommand(JSON.stringify(start)).type, 'start');
  assert.equal(parseEvent('{"type":"oauth-refresh","requestId":1}').type, 'oauth-refresh');
  for (const oauth of [{ ...start.oauth, clientSecret: 'no' }, { ...start.oauth, refresh_token: 'no' }, { ...start.oauth, expiresAt: Infinity }]) assert.throws(() => parseCommand(JSON.stringify({ ...start, oauth })));
  assert.throws(() => parseEvent('{"type":"oauth-refresh","requestId":0}'));
  assert.throws(() => parseEvent('{"type":"auth-state","method":"oauth","state":"ready","token":"never-broadcast"}'));
  assert.throws(() => parseCommand('{"type":"oauth-token","requestId":1,"credentials":{"token":"a","expiresAt":10,"scope":"","refresh_token":"no"}}'));
});
