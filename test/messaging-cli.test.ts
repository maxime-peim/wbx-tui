import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { quote } from '../src/tmux.js';

const exec = promisify(execFile);
test('OAuth profile compatibility can be checked without a terminal, login, browser or token disclosure', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 10_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-check-oauth-'), path = join(dir, 'public.json');
  const config = { oauth: { clientId: 'synthetic-public-client', redirectUri: 'http://127.0.0.1:53682/oauth/callback',
    scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] } };
  try {
    await writeFile(path, JSON.stringify(config));
    const args = ['dist/cli.js', 'messages', '--check-auth', '--config', path];
    const result = await exec(process.execPath, args); const report = JSON.parse(result.stdout);
    assert.equal(report.configured, true); assert.deepEqual(report.missingMessagingScopes, []); assert.equal(report.liveSignInVerified, false);
    assert.equal(report.selectedAuth, 'oauth');
    assert.ok(!result.stdout.includes(config.oauth.clientId)); assert.ok(!result.stderr);
    config.oauth.scopes = ['meeting:participants_read']; await writeFile(path, JSON.stringify(config));
    await assert.rejects(exec(process.execPath, args), error => JSON.parse((error as { stdout: string }).stdout).missingMessagingScopes.length === 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('configured OAuth is selected from the wbx-tui default path, while developer-token prompts require an explicit override', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 15_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-default-oauth-');
  const configPath = join(dir, 'wbx-tui', 'config.json'), config = { oauth: { clientId: 'synthetic-client', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } };
  const env = { ...process.env, WBX_CONFIG: undefined, XDG_CONFIG_HOME: dir, TERM: 'xterm-256color' };
  try {
    await assert.rejects(exec(process.execPath, ['dist/cli.js', 'messages'], { env }), error => {
      const stderr = (error as { stderr: string }).stderr; return stderr.includes('No OAuth profile') && !stderr.includes('access token (hidden');
    });
    await mkdir(join(dir, 'wbx-tui')); await writeFile(configPath, JSON.stringify(config));
    // No --config or --auth is needed for the registered default public profile.
    for (const [override, expected, forbidden] of [
      ['', 'Webex integration client secret', 'Webex messaging access token'],
      [' --auth token', 'Webex messaging access token', 'Webex integration client secret'],
    ]) {
      const child = spawn('script', ['-qefc', `${quote(process.execPath)} dist/cli.js messages${override}`, '/dev/null'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', canceled = false;
      child.stdout.on('data', chunk => { output += chunk; if (!canceled && output.includes(expected!)) { canceled = true; child.stdin.write('\x03'); } });
      const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      assert.equal(canceled, true); assert.equal(code, 1, 'cancel before providing any secret or contacting Webex'); assert.ok(!output.includes(forbidden!));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('built messaging CLI in REAL tmux: remapped navigation, multiline sending, modal safety, themes, resizing, layout.save/reload and draft-safe quit', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 25_000,
}, async t => {
  const dir = await mkdtemp('/tmp/opencode/wbx-messages-tmux-'), socket = join(dir, 'tmux.sock'), config = join(dir, 'config.json');
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', TERM: 'xterm-256color', WBX_CONFIG: '' };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trimEnd();
  const screen = () => tmux('capture-pane', '-p', '-t', 'messaging:messages');
  const literal = (text: string) => tmux('send-keys', '-t', 'messaging:messages', '-l', text);
  const key = (...keys: string[]) => tmux('send-keys', '-t', 'messaging:messages', ...keys);
  const until = async (check: () => Promise<boolean>, label: string) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await delay(25); }
    throw new Error(`Timed out: ${label}\n${await screen().catch(() => '(closed)')}`);
  };
  await writeFile(config, JSON.stringify({ leader: ',', theme: { accent: '#abcdef' }, messaging: { keybindings: { normal: { J: 'move.down', '<leader> c': 'insert' } } } }));
  const app = [process.execPath, 'dist/cli.js', 'messages', '--demo', '--config', config, '--duration', '18'].map(quote).join(' ');
  try {
    await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'messaging', '-n', 'messages', '-x', '140', '-y', '42', app);
    await tmux('set-option', '-t', 'messaging', 'remain-on-exit', 'on');
    await tmux('pipe-pane', '-O', '-t', 'messaging:messages', `cat > ${quote(join(dir, 'terminal.log'))}`);
    await until(async () => (await screen()).includes('3 spaces'), 'space list');
    await literal('J'); await key('Enter');
    await until(async () => (await screen()).includes('Morgan · DEMO'), 'open engineering without sending');
    await literal(',c'); await until(async () => (await screen()).includes('INSERT'), 'custom leader enters Insert');
    await literal('q:theme light literal 世界'); await key('Enter'); await literal('second line');
    assert.ok((await screen()).includes('INSERT'));
    await key('C-s'); await until(async () => (await screen()).includes('You · DEMO'), 'one local message acknowledgment');
    const sent = await screen(); assert.ok(sent.includes('q:theme light literal 世界')); assert.ok(sent.includes('second line'));
    await key('Escape'); await delay(60); await literal(':theme forest'); await key('Enter');
    await until(async () => (await screen()).includes('Theme: forest'), 'theme command');
    assert.ok((await tmux('capture-pane', '-e', '-p', '-t', 'messaging:messages')).includes('16;28;24'), 'forest truecolor background reaches tmux');
    await literal(':layout detailed'); await key('Enter');
    await until(async () => (await screen()).includes('DESTINATION'), 'four-panel layout');
    await key('C-w'); await literal('>'); await literal(':layout.save work'); await key('Enter');
    await until(async () => (await screen()).includes('Saved messaging layout work'), 'layout.save');
    const saved = JSON.parse(await readFile(config, 'utf8')); assert.equal(saved.messaging.layout, 'work'); assert.equal(saved.theme.accent, '#abcdef');
    saved.theme = { background: '#112233', accent: '#ffffff' }; saved.messaging.keybindings.normal.R = 'focus.rooms';
    await writeFile(config, JSON.stringify(saved));
    await literal(':reload'); await key('Enter');
    await until(async () => (await screen()).includes('Configuration reloaded'), 'reload keeps conversation');
    await literal('R'); await until(async () => /NORMAL\s+rooms/.test(await screen()), 'reloaded keybinding');
    await literal('i'); await literal('unsaved destination-bound draft'); await key('Escape'); await delay(60); await literal('q');
    await until(async () => (await screen()).includes('Unsent drafts'), 'q cannot discard drafts');
    t.diagnostic('Actual native messaging window: ' + await tmux('list-windows', '-t', 'messaging', '-F', '#{window_id}|#{window_name}|#{window_panes}'));
    t.diagnostic('Actual messaging screen:\n' + await screen());
    await literal(':q!'); await key('Enter');
    await until(async () => (await tmux('display-message', '-p', '-t', 'messaging:messages', '#{pane_dead}')) === '1', 'explicit quit');
    await until(async () => (await readFile(join(dir, 'terminal.log'), 'utf8')).includes('\x1b[?1049l'), 'terminal restored');
    assert.ok(!(await readFile(join(dir, 'terminal.log'), 'utf8')).includes('wbx-proto:'), 'clean exit without app errors');
  } finally { await tmux('kill-server').catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('messaging CLI restores terminal on Ctrl+C and never treats bracketed-paste commands/control keys as actions', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 10_000,
}, async () => {
  const child = spawn('script', ['-qefc', `${quote(process.execPath)} dist/cli.js messages --demo --duration 4`, '/dev/null'],
    { env: { ...process.env, TERM: 'xterm-256color', WBX_CONFIG: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '', phase = 0;
  child.stdout.on('data', chunk => {
    output += chunk; assert.ok(output.length < 4_000_000);
    if (!phase && output.includes('3 spaces')) { phase = 1; child.stdin.write('\ri'); }
    else if (phase === 1 && output.includes('INSERT')) { phase = 2; child.stdin.write('\x1b[200~q\x03:quit\nPASTED BODY\x1b[201~'); }
    else if (phase === 2 && output.includes('Pasted as literal')) { phase = 3; child.stdin.write('\x03'); }
  });
  child.stderr.on('data', chunk => { errors += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, errors); assert.equal(phase, 3); assert.ok(output.includes('PASTED BODY')); assert.ok(output.includes('\x1b[?1049l'));
  assert.ok(!output.includes('You · DEMO'), 'no accidental send from pasted newline or shortcut text');
});
