import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile), quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
test('legacy standalone rendering bench: four internal regions plus an explicit native viewer', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 25_000,
}, async t => {
  const dir = await mkdtemp('/tmp/opencode/wbx-workspace-kitty-');
  const socket = join(dir, 'tmux.sock'), config = join(dir, 'tmux.conf'), record = join(dir, 'record.txt');
  const title = 'WBX mock workspace verification';
  await writeFile(config, 'set -g allow-passthrough on\nset -g status off\n');
  const app = [process.execPath, 'dist/cli.js', 'demo', '--standalone', '--renderer', 'kitty', '--pixel-transport', 'shm', '--duration', '10'].map(quote).join(' ');
  const pane = ['script', '-qefc', app, record].map(quote).join(' ');
  const kitty = exec(process.env.WBX_KITTY || 'kitty', ['--config', 'NONE', '--title', title,
    '--override', 'initial_window_width=1400', '--override', 'initial_window_height=920', '--override', 'remember_window_size=no',
    'tmux', '-S', socket, '-f', config, 'new-session', '-s', 'verify', pane], {
    env: { ...process.env, TMUX: '', WBX_TEMP_DIR: '/tmp/opencode' }, timeout: 20_000, maxBuffer: 1_000_000,
  });
  void kitty.catch(() => {});
  try {
    const deadline = Date.now() + 8000;
    let transcript = '';
    while (Date.now() < deadline) {
      transcript = await readFile(record, 'utf8').catch(() => '');
      if (transcript.includes('Taylor Morgan') && (transcript.match(/a=t,f=32,t=s,/g) ?? []).length >= 4) break;
      await delay(50);
    }
    assert.ok(transcript.includes('Sam Rivera') && transcript.includes('Jordan Lee') && transcript.includes('Taylor Morgan'));
    assert.ok((transcript.match(/a=t,f=32,t=s,/g) ?? []).length <= 8, 'only startup geometry changes may recreate pane images');
    assert.equal(new Set([...transcript.matchAll(/a=p,U=1,i=(\d+)/g)].map(match => match[1])).size, 4);
    if (process.env.WBX_LEGACY_SCREENSHOT) {
      await delay(250); // allow the first complete sweep and WM geometry to settle
      const info = await exec('xwininfo', ['-name', title]);
      const window = /Window id: (0x[0-9a-f]+)/i.exec(info.stdout)?.[1];
      assert.ok(window);
      await exec('import', ['-window', window, process.env.WBX_LEGACY_SCREENSHOT]);
      t.diagnostic(`Captured legacy bench: ${process.env.WBX_LEGACY_SCREENSHOT}`);
    }
    const original = (await exec('tmux', ['-S', socket, 'display-message', '-p', '-t', 'verify', '#{pane_id}'])).stdout.trim();
    await exec('tmux', ['-S', socket, 'send-keys', '-t', original, '-l', ':tmux.open mock-2']);
    await exec('tmux', ['-S', socket, 'send-keys', '-t', original, 'Enter']);
    let panes: string[] = [], viewerText = '';
    const viewDeadline = Date.now() + 6000;
    while (Date.now() < viewDeadline) {
      panes = (await exec('tmux', ['-S', socket, 'list-panes', '-t', 'verify', '-F', '#{pane_id}'])).stdout.trim().split('\n');
      const viewer = panes.find(id => id !== original);
      if (viewer) {
        viewerText = (await exec('tmux', ['-S', socket, 'capture-pane', '-p', '-t', viewer])).stdout;
        if (viewerText.includes('WBX view') && viewerText.includes('Sam Rivera')) break;
      }
      await delay(50);
    }
    assert.equal(panes.length, 2); assert.match(viewerText, /WBX view/); assert.match(viewerText, /Sam Rivera/);
    await kitty;
    transcript = await readFile(record, 'utf8');
    const summary = /\n(\{\s*"seconds"[\s\S]*?\n\})/.exec(transcript)?.[1]; assert.ok(summary);
    const metrics = JSON.parse(summary);
    t.diagnostic(JSON.stringify(metrics));
    if (metrics.renderErrors) t.diagnostic(transcript.replace(/[^\x20-\x7e\n]/g, '').match(/.{0,100}(?:paused|rejected|timed out).{0,120}/gi)?.join('\n') ?? 'No render error text');
    assert.equal(metrics.renderErrors, 0); assert.equal(metrics.frames, metrics.terminalAcknowledgedFrames);
    assert.ok(metrics.frames > 80); assert.equal(metrics.workspace.mockParticipants, 4);
    assert.ok((transcript.match(/a=t,f=32,t=s,/g) ?? []).length <= 12, 'startup and explicit tmux split resize must not cause per-frame allocation churn');
    t.diagnostic(JSON.stringify({ frames: metrics.frames, acknowledged: metrics.terminalAcknowledgedFrames,
      p95AckMs: metrics.captureToTerminalAckP95Ms, nativeTmuxPanes: panes.length, mockParticipants: 4, renderErrors: metrics.renderErrors }));
  } finally {
    await exec('tmux', ['-S', socket, 'kill-server']).catch(() => {}); await kitty.catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
