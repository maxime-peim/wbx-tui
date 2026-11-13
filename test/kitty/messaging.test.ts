import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { quote } from '../../src/tmux.js';

const exec = promisify(execFile);
test('real Kitty/tmux displays the messaging workspace, literal Unicode composition, local acknowledgment and customized layout/theme', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 20_000,
}, async t => {
  const dir = await mkdtemp('/tmp/opencode/wbx-message-kitty-'), socket = join(dir, 'tmux.sock'), title = 'WBX Vim messaging workspace';
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', WBX_CONFIG: '' };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trim();
  const app = [process.execPath, 'dist/cli.js', 'messages', '--demo', '--layout', 'detailed', '--theme', 'tokyonight', '--duration', '12'].map(quote).join(' ');
  await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'messaging', '-n', 'messages', '-x', '160', '-y', '44', app);
  const terminal = exec(process.env.WBX_KITTY || 'kitty', ['--config', 'NONE', '--title', title,
    '--override', 'initial_window_width=1440', '--override', 'initial_window_height=950', '--override', 'remember_window_size=no',
    'tmux', '-S', socket, 'attach-session', '-t', 'messaging'], { env, timeout: 18_000 });
  void terminal.catch(() => {});
  const screen = () => tmux('capture-pane', '-p', '-t', 'messaging:messages');
  const until = async (check: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await check()) return; await delay(40); } throw new Error(await screen()); };
  try {
    await until(async () => (await screen()).includes('3 spaces'));
    await tmux('send-keys', '-t', 'messaging:messages', 'Enter');
    await until(async () => (await screen()).includes('Morgan · DEMO'));
    await tmux('send-keys', '-t', 'messaging:messages', '-l', 'iNeovim-style Webex messaging · 世界');
    await until(async () => (await screen()).includes('INSERT'));
    await tmux('send-keys', '-t', 'messaging:messages', 'C-s');
    await until(async () => (await screen()).includes('You · DEMO'));
    await tmux('send-keys', '-t', 'messaging:messages', '-l', 'Drafts stay with this space. Esc never quits.');
    await until(async () => (await screen()).includes('Drafts stay with this space.'));
    if (process.env.WBX_MESSAGING_SCREENSHOT) {
      await delay(200);
      const info = await exec('xwininfo', ['-name', title]); const id = /Window id: (0x[0-9a-f]+)/i.exec(info.stdout)?.[1]; assert.ok(id);
      await exec('import', ['-window', id, process.env.WBX_MESSAGING_SCREENSHOT]);
      t.diagnostic(`Actual terminal screenshot: ${process.env.WBX_MESSAGING_SCREENSHOT}`);
    }
    t.diagnostic('Native messaging window: ' + await tmux('list-windows', '-t', 'messaging', '-F', '#{window_id}|#{window_name}|#{window_panes}'));
    await tmux('send-keys', '-t', 'messaging:messages', 'C-c'); await terminal;
  } finally { await tmux('kill-server').catch(() => {}); await terminal.catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});
