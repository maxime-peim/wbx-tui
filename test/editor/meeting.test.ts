import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './helpers.js';

const exec = promisify(execFile);
for (const editor of editorBinaries()) {
  for (const script of ['meeting', 'fallback', 'shutdown']) {
  test(`${editor.name}/${script}: real tmux lifecycle, presentation/fallback and one owner`, {
    skip: process.env.WBX_EDITOR_MEETING_TEST !== '1', timeout: 60_000,
  }, async t => {
    const directory = await mkdtemp('/tmp/opencode/wbx-editor-meeting-'), config = join(directory, 'config.json'), socket = join(directory, 'tmux.sock');
    await writeFile(config, '{}');
    const tmuxConfig = join(directory, 'tmux.conf');
    await writeFile(tmuxConfig, 'set -g prefix C-a\nset -g status-left "USER-TMUX #S"\nset -g status-right "RIGHT #H"\nset -g status-style "fg=#13ab9c,bg=#101010"\nset -g pane-border-status bottom\nset -g pane-border-format "USER #{pane_title}"\nset -g pane-active-border-style "fg=#ab12cd"\n');
    const env = editorEnvironment(editor, directory, { TMUX: '', TMUX_PANE: '', TERM: 'xterm-256color',
      WBX_TEMP_DIR: directory, WBX_TMUX_SOCKET: socket, WBX_EDITOR_LOG_DIR: directory });
    // Keep graphical assertions independent of the user's Kitty geometry/font
    // and of a narrow 80-column default after HOME/config isolation.
    env.KITTY_CONFIG_DIRECTORY = join(directory, 'kitty');
    await mkdir(env.KITTY_CONFIG_DIRECTORY);
    await writeFile(join(env.KITTY_CONFIG_DIRECTORY, 'kitty.conf'), 'font_size 10\ninitial_window_width 160c\ninitial_window_height 48c\nremember_window_size no\n');
    if (script === 'fallback') {
      await mkdir(join(directory, 'bin'));
      await writeFile(join(directory, 'bin', 'kitty'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
      env.PATH = join(directory, 'bin') + delimiter + process.env.PATH;
      env.DISPLAY ||= ':synthetic-unreachable-display';
    }
    const tmux = (...args: string[]) => exec('tmux', ['-S', socket, ...args], { env });
    let editorReady = false;
    try {
      if (!await editorAvailable(t, editor, env)) return;
      editorReady = true;
      await tmux('-f', tmuxConfig, 'new-session', '-d', '-s', 'unrelated', 'sleep 60');
      const data = await runEditorFixture(editor, script, env, 50_000);
      if (data.errors.length) t.diagnostic((await tmux('capture-pane', '-p', '-t', 'wbx-editor-test').catch(() => ({ stdout: 'call ended' }))).stdout);
      assert.deepEqual(data.errors, []);
      if (script === 'shutdown') {
        assert.ok(typeof data.exit_owner === 'string' && typeof data.exit_session === 'string');
        assert.match(data.exit_owner, /^[1-9]\d+$/);
        const ownerStatus = await readFile(`/proc/${data.exit_owner}/status`, 'utf8').catch(() => '');
        assert.ok(!ownerStatus || /^State:\s+Z/m.test(ownerStatus), 'VimLeavePre must confirm the media owner exited before stopping the backend');
        // View-only pane processes can finish their final terminal restore just
        // after the media owner exits; they own no browser or publishing tracks.
        const deadline = Date.now() + 2000;
        let remains = await tmux('has-session', '-t', data.exit_session).then(() => true, () => false);
        while (remains && Date.now() < deadline) {
          await delay(40);
          remains = await tmux('has-session', '-t', data.exit_session).then(() => true, () => false);
        }
        if (remains) {
          t.diagnostic((await tmux('list-panes', '-t', data.exit_session, '-F', '#{pane_id}|#{pane_pid}|#{@wbx_source}|#{pane_current_command}')).stdout);
          const pid = (await tmux('show-options', '-qv', '-t', data.exit_session, '@wbx_media_pid')).stdout.trim();
          const status = await readFile(`/proc/${pid}/status`, 'utf8').catch(() => '');
          t.diagnostic(`Recorded owner ${pid}: ${status.match(/^State:.*$/m)?.[0] || 'exited'}`);
        }
        assert.equal(remains, false, 'view-only panes finish scoped cleanup after explicit leave');
      }
      if (script === 'meeting' && process.env.WBX_KITTY_TEST === '1') {
        for (const source of ['video', 'mock-2', 'mock-3', 'share']) {
          const log = await readFile(join(directory, source + '.log'), 'utf8');
          const summary = /\n(\{\s*"seconds"[\s\S]*?\n\})/.exec(log)?.[1];
          assert.ok(summary, `${editor.name}/${source}: process emitted final metrics`);
          const metrics = JSON.parse(summary);
          assert.ok(metrics.terminalAcknowledgedFrames > 0, `${editor.name}/${source}: real Kitty ACKs after editor presentation`);
          assert.equal(metrics.renderingPausedByError, false);
          t.diagnostic(`${editor.name}/${source}: ${metrics.terminalAcknowledgedFrames} Kitty-acknowledged frames; renderer at exit ${metrics.renderer}`);
        }
      }
      await tmux('has-session', '-t', 'unrelated');
      t.diagnostic(`${editor.name}: independent participant/share processes, one owner through presentation/reconnect; unrelated session retained`);
      if (data.processes) t.diagnostic(String(data.processes));
    } finally { if (editorReady) await tmux('kill-server').catch(() => {}); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });
  }
}
