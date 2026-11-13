import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { quote } from '../src/tmux.js';

const exec = promisify(execFile);
test('REAL tmux loads wbx-tui default JSON and explicit init: custom panels, function maps, status, modular reload, cleanup and retained drafts', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 25_000,
}, async t => {
  const dir = await mkdtemp('/tmp/opencode/wbx-config-cli-'), socket = join(dir, 'tmux.sock'), init = join(dir, 'init.mjs'), cleanup = join(dir, 'cleanup.log');
  const env = { ...process.env, TMUX: '', TMUX_PANE: '', WBX_CONFIG: undefined, XDG_CONFIG_HOME: dir, TERM: 'xterm-256color' };
  const tmux = async (...args: string[]) => (await exec('tmux', ['-S', socket, ...args], { env })).stdout.trimEnd();
  const screen = () => tmux('capture-pane', '-p', '-t', 'custom');
  const literal = (text: string) => tmux('send-keys', '-t', 'custom', '-l', text);
  const key = (...keys: string[]) => tmux('send-keys', '-t', 'custom', ...keys);
  const until = async (check: () => Promise<boolean>, label: string) => {
    for (let i = 0; i < 150; i++) { if (await check()) return; await delay(25); }
    throw new Error(`${label}\n${await screen().catch(() => '')}`);
  };
  await mkdir(join(dir, 'wbx-tui'));
  await writeFile(join(dir, 'wbx-tui', 'config.json'), JSON.stringify({ leader: ',', messaging: { keybindings: { normal: { Z: 'help' } } } }));
  const module = (version: number) => `import {appendFile} from 'node:fs/promises'; export default api => {
    api.panels.add('user.notes',()=>['PLUGIN PANEL v${version}']);
    api.layouts.add('custom',{direction:'vertical',ratio:.75,children:[{direction:'vertical',ratio:.3,children:[{panel:'rooms'},{direction:'horizontal',ratio:.7,children:[{panel:'messages'},{panel:'compose'}]}]},{panel:'user.notes'}]});
    api.layouts.use('custom');api.keymap.set('normal','<leader> F',()=>api.notify('FUNCTION v${version}'));
    api.ui.statusline(ctx=>({left:'PLUGIN STATUS v${version} '+ctx.mode,right:'CUSTOM RIGHT'}));
    api.commands.add('user.greet',(_ctx,args)=>api.notify('HELLO '+args));
    return ()=>appendFile(${JSON.stringify(cleanup)},'cleanup ${version}\\n');
  };`;
  await writeFile(init, module(1));
  const app = [process.execPath, 'dist/cli.js', 'messages', '--demo', '--init', init, '--duration', '18'].map(quote).join(' ');
  try {
    await tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'custom', '-x', '150', '-y', '42', app);
    await tmux('set-option', '-t', 'custom', 'remain-on-exit', 'on');
    await until(async () => (await screen()).includes('PLUGIN PANEL v1') && (await screen()).includes('3 spaces'), 'custom panel and default JSON');
    await literal(',F'); await until(async () => (await screen()).includes('FUNCTION v1'), 'function map uses comma leader from new default config');
    await literal('Z'); await until(async () => (await screen()).includes('Effective NORMAL mappings'), 'default JSON remap active');
    await key('Escape'); await delay(60); await key('Enter');
    await until(async () => (await screen()).includes('Morgan · DEMO'), 'select local space');
    await literal('i'); await literal('draft survives init reload'); await key('Escape'); await delay(60);
    await writeFile(init, module(2)); await literal(':reload'); await key('Enter');
    await until(async () => (await screen()).includes('PLUGIN PANEL v2'), 'new setup replaces prior generation');
    assert.ok((await screen()).includes('draft survives init reload')); assert.match(await readFile(cleanup, 'utf8'), /cleanup 1/);
    await literal(',F'); await until(async () => (await screen()).includes('FUNCTION v2'), 'new function map, not a stale handler');
    await literal(':user.greet world'); await key('Enter'); await until(async () => (await screen()).includes('HELLO world'), 'custom command arguments');
    t.diagnostic('Actual programmable TUI screen:\n' + await screen());
    await literal(':q!'); await key('Enter');
    await until(async () => (await readFile(cleanup, 'utf8').catch(() => '')).includes('cleanup 2'), 'cleanup on quit');
    assert.equal((await readFile(cleanup, 'utf8')).match(/cleanup 1/g)?.length, 1);
    assert.equal((await readFile(cleanup, 'utf8')).match(/cleanup 2/g)?.length, 1);
  } finally { await tmux('kill-server').catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('noninteractive config/auth inspection never executes even an explicitly supplied init module', {
  skip: process.env.WBX_MESSAGING_TEST !== '1', timeout: 10_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-no-exec-'), init = join(dir, 'init.mjs'), marker = join(dir, 'executed');
  const env = { ...process.env, WBX_CONFIG: undefined, XDG_CONFIG_HOME: dir };
  try {
    await writeFile(init, `import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(marker)},'unsafe');export default ()=>{};`);
    await exec(process.execPath, ['dist/cli.js', 'messages', '--print-config', '--init', init], { env });
    await assert.rejects(exec(process.execPath, ['dist/cli.js', 'messages', '--check-auth', '--init', init], { env }));
    await assert.rejects(readFile(marker), 'neither inspection path may execute user code');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
