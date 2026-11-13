import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('real CLI in a pseudo-terminal: synthetic blocks, controls, terminal restoration, metrics', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 20_000,
}, async () => {
  const child = spawn('script', ['-qefc', `${process.execPath} dist/cli.js demo --standalone --headless --renderer blocks --duration 2`, '/dev/null'], {
    env: { ...process.env, WBX_TEMP_DIR: '/tmp/opencode', TERM: 'xterm-256color', TMUX: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  let sentKeys = false;
  child.stdout.on('data', chunk => {
    output += chunk; assert.ok(output.length < 4_000_000);
    if (!sentKeys && output.includes('▀')) {
      sentKeys = true; child.stdin.write('p');
      setTimeout(() => child.stdin.write('p'), 150);
    }
  });
  child.stderr.on('data', chunk => { errors += chunk; });
  const result = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.equal(result, 0, errors + output.slice(-3000));
  assert.ok(output.includes('WBX demo'));
  assert.ok(output.includes('▀'));
  assert.ok(output.includes('PAUSED'));
  assert.ok(output.includes('\x1b[?1049l'));
  assert.ok(output.includes('captureToTTYWriteP95Ms'));
  assert.match(output, /"frames": [1-9]/);
});

test('a pixel acknowledgment timeout pauses rendering and allows blocks without ending the session', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 20_000,
}, async () => {
  const child = spawn('script', ['-qefc',
    `${process.execPath} dist/cli.js demo --standalone --headless --renderer kitty --pixel-transport inline --duration 5`, '/dev/null'], {
    env: { ...process.env, WBX_TEMP_DIR: '/tmp/opencode', TERM: 'xterm-256color', TMUX: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', errors = '', recovered = false;
  child.stdout.on('data', chunk => {
    output += chunk;
    if (!recovered && output.includes('Video paused')) { recovered = true; child.stdin.write('t'); }
    assert.ok(output.length < 4_000_000);
  });
  child.stderr.on('data', chunk => { errors += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(code, 0, errors + output.slice(-2000));
  assert.ok(recovered, 'missing terminal ACK must pause, not terminate');
  assert.ok(output.includes('▀'), 'blocks must remain usable after the rendering failure');
  assert.match(output, /"renderErrors": 1/);
  assert.ok(!output.includes('wbx-proto:'), 'render failure must not exit the prototype');
});

test('private tmux server passes pixel payloads and scopes image cleanup (no display assertion)', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 20_000,
}, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-tmux-');
  const socket = join(directory, 'socket'), config = join(directory, 'tmux.conf');
  await writeFile(config, 'set -g allow-passthrough on\nset -g status off\n');
  try {
    const child = spawn('script', ['-qefc',
      `tmux -S '${socket}' -f '${config}' new-session -s wbx '${process.execPath} dist/cli.js demo --standalone --headless --renderer kitty --duration 2'`, '/dev/null'], {
      env: { ...process.env, WBX_TEMP_DIR: '/tmp/opencode', TMUX: '', TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; assert.ok(output.length < 8_000_000); });
    child.stderr.on('data', chunk => { error += chunk; });
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, error + output.slice(-2000));
    assert.ok(output.includes('a=t,f=100,'), 'PNG data should reach the outer PTY');
    assert.ok(output.includes('a=p,U=1,'), 'Unicode virtual placement should reach the outer PTY');
    assert.ok(output.includes('a=d,d=I,'), 'cleanup must be scoped to the viewer image');
  } finally {
    await promisify(execFile)('tmux', ['-S', socket, 'kill-server']).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
