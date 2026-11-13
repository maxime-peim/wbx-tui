import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

test('real Kitty + private tmux + minimized Chrome sustain acknowledged in-place updates', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 35_000,
}, async t => {
  assert.ok(process.env.DISPLAY, 'This opt-in test needs a graphical X11 session.');
  const directory = await mkdtemp('/tmp/opencode/wbx-kitty-test-');
  const config = join(directory, 'tmux.conf'), socket = join(directory, 'socket'), record = join(directory, 'output.txt');
  const duration = 12;
  await writeFile(config, 'set -g allow-passthrough on\nset -g status off\n');
  try {
    const app = [process.execPath, 'dist/cli.js', 'demo', '--standalone', '--layout', 'single', '--renderer', 'kitty', '--pixel-transport', 'inline', '--duration', String(duration)].map(quote).join(' ');
    const pane = ['script', '-qefc', app, record].map(quote).join(' ');
    await exec(process.env.WBX_KITTY || 'kitty', [
      '--config', 'NONE', '--title', 'WBX isolated rendering regression test',
      '--override', 'initial_window_width=1300', '--override', 'initial_window_height=900',
      '--override', 'remember_window_size=no',
      'tmux', '-S', socket, '-f', config, 'new-session', '-s', 'wbx', pane,
    ], { env: { ...process.env, TMUX: '', WBX_TEMP_DIR: '/tmp/opencode' }, timeout: 30_000, maxBuffer: 1_000_000 });
    const transcript = await readFile(record, 'utf8');
    const summary = /\n(\{\s*"seconds"[\s\S]*?\n\})/.exec(transcript)?.[1];
    assert.ok(summary, 'The CLI must exit cleanly with a metrics report.');
    const metrics = JSON.parse(summary);
    assert.ok(!transcript.includes('wbx-proto:'), 'No terminal/worker error should be reported.');
    assert.ok(metrics.uniqueFrames >= duration * 5, 'Must exceed the reported one-frame-per-three-seconds regression.');
    assert.equal(metrics.terminalAcknowledgedFrames, metrics.frames);
    assert.ok(metrics.captureToTerminalAckP95Ms < 1000, 'Terminal processing must not accumulate a multi-second backlog.');
    // A tiling desktop may resize Kitty as Chrome appears/minimizes. Resizing
    // legitimately reallocates; steady-state frames must still edit in place.
    const allocations = (transcript.match(/a=t,f=100,/g) ?? []).length;
    assert.ok(allocations >= 1 && allocations <= 3, 'Allocations are bounded by startup geometry changes, not frames.');
    assert.equal((transcript.match(/a=p,U=1,/g) ?? []).length, allocations);
    assert.ok((transcript.match(/a=f,f=100,/g) ?? []).length >= duration * 5 - 1, 'Subsequent frames edit the root image.');
    t.diagnostic(JSON.stringify(metrics));
  } finally {
    await exec('tmux', ['-S', socket, 'kill-server']).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test('high-entropy video stays fluid through real Kitty/tmux shared memory for 30 seconds', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 55_000,
}, async t => {
  assert.ok(process.env.DISPLAY);
  const directory = await mkdtemp('/tmp/opencode/wbx-kitty-noise-');
  const config = join(directory, 'tmux.conf'), socket = join(directory, 'socket'), record = join(directory, 'output.txt');
  const duration = 30;
  await writeFile(config, 'set -g allow-passthrough on\nset -g status off\n');
  try {
    const app = [process.execPath, 'dist/cli.js', 'demo', '--standalone', '--layout', 'single', '--pattern', 'noise', '--renderer', 'kitty',
      '--pixel-transport', 'shm', '--duration', String(duration)].map(quote).join(' ');
    const pane = ['script', '-qefc', app, record].map(quote).join(' ');
    await exec(process.env.WBX_KITTY || 'kitty', [
      '--config', 'NONE', '--title', 'WBX high-entropy RAM rendering test',
      '--override', 'initial_window_width=1300', '--override', 'initial_window_height=900',
      '--override', 'remember_window_size=no',
      'tmux', '-S', socket, '-f', config, 'new-session', '-s', 'wbx', pane,
    ], { env: { ...process.env, TMUX: '', WBX_TEMP_DIR: '/tmp/opencode' }, timeout: 45_000, maxBuffer: 1_000_000 });
    const transcript = await readFile(record, 'utf8');
    const summary = /\n(\{\s*"seconds"[\s\S]*?\n\})/.exec(transcript)?.[1];
    assert.ok(summary, 'The stress run must finish with metrics.');
    const metrics = JSON.parse(summary);
    assert.equal(metrics.pixelTransport, 'shm');
    assert.equal(metrics.renderErrors, 0);
    assert.ok(metrics.uniqueFrames >= duration * 10, 'Detailed video should sustain at least 10 acknowledged updates/sec.');
    assert.equal(metrics.terminalAcknowledgedFrames, metrics.frames);
    assert.ok(metrics.captureToTerminalAckP95Ms < 500);
    assert.ok(metrics.terminalOutputMB < 1, 'Raw video bytes must not be encoded into the tmux stream.');
    assert.ok((transcript.match(/a=t,f=32,t=s,/g) ?? []).length <= 3, 'Only startup geometry changes may reallocate.');
    assert.ok((transcript.match(/a=f,f=32,t=s,/g) ?? []).length >= duration * 10 - 1);
    t.diagnostic(JSON.stringify(metrics));
  } finally {
    await exec('tmux', ['-S', socket, 'kill-server']).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
