import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
test('default call owns a native tmux session: people/share panes, reuse, source lifecycle, controls, save, detach and scoped exit', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 30_000,
}, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-native-test-'), socket = join(directory, 'tmux.sock'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ tmux: { appearance: 'theme' }, keybindings: { '<leader> z': 'pane.maximize' } }));
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', WBX_TMUX_SOCKET: socket, WBX_TEMP_DIR: directory };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trim();
  const launch = () => exec(process.execPath, ['dist/cli.js', 'demo', '--call-id', 'native-proof', '--detached', '--headless', '--renderer', 'blocks',
    '--config', config, '--participants', '4', '--duration', '22'], { env, timeout: 6000 });
  const session = 'wbx-native-proof';
  await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'unrelated', '-x', '160', '-y', '48', 'sleep 60');
  await tmux('set-option', '-g', 'status-left', 'USER-STATUS #S');
  await tmux('set-option', '-g', 'status-style', 'fg=#112233,bg=#223344');
  await tmux('set-option', '-g', 'pane-active-border-style', 'fg=#0f0f0f');
  const paneFormat = '#{pane_id}|#{pane_pid}|#{@wbx_source}|#{pane_current_command}';
  const panes = async () => (await tmux('list-panes', '-t', session, '-F', paneFormat)).split('\n').map(line => {
    const [id, pid, source, command] = line.split('|'); return { id: id!, pid: pid!, source: source!, command: command! };
  });
  const until = async (check: () => Promise<boolean>, label: string) => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) { if (await check()) return; await delay(40); }
    const text = await tmux('capture-pane', '-p', '-t', session).catch(() => 'session missing');
    throw new Error(`Timed out: ${label}\n${text}`);
  };
  const command = async (pane: string, action: string) => {
    await tmux('select-pane', '-t', pane);
    await tmux('send-keys', '-t', pane, '-l', `:${action}`); await tmux('send-keys', '-t', pane, 'Enter');
  };
  try {
    const result = await launch(); assert.match(result.stderr, /Call session: wbx-native-proof/);
    await until(async () => {
      const list = await panes().catch(() => []);
      return list.length === 5 && list.every(pane => pane.source);
    }, 'four native participant panes and one native share pane');
    let list = await panes();
    assert.deepEqual(list.map(pane => pane.source).sort(), ['mock-2', 'mock-3', 'mock-4', 'share', 'video']);
    assert.equal(new Set(list.map(pane => pane.pid)).size, 5); assert.ok(list.every(pane => pane.command === 'node'));
    const owner = list.find(pane => pane.source === 'video')!, peer = list.find(pane => pane.source === 'mock-2')!;
    assert.equal(await tmux('show-options', '-qv', '-t', session, '@wbx_media_pid'), owner.pid);
    await until(async () => (await tmux('capture-pane', '-p', '-t', peer.id)).includes('▀'), 'peer has generated video');
    const childChromeCount = async (pid: string) => {
      const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim().split(/\s+/).filter(Boolean);
      const names = await Promise.all(children.map(pid => readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')));
      return names.filter(name => /chrome|chromium/i.test(name)).length;
    };
    assert.equal(await childChromeCount(owner.pid), 1);
    for (const viewer of list.filter(pane => pane !== owner)) assert.equal(await childChromeCount(viewer.pid), 0);
    await launch(); assert.deepEqual((await panes()).map(pane => pane.pid), list.map(pane => pane.pid), 'same call reuses the same processes/session');
    await tmux('send-keys', '-t', peer.id, '-l', 'x');
    await until(async () => (await tmux('capture-pane', '-p', '-t', peer.id)).includes('MOCK space · local-only chat'), 'space picker from native peer');
    await tmux('send-keys', '-t', peer.id, 'Enter');
    await until(async () => (await tmux('capture-pane', '-p', '-t', peer.id)).includes('TO SPACE:'), 'explicitly selected local-only demo space');
    await tmux('send-keys', '-t', peer.id, '-l', 'mvdcq chat test 世界'); await tmux('send-keys', '-t', peer.id, 'Enter');
    await until(async () => (await tmux('capture-pane', '-p', '-t', peer.id)).includes('Sent to the selected Webex SPACE'), 'native peer chat send acknowledgment');
    await tmux('send-keys', '-t', owner.id, '-l', 'x');
    await until(async () => (await tmux('capture-pane', '-p', '-t', owner.id)).includes('mvdcq chat test 世界'), 'chat history shared with owner without another SDK/browser');
    await tmux('send-keys', '-t', peer.id, 'Escape'); await tmux('send-keys', '-t', owner.id, 'Escape');
    await until(async () => (await tmux('capture-pane', '-p', '-t', peer.id)).includes('▀'), 'closing chat restores native video');
    assert.equal((await panes()).length, 5); assert.equal(await childChromeCount(owner.pid), 1);
    await command(peer.id, 'pane.split.vertical');
    await until(async () => (await panes()).length === 6, 'split action creates a real tmux pane');
    const extra = (await panes()).find(pane => !list.some(original => original.id === pane.id))!;
    await until(async () => (await tmux('capture-pane', '-p', '-t', extra.id)).includes('TMUX ·'), 'new native viewer is ready');
    await command(extra.id, 'pane.close');
    await until(async () => (await panes()).length === 5, 'close action removes only that native view');
    await command(peer.id, 'mock.add');
    await until(async () => {
      const list = await panes(); return list.length === 6 && list.some(pane => pane.source === 'mock-5');
    }, 'join creates and identifies its real pane');
    assert.ok((await panes()).some(pane => pane.source === 'mock-5'));
    await command(peer.id, 'mock.remove');
    await until(async () => (await panes()).length === 5, 'leave removes its real pane');
    await command(peer.id, 'mock.share');
    await until(async () => !(await panes()).some(pane => pane.source === 'share'), 'share end removes its pane');
    await command(peer.id, 'mock.share');
    await until(async () => (await panes()).some(pane => pane.source === 'share'), 'new share creates its pane');
    await command(peer.id, 'source.set share');
    await until(async () => (await tmux('display-message', '-p', '-t', session, '#{@wbx_source}')) === 'share', 'source selection focuses real pane');
    await command(peer.id, 'pane.maximize');
    await until(async () => (await tmux('display-message', '-p', '-t', session, '#{window_zoomed_flag}')) === '1', 'real tmux zoom');
    await command(peer.id, 'pane.maximize');
    await command(peer.id, 'layout.save savedNative');
    await until(async () => JSON.parse(await readFile(config, 'utf8')).layout === 'savedNative', 'save actual tmux geometry');
    await command(peer.id, 'layout gallery'); await command(peer.id, 'layout savedNative');
    assert.equal((await panes()).length, 5);
    const saved = JSON.parse(await readFile(config, 'utf8'));
    saved.theme = { focus: '#abcdef' }; saved.keybindings['!'] = ['source.set share', 'pane.maximize'];
    await writeFile(config, JSON.stringify(saved));
    await command(peer.id, 'reload');
    await until(async () => (await tmux('show-options', '-wv', '-t', session, 'pane-active-border-style')).includes('#abcdef'), 'reload changes native tmux border theme');
    await tmux('select-pane', '-t', peer.id); await tmux('send-keys', '-t', peer.id, '-l', '!');
    await until(async () => (await tmux('display-message', '-p', '-t', session, '#{@wbx_source}:#{window_zoomed_flag}')) === 'share:1', 'reloaded macro focuses and zooms real share pane');
    // Returning to inherit removes only the engine's own scoped overrides, not
    // a subsequent user change or anything from the underlying tmux config.
    await tmux('set-option', '-w', '-t', session, 'pane-border-style', 'fg=#334455');
    saved.tmux.appearance = 'inherit'; await writeFile(config, JSON.stringify(saved));
    await command(peer.id, 'reload');
    await until(async () => (await tmux('show-options', '-Aqv', '-t', session, 'status-left')) === 'USER-STATUS #S', 'opt-out restores inherited tmux status');
    assert.equal(await tmux('show-options', '-Aqv', '-t', session, 'status-style'), 'fg=#112233,bg=#223344');
    assert.equal(await tmux('show-options', '-wAqv', '-t', session, 'pane-active-border-style'), 'fg=#0f0f0f');
    assert.equal(await tmux('show-options', '-wAqv', '-t', session, 'pane-border-style'), 'fg=#334455', 'later user customization is retained');
    // This call has no attached clients throughout, but media remains owned by
    // its tmux process. Native tmux detach never tears the call down.
    assert.equal(await tmux('display-message', '-p', '-t', session, '#{session_attached}'), '0');
    assert.equal(await childChromeCount(owner.pid), 1);
    list = await panes();
    t.diagnostic('Native tmux session: ' + await tmux('list-sessions', '-F', '#{session_name}: #{session_windows} window(s)'));
    t.diagnostic('Native tmux pane/process evidence:\n' + await tmux('list-panes', '-t', session, '-F', paneFormat));
    assert.ok(!(await readdir(directory)).some(name => name.startsWith('wbx-launch-')), 'bootstrap files are consumed');
    await command(peer.id, 'quit');
    await until(async () => !await tmux('has-session', '-t', session).then(() => true, () => false), 'quit from viewer ends call and its managed panes');
    assert.equal(await tmux('has-session', '-t', 'unrelated').then(() => true, () => false), true, 'other sessions are untouched');
    await until(async () => {
      const status = await readFile(`/proc/${owner.pid}/status`, 'utf8').catch(() => '');
      return !status || /^State:\s+Z/m.test(status); // a container's init may reap zombies later
    }, 'owner exits');
  } finally { await tmux('kill-server').catch(() => {}); await rm(directory, { recursive: true, force: true }); }
});

