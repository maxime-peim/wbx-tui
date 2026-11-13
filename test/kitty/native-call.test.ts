import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { quote } from '../../src/tmux.js';

const exec = promisify(execFile);
test('default call creates five REAL tmux panes, ACKs each feed, and survives detach/reattach without rejoining', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 35_000,
}, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-native-kitty-'), socket = join(directory, 'tmux.sock');
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', WBX_TMUX_SOCKET: socket, WBX_TEMP_DIR: directory };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trim();
  await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'unrelated', 'sleep 40');
  const title = 'WBX native call session verification', session = 'wbx-pixel-proof';
  const app = [process.execPath, 'dist/cli.js', 'demo', '--call-id', 'pixel-proof', '--renderer', 'kitty', '--pixel-transport', 'shm', '--duration', '16'];
  const open = (name: string) => exec(process.env.WBX_KITTY || 'kitty', ['--config', 'NONE', '--title', name,
    '--override', 'initial_window_width=1400', '--override', 'initial_window_height=920', '--override', 'remember_window_size=no', ...app],
    { env, timeout: 26_000, maxBuffer: 1_000_000 });
  const first = open(title); void first.catch(() => {});
  let second: ReturnType<typeof open> | undefined;
  const until = async (check: () => Promise<boolean>, label: string, ms = 8000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) { if (await check()) return; await delay(50); }
    const panes = await tmux('list-panes', '-t', session, '-F', '#{pane_id}').catch(() => '');
    for (const pane of panes.split('\n').filter(Boolean)) t.diagnostic(`${pane}\n${await tmux('capture-pane', '-p', '-t', pane).catch(() => '')}`);
    throw new Error(`Timed out: ${label}`);
  };
  try {
    let list: { pane: string; pid: string; source: string }[] = [];
    await until(async () => {
      const text = await tmux('list-panes', '-t', session, '-F', '#{pane_id}|#{pane_pid}|#{@wbx_source}').catch(() => '');
      list = text.split('\n').filter(Boolean).map(line => { const [pane, pid, source] = line.split('|'); return { pane: pane!, pid: pid!, source: source! }; });
      return list.length === 5 && list.every(view => view.source);
    }, 'four participants and one screen share as native tmux panes');
    const owner = list.find(view => view.source === 'video')!;
    assert.equal(new Set(list.map(view => view.pid)).size, 5);
    for (const view of list) await tmux('pipe-pane', '-O', '-t', view.pane, `cat > ${quote(join(directory, `${view.source}.log`))}`);
    for (const view of list) { await tmux('select-pane', '-t', view.pane); await delay(120); }
    const chat = list.find(view => view.source === 'mock-2')!;
    // Source tags are set before the viewer finishes its capability probes;
    // keyboard input sent during those probes is deliberately not interpreted.
    await until(async () => (await tmux('capture-pane', '-p', '-t', chat.pane)).includes('TMUX ·'), 'chat viewer has installed its keyboard handler');
    await tmux('select-pane', '-t', chat.pane); await tmux('send-keys', '-t', chat.pane, '-l', 'x');
    await until(async () => (await tmux('capture-pane', '-p', '-t', chat.pane)).includes('MOCK space · local-only chat'), 'native pixel pane shows explicit space picker');
    await tmux('send-keys', '-t', chat.pane, 'Enter');
    await until(async () => (await tmux('capture-pane', '-p', '-t', chat.pane)).includes('TO SPACE:'), 'space selected without sending');
    await tmux('send-keys', '-t', chat.pane, '-l', 'mvdcq Kitty chat proof 世界'); await tmux('send-keys', '-t', chat.pane, 'Enter');
    await until(async () => (await tmux('capture-pane', '-p', '-t', chat.pane)).includes('Sent to the selected Webex SPACE'), 'mock chat sends without triggering media/quit hotkeys');
    if (process.env.WBX_CHAT_SCREENSHOT) {
      await delay(200); // tmux's text model can precede the outer terminal's displayed pixels
      const info = await exec('xwininfo', ['-name', title]);
      const id = /Window id: (0x[0-9a-f]+)/i.exec(info.stdout)?.[1]; assert.ok(id);
      await exec('import', ['-window', id, process.env.WBX_CHAT_SCREENSHOT]);
      t.diagnostic(`Actual native chat screenshot: ${process.env.WBX_CHAT_SCREENSHOT}`);
    }
    await tmux('send-keys', '-t', chat.pane, 'Escape');
    await until(async () => !(await tmux('capture-pane', '-p', '-t', chat.pane)).includes('TO SPACE:'), 'Escape restores pixel pane without leaving');
    await delay(350);
    const beforeDetach = new Map<string, number>();
    for (const view of list) beforeDetach.set(view.source, (await readFile(join(directory, `${view.source}.log`), 'utf8')).length);
    await tmux('detach-client', '-s', session);
    await first;
    assert.equal(await tmux('show-options', '-qv', '-t', session, '@wbx_media_pid'), owner.pid, 'detach preserves the media owner');
    second = open(title + ' reattached'); void second.catch(() => {});
    await until(async () => Number(await tmux('display-message', '-p', '-t', session, '#{session_attached}')) > 0, 'reattach same call');
    assert.equal(await tmux('show-options', '-qv', '-t', session, '@wbx_media_pid'), owner.pid, 'reattach must not rejoin or launch another browser');
    await until(async () => {
      for (const view of list) {
        const screen = await tmux('capture-pane', '-p', '-t', view.pane);
        const log = await readFile(join(directory, `${view.source}.log`), 'utf8').catch(() => '');
        const fresh = log.slice(beforeDetach.get(view.source));
        if (screen.includes('PAUSED') || !fresh.includes('a=t,f=32,t=s,') || !fresh.includes('a=f,f=32,t=s,')) return false;
      }
      return true;
    }, 'all native pixel viewers resume after reattach');
    await delay(350);
    if (process.env.WBX_SCREENSHOT) {
      const info = await exec('xwininfo', ['-name', title + ' reattached']);
      const id = /Window id: (0x[0-9a-f]+)/i.exec(info.stdout)?.[1]; assert.ok(id);
      await exec('import', ['-window', id, process.env.WBX_SCREENSHOT]);
      t.diagnostic(`Actual native tmux screenshot: ${process.env.WBX_SCREENSHOT}`);
    }
    t.diagnostic('tmux list-windows (real window ID, name, pane count):\n' + await tmux('list-windows', '-t', session, '-F', '#{window_id}|#{window_name}|#{window_panes}'));
    t.diagnostic('tmux list-panes (real pane IDs, independent processes, source):\n' + await tmux('list-panes', '-t', session, '-F', '#{pane_id}|#{pane_pid}|#{@wbx_source}'));
    await second;
    let total = 0;
    for (const view of list) {
      const text = await readFile(join(directory, `${view.source}.log`), 'utf8');
      const summary = /\n(\{\s*"seconds"[\s\S]*?\n\})/.exec(text)?.[1]; assert.ok(summary, `metrics for ${view.source}`);
      const metrics = JSON.parse(summary);
      assert.equal(metrics.renderer, 'kitty'); assert.equal(metrics.renderingPausedByError, false);
      assert.ok(metrics.frames >= 30, `${view.source} keeps advancing`);
      assert.equal(metrics.frames, metrics.terminalAcknowledgedFrames);
      assert.equal(metrics.workspace.panes.length, 1, 'each process renders exactly one participant/share, never an internal gallery');
      total += metrics.frames;
      t.diagnostic(JSON.stringify({ source: view.source, tmuxPane: view.pane, frames: metrics.frames,
        acknowledged: metrics.terminalAcknowledgedFrames, p95AckMs: metrics.captureToTerminalAckP95Ms, renderErrors: metrics.renderErrors }));
    }
    assert.ok(total >= 200); assert.equal(await tmux('has-session', '-t', 'unrelated').then(() => true), true);
  } finally {
    await tmux('kill-server').catch(() => {}); await first.catch(() => {}); await second?.catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
