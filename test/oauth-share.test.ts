import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { OAuthSession, type OAuthSeed } from '../src/oauth.js';
import { SharedOAuthClient, SharedOAuthOwner, startSharedOAuth } from '../src/oauth-share.js';
import { buildArtifacts } from '../scripts/build.js';

function seed(): OAuthSeed {
  return { config: { clientId: 'synthetic-client', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] },
    clientSecret: 'PRIVATE-secret-canary', pair: { token: 'PRIVATE-access-1', refreshToken: 'PRIVATE-refresh-1', expiresAt: Date.now() + 3600_000,
      refreshExpiresAt: Date.now() + 86400_000, scope: 'spark:all spark:kms' } };
}
function transport() {
  const forms: URLSearchParams[] = [];
  let release: (() => void) | undefined, held = false, denied = false;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    forms.push(new URLSearchParams(String(init?.body)));
    if (held) await new Promise<void>(done => { release = done; });
    if (denied) return new Response('PRIVATE-denial-details', { status: 400 });
    return new Response(JSON.stringify({ access_token: `PRIVATE-access-${forms.length + 1}`, refresh_token: `PRIVATE-refresh-${forms.length + 1}`,
      expires_in: 3600, refresh_token_expires_in: 86400, scope: 'spark:all spark:kms' }), { status: 200 });
  };
  return { forms, fetcher: fetcher as typeof fetch, hold() { held = true; }, deny() { denied = true; }, release() { held = false; release?.(); } };
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(2); }
  assert.ok(predicate(), 'bounded local operation settled');
}

test('private authorization owner writes only a protected socket, shares access only, and coalesces rotated grants', async () => {
  const t = transport(), owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher });
  let editor: SharedOAuthClient | undefined, meeting: SharedOAuthClient | undefined;
  try {
    assert.equal((await lstat(owner.path)).mode & 0o077, 0); assert.equal((await lstat(dirname(owner.path))).mode & 0o077, 0);
    assert.deepEqual(await readdir(dirname(owner.path)), ['access.sock'], 'no token/secret/refresh file exists');
    editor = await SharedOAuthClient.open(owner.path); meeting = await SharedOAuthClient.open(owner.path);
    const a = await editor.access(), b = await meeting.access();
    assert.equal(a.token, 'PRIVATE-access-1'); assert.deepEqual(a, b);
    assert.deepEqual(Object.keys(a).sort(), ['expiresAt', 'scope', 'token']); assert.equal(t.forms.length, 0, 'sharing does not authorize or refresh');
    t.hold(); const first = editor.refresh(), second = meeting.refresh();
    await until(() => t.forms.length === 1); t.release();
    const [one, two] = await Promise.all([first, second]);
    assert.equal(one.token, 'PRIVATE-access-2'); assert.deepEqual(one, two); assert.equal(t.forms.length, 1);
    assert.equal(t.forms[0]!.get('refresh_token'), 'PRIVATE-refresh-1');
    assert.ok(!t.forms[0]!.has('code'), 'no authorization-code flow was repeated');
    await editor.refresh();
    assert.equal(t.forms[1]!.get('refresh_token'), 'PRIVATE-refresh-2', 'only the detached owner follows refresh rotation');
  } finally { editor?.close(); meeting?.close(); await owner.close(); }
});

test('another client renewal notifies the editor; consuming that update does not rotate twice', async () => {
  const t = transport(), owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher });
  const editor = await SharedOAuthClient.open(owner.path), meeting = await SharedOAuthClient.open(owner.path);
  let notifications = 0;
  editor.onAccess = () => { notifications++; };
  try {
    await meeting.refresh(); await until(() => notifications === 1);
    assert.equal((await editor.refresh()).token, 'PRIVATE-access-2');
    assert.equal(t.forms.length, 1, 'one shared renewal serves both independent consumers');
    await editor.refresh(); assert.equal(t.forms.length, 2, 'a later genuine renewal is not skipped forever');
  } finally { editor.close(); meeting.close(); await owner.close(); }
});

test('editor detach leaves meeting renewal alive; the final lease closes and removes its private directory', async () => {
  const t = transport(), owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher }, 30);
  const editor = await SharedOAuthClient.open(owner.path), meeting = await SharedOAuthClient.open(owner.path);
  const ended = new Promise<void>(resolve => { owner.onClose = resolve; });
  try {
    editor.close(); await delay(50);
    assert.equal((await meeting.refresh()).token, 'PRIVATE-access-2');
    await lstat(owner.path);
    meeting.close(); await ended;
    await assert.rejects(lstat(owner.path)); await assert.rejects(lstat(dirname(owner.path)));
  } finally { editor.close(); meeting.close(); await owner.close(); }
});