test('concurrent launchers create one call owner; exact-name collisions never replace unrelated sessions', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 20_000,
}, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-native-race-'), socket = join(directory, 'tmux.sock');
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', WBX_TMUX_SOCKET: socket, WBX_TEMP_DIR: directory };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trim();
  await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'wbx-foreign', 'sleep 40');
  await tmux('new-session', '-d', '-s', 'wbx-race-other', 'sleep 40');
  const launch = (id: string) => exec(process.execPath, ['dist/cli.js', 'demo', '--call-id', id, '--detached', '--headless', '--renderer', 'blocks', '--participants', '2', '--duration', '9'], { env, timeout: 6000 });
  try {
    const foreign = await tmux('list-panes', '-t', 'wbx-foreign', '-F', '#{pane_pid}');
    await assert.rejects(launch('foreign'), error => /left untouched/.test(String((error as { stderr: string }).stderr)));
    assert.equal(await tmux('list-panes', '-t', 'wbx-foreign', '-F', '#{pane_pid}'), foreign);
    await Promise.all([launch('race'), launch('race')]);
    let evidence = '';
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      evidence = await tmux('list-panes', '-t', 'wbx-race', '-F', '#{pane_id}|#{pane_pid}|#{@wbx_source}');
      if (evidence.split('\n').length === 3 && evidence.includes('|share')) break;
      await delay(40);
    }
    assert.equal(evidence.split('\n').length, 3);
    const owners = evidence.split('\n').filter(line => line.endsWith('|video')); assert.equal(owners.length, 1);
    assert.equal(await tmux('has-session', '-t', 'wbx-race-other').then(() => true), true);
    const owner = owners[0]!.split('|')[0]!;
    // Source tags precede terminal readiness. Let the owner handle quit and
    // close its browser rather than killing tmux during profile writes.
    const readyDeadline = Date.now() + 5000;
    while (!(await tmux('capture-pane', '-p', '-t', owner)).includes('▀')) {
      assert.ok(Date.now() < readyDeadline, 'concurrent owner installs its terminal handler'); await delay(40);
    }
    await tmux('send-keys', '-t', owner, '-l', 'q');
    const ownerPid = owners[0]!.split('|')[1]!, exitDeadline = Date.now() + 5000;
    while (true) {
      const status = await readFile(`/proc/${ownerPid}/status`, 'utf8').catch(() => '');
      if (!status || /^State:\s+Z/m.test(status)) break;
      assert.ok(Date.now() < exitDeadline, 'concurrent owner closes Chrome and exits'); await delay(40);
    }
    t.diagnostic('Concurrent launchers share one native session:\n' + evidence);
  } finally { await tmux('kill-server').catch(() => {}); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
