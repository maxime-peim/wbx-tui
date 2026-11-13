import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { defaults, loadConfig, parseConfig, readOAuthClientSecret, resolveOAuthClientSecret, saveLayout, saveMessageLayout } from '../src/config.js';
import { ViewerBroker, ViewerHost } from '../src/viewer.js';
import { ExtensionHost } from '../src/extensions.js';
import { MessagingUI } from '../src/messaging-ui.js';
import { MessagingStore } from '../src/messaging-store.js';
import { demoMessageAPI } from '../src/messaging-api.js';

const exec = promisify(execFile), secret = 'synthetic-local-client-secret-never-print';
const profile = { clientId: 'synthetic-client', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] };
const privateDocument = () => ({ oauth: { ...profile, clientSecret: secret } });
test('optional inline clientSecret is stripped from public config and resolved only by the Node owner, without a prompt', async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-secret-'), path = join(dir, 'config.json');
  try {
    await writeFile(path, JSON.stringify(privateDocument()), { mode: 0o600 });
    const config = await loadConfig(path, true); assert.deepEqual(config.oauth, profile); assert.ok(!JSON.stringify(config).includes(secret));
    assert.equal(await readOAuthClientSecret(path, config.oauth!), secret);
    assert.equal(await resolveOAuthClientSecret(path, config.oauth!, async () => assert.fail('must not prompt')), secret);
    await writeFile(path, JSON.stringify({ oauth: profile }));
    let prompts = 0; assert.equal(await resolveOAuthClientSecret(path, profile, async () => { prompts++; return 'local-prompt-secret'; }), 'local-prompt-secret');
    assert.equal(prompts, 1);
    await assert.rejects(readOAuthClientSecret(path, { ...profile, clientId: 'changed-client' }), /profile changed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('secret-bearing configs fail closed unless owned privately, and bad JSON/errors never repeat secret contents', async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-secret-perms-'), path = join(dir, 'config.json');
  try {
    await writeFile(path, JSON.stringify(privateDocument()), { mode: 0o644 }); await chmod(path, 0o644);
    await assert.rejects(loadConfig(path, true), error => error instanceof Error && /chmod 600/.test(error.message) && !error.message.includes(secret));
    await assert.rejects(readOAuthClientSecret(path, profile), /owner-only/);
    await chmod(path, 0o600); await loadConfig(path, true);
    await chmod(path, 0o400); assert.equal(await readOAuthClientSecret(path, profile), secret);
    await chmod(path, 0o600); await writeFile(path, `{"oauth":{"clientSecret":"${secret}"},BROKEN`);
    await assert.rejects(loadConfig(path, true), error => error instanceof Error && /valid JSON/.test(error.message) && !error.message.includes(secret));
    assert.throws(() => parseConfig({ oauth: { ...profile, clientSecret: 'bad\nsecret' } }), /clientSecret/);
    assert.throws(() => parseConfig({ oauth: { ...profile, refreshToken: 'never-accept-grant-files' } }));
  } finally { await chmod(path, 0o600).catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});
test('layout saves preserve an existing private secret only in its original file and keep public settings redacted', async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-secret-save-'), path = join(dir, 'config.json');
  try {
    await writeFile(path, JSON.stringify(privateDocument()), { mode: 0o600 });
    await saveLayout(path, 'meeting', defaults().layouts.single!);
    await saveMessageLayout(path, 'messages', defaults().messaging.layouts.mail!);
    const stored = JSON.parse(await readFile(path, 'utf8')); assert.equal(stored.oauth.clientSecret, secret);
    assert.equal((await stat(path)).mode & 0o777, 0o600); assert.ok(!JSON.stringify(await loadConfig(path, true)).includes(secret));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('viewer IPC and extension contexts/config contain no inline client secret', async () => {
  const broker = await ViewerBroker.open(async () => null);
  broker.configure(privateDocument() as any); // also defend a raw, unexpectedly unsanitized owner object
  const viewer = await ViewerHost.open(broker.path), configs: unknown[] = [];
  viewer.on('config', config => configs.push(config));
  viewer.send({ type: 'start', mode: 'demo' });
  const store = new MessagingStore(demoMessageAPI(), 0), ui = new MessagingUI(store, parseConfig(privateDocument())), host = new ExtensionHost(ui, () => {});
  try {
    for (let i = 0; !configs.length && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(configs.length); assert.ok(!JSON.stringify(configs).includes(secret));
    assert.ok(!JSON.stringify(ui.config).includes(secret)); assert.ok(!JSON.stringify(host.api.context()).includes(secret));
  } finally { await host.dispose(); store.close(); await viewer.close(); await broker.close(); }
});
test('CLI public configuration and auth diagnostics never print the stored client secret', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 10_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-secret-cli-'), path = join(dir, 'config.json');
  try {
    await writeFile(path, JSON.stringify(privateDocument()), { mode: 0o600 });
    for (const command of [['config'], ['messages', '--print-config'], ['messages', '--check-auth']]) {
      const { stdout, stderr } = await exec(process.execPath, ['dist/cli.js', ...command, '--config', path]);
      assert.ok(!stdout.includes(secret)); assert.ok(!stderr.includes(secret));
      const result = JSON.parse(stdout);
      if (command.includes('--check-auth')) { assert.equal(result.clientSecretConfigured, true); assert.equal(result.clientSecretEntry, 'private config file'); }
      else assert.equal(result.oauth.clientSecret, undefined);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI with a stored secret skips all credential prompts; test browser opener fails locally before any Webex request', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 10_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-secret-start-'), path = join(dir, 'config.json'), bin = join(dir, 'bin');
  const reserve = createServer(); await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  try {
    await mkdir(bin); await writeFile(join(bin, 'xdg-open'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    await writeFile(path, JSON.stringify({ oauth: { ...profile, redirectUri: `http://127.0.0.1:${port}/oauth/callback`, clientSecret: secret } }), { mode: 0o600 });
    // exec has no TTY, so use script. The injected xdg-open never opens a browser or URL.
    const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
    await assert.rejects(exec('script', ['-qefc', `${shellQuote(process.execPath)} dist/cli.js messages --config ${shellQuote(path)}`, '/dev/null'], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TERM: 'xterm-256color' },
    }), error => {
      const text = (error as { stdout: string; stderr: string }).stdout + (error as { stderr: string }).stderr;
      assert.ok(text.includes('Approve your integration')); assert.ok(!text.includes('client secret (hidden')); assert.ok(!text.includes('access token (hidden'));
      assert.ok(!text.includes(secret)); assert.match(text, /Could not open OAuth login|callback port unavailable/); return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