test('denied or uncertain shared refresh fails closed for every lease, with no automatic grant replay or raw provider output', async () => {
  const t = transport(), owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher });
  const editor = await SharedOAuthClient.open(owner.path), meeting = await SharedOAuthClient.open(owner.path);
  let failures = 0; editor.onFailure = () => { failures++; }; meeting.onFailure = () => { failures++; };
  try {
    t.deny(); await assert.rejects(editor.refresh(), error => error instanceof Error && !error.message.includes('PRIVATE'));
    await until(() => failures === 2);
    await assert.rejects(editor.refresh()); await assert.rejects(meeting.refresh()); assert.equal(t.forms.length, 1);
  } finally { editor.close(); meeting.close(); await owner.close(); }
});

test('unsafe sockets and malformed/oversized credential requests are refused without issuing a grant', async () => {
  const t = transport(), owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher });
  try {
    await chmod(owner.path, 0o666); await assert.rejects(SharedOAuthClient.open(owner.path)); await chmod(owner.path, 0o600);
    for (const wire of ['{"id":1,"method":"authorize","token":"PRIVATE"}\n', 'x'.repeat(20_000)]) {
      const socket = createConnection(owner.path);
      await new Promise<void>(resolve => { socket.once('close', resolve); socket.on('error', () => {}); socket.write(wire); });
    }
    assert.equal(t.forms.length, 0);
  } finally { await owner.close(); }
});

test('a native refresh ignoring cancellation closes every lease at a hard deadline without replay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const owner = await SharedOAuthOwner.open(seed(), { fetch: async () => { calls++; return new Promise<Response>(() => {}); } });
  const client = await SharedOAuthClient.open(owner.path);
  try {
    const pending = client.refresh(); void pending.catch(() => {});
    for (let i = 0; i < 200 && !calls; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    t.mock.timers.tick(17_000);
    await assert.rejects(pending); await assert.rejects(client.refresh()); assert.equal(calls, 1);
  } finally { client.close(); await owner.close(); }
});

test('handoff freezes the original refresh owner, keeps one delegate, and never exports private fields in access values', async () => {
  const t = transport(), original = OAuthSession.adopt(seed(), { fetch: async () => { throw new Error('Old owner must not refresh.'); } });
  let owner: SharedOAuthOwner | undefined, starts = 0;
  const start = async (value: OAuthSeed) => { starts++; owner = await SharedOAuthOwner.open(value, { fetch: t.fetcher }); return SharedOAuthClient.open(owner.path); };
  try {
    const first = original.handoff(start), second = original.handoff(start); assert.equal(first, second);
    const path = await first; assert.equal(starts, 1); assert.equal(await original.handoff(start), path);
    assert.equal(original['pair'], undefined); assert.equal(original['clientSecret'], '', 'local rotating grant and private secret are discarded after handoff');
    const access = await original.refresh(); assert.equal(access.token, 'PRIVATE-access-2');
    assert.deepEqual(Object.keys(access).sort(), ['expiresAt', 'scope', 'token']); assert.equal(t.forms.length, 1);
  } finally { original.close(); await owner?.close(); }
});

test('canceling or failing handoff cannot resurrect a lease or fall back to replaying a copied refresh grant', async () => {
  const t = transport(), original = OAuthSession.adopt(seed(), { fetch: t.fetcher });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const owner = await SharedOAuthOwner.open(seed(), { fetch: t.fetcher });
  const pending = original.handoff(async () => { await held; return SharedOAuthClient.open(owner.path); });
  original.close(); release();
  try { await assert.rejects(pending); await assert.rejects(original.refresh()); assert.equal(t.forms.length, 0); }
  finally { await owner.close(); }
  const failed = OAuthSession.adopt(seed(), { fetch: t.fetcher });
  await assert.rejects(failed.handoff(async () => { throw new Error('PRIVATE transport detail'); }), /sharing failed/);
  await assert.rejects(failed.refresh()); assert.equal(t.forms.length, 0);
});

test('real detached credential worker bootstraps over private IPC and self-cleans after its last lease', { timeout: 20_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-oauth-worker-test-');
  let client: SharedOAuthClient | undefined;
  try {
    await buildArtifacts(directory);
    const input = seed();
    client = await startSharedOAuth(input, join(directory, 'oauth-worker.js'));
    assert.equal((await client.access()).token, input.pair.token);
    assert.deepEqual(await readdir(dirname(client.path)), ['access.sock']);
    const artifact = await readFile(join(directory, 'oauth-worker.js'), 'utf8');
    for (const secret of [input.clientSecret, input.pair.token, input.pair.refreshToken]) assert.ok(!artifact.includes(secret));
    const path = client.path;
    client.close();
    await delay(10_150);
    await assert.rejects(lstat(path)); await assert.rejects(lstat(dirname(path)));
  } finally { client?.close(); await rm(directory, { recursive: true, force: true }); }
});
