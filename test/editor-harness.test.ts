import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { pluginVerificationEnvironment, verifyPlugin } from '../scripts/verify-plugin.js';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './editor/helpers.js';

const exec = promisify(execFile);
const stages = [['run', 'verify:isolated']];

test('plugin verifier delegates to preserved-copy acceptance and disables inherited media/source/build overrides', async () => {
  const inherited = { WBX_BROWSER_TEST: '1', WBX_SDK_TEST: '1', WBX_KITTY_TEST: '1', WBX_EDITOR_MEETING_TEST: '1', WBX_MESSAGING_TEST: '1', WBX_FUTURE_MEDIA_TEST: '1',
    WBX_LAZY_PATH: '/installed/lazy.nvim', WBX_TEST_SOURCE_BACKEND: '1', NODE_OPTIONS: '--require /unapproved.js',
    ESBUILD_BINARY_PATH: '/foreign/esbuild', TSX_TSCONFIG_PATH: '/foreign/tsconfig.json',
    WBX_STRICT_EDITORS: '1', WBX_VIM: '/full/vim', WBX_NVIM: '/full/nvim', VIMRUNTIME: '/full/runtime', PATH: '/keep/path' };
  const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  await verifyPlugin(inherited, async (args, env) => { calls.push({ args, env: { ...env } }); });
  assert.deepEqual(calls.map(call => call.args), stages);
  for (const { env } of calls) {
    for (const key of Object.keys(inherited).filter(key => /^WBX_.*_TEST$/.test(key))) assert.equal(env[key], '0', key);
    assert.equal(env.WBX_LAZY_PATH, undefined, 'only static LazyVim consistency runs by default');
    assert.equal(env.WBX_TEST_SOURCE_BACKEND, '0', 'inherited source mode cannot bypass the bundle gate');
    for (const key of ['NODE_OPTIONS', 'ESBUILD_BINARY_PATH', 'TSX_TSCONFIG_PATH']) assert.equal(env[key], undefined);
    for (const key of ['WBX_STRICT_EDITORS', 'WBX_VIM', 'WBX_NVIM', 'VIMRUNTIME', 'PATH'] as const) assert.equal(env[key], inherited[key], key);
  }
  assert.equal(inherited.WBX_EDITOR_MEETING_TEST, '1', 'the parent/explicit graphical command environment is not mutated');
  assert.equal(inherited.WBX_LAZY_PATH, '/installed/lazy.nvim');
  const defaults = pluginVerificationEnvironment({});
  for (const key of ['WBX_BROWSER_TEST', 'WBX_SDK_TEST', 'WBX_KITTY_TEST', 'WBX_EDITOR_MEETING_TEST', 'WBX_MESSAGING_TEST']) assert.equal(defaults[key], '0');
});

test('plugin verifier stops at the first failed stage instead of testing stale build output', async () => {
  for (let failure = 0; failure < stages.length; failure++) {
    const seen: string[][] = [];
    await assert.rejects(verifyPlugin({}, async args => {
      seen.push(args);
      if (seen.length === failure + 1) throw new Error('synthetic stage failure');
    }), /synthetic stage failure/);
    assert.deepEqual(seen, stages.slice(0, failure + 1));
  }
});

test('shared editor environments keep native runtime handling and all editor state private', () => {
  const directory = '/tmp/opencode/wbx-editor-harness-environment';
  const editors = editorBinaries({ WBX_NVIM: '/full/nvim', WBX_VIM: '/full/vim' });
  assert.deepEqual(editors, [{ name: 'Neovim', binary: '/full/nvim' }, { name: 'Vim', binary: '/full/vim' }]);
  assert.deepEqual(editorBinaries({ WBX_EDITOR_TEST_ONLY: 'Vim', WBX_VIM: '/full/vim' }), [{ name: 'Vim', binary: '/full/vim' }]);
  assert.throws(() => editorBinaries({ WBX_EDITOR_TEST_ONLY: 'absent' }), /explicitly name/);
  for (const editor of editors) {
    const env = editorEnvironment(editor, directory, { VIMRUNTIME: '/full/runtime', WBX_EDITOR_MEETING_TEST: '1' });
    assert.equal(env.WBX_CONFIG, join(directory, 'config.json'));
    assert.equal(env.WBX_EDITOR_RESULT, join(directory, 'result.json'));
    assert.equal(env.WBX_NODE, process.execPath);
    assert.equal(env.HOME, directory, 'Vim must not find user ~/.vim ftplugins either');
    assert.equal(env.XDG_CONFIG_HOME, directory);
    for (const key of ['XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']) assert.ok(env[key]?.startsWith(directory + '/'), key);
    assert.equal(env.VIMRUNTIME, editor.name === 'Neovim' ? undefined : '/full/runtime');
    assert.equal(env.WBX_EDITOR_MEETING_TEST, '1', 'explicit meeting suites retain their opt-in outside the baseline verifier');
  }
});

for (const editor of editorBinaries()) test(`${editor.name}: private backend evidence records actual native argv, not the source-mode policy`, { timeout: 20_000 }, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-backend-evidence-'), audit = join(directory, 'backend.jsonl');
  const env = editorEnvironment(editor, directory, { WBX_TEST_BACKEND_AUDIT: audit, WBX_TEST_SOURCE_BACKEND: '0' });
  try {
    if (!await editorAvailable(t, editor, env)) return;
    await writeFile(join(directory, 'config.json'), '{}');
    const result = await runEditorFixture(editor, 'uploads', env, 15_000);
    assert.deepEqual(result.errors, []);
    const records = (await readFile(audit, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(records.some(record => record.editor === editor.name && record.fixture === 'uploads'
      && record.started && record.argv[0] === process.execPath && record.argv.at(-1) === join(process.cwd(), 'dist/editor-main.js')));
    assert.ok(records.every(record => !record.argv.includes(join(process.cwd(), 'src/editor-main.ts'))));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('preserved-copy runner strips inherited source mode and build/test overrides before any child', async () => {
  const { stdout } = await exec('python3', ['-c', `
import importlib.util,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
s=importlib.util.spec_from_file_location("gate","scripts/verify-isolated.py")
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps(m.private_environment(Path("/tmp/opencode/private-synthetic-home"))))
`], { env: { ...process.env, WBX_TEST_SOURCE_BACKEND: '1', WBX_BROWSER_TEST: '1',
      WBX_TEST_BACKEND_AUDIT: '/FORBIDDEN-INHERITED-AUDIT', NODE_OPTIONS: '--require /FORBIDDEN.js', TSX_TSCONFIG_PATH: '/FORBIDDEN',
      ESBUILD_BINARY_PATH: '/FORBIDDEN', npm_config_node_options: '--require /FORBIDDEN.js' }, timeout: 5000 });
  const env = JSON.parse(stdout);
  assert.equal(env.WBX_TEST_SOURCE_BACKEND, '0');
  for (const key of ['WBX_BROWSER_TEST', 'WBX_TEST_BACKEND_AUDIT', 'NODE_OPTIONS', 'TSX_TSCONFIG_PATH',
    'ESBUILD_BINARY_PATH', 'npm_config_node_options']) assert.equal(env[key], undefined, key);
});

test('actual client runner skips missing editors normally but fails both required editors in strict mode', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-harness-missing-');
  const env: NodeJS.ProcessEnv = { ...pluginVerificationEnvironment(), WBX_NVIM: join(directory, 'missing-nvim'), WBX_VIM: join(directory, 'missing-vim') };
  // These are independent test runners, not workers of the parent Node test process.
  delete env.NODE_TEST_CONTEXT;
  const args = ['--import', 'tsx', '--test', '--test-reporter=tap', 'test/editor/client.test.ts'];
  try {
    const normal = await exec(process.execPath, args, { env: { ...env, WBX_STRICT_EDITORS: '0' }, timeout: 10_000 });
    assert.match(normal.stdout, /# skipped [1-9]\d*/);
    assert.match(normal.stdout, /Neovim\/protocol/);
    assert.match(normal.stdout, /Vim\/protocol/);
    assert.match(normal.stdout, /Set WBX_NVIM to a full editor binary/);
    assert.match(normal.stdout, /Set WBX_VIM to a full editor binary/);
    await assert.rejects(exec(process.execPath, args, { env: { ...env, WBX_STRICT_EDITORS: '1' }, timeout: 10_000 }), error => {
      const failure = error as { code?: unknown; stdout?: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout ?? '', /WBX_STRICT_EDITORS=1: Neovim: editor binary not found/);
      assert.match(failure.stdout ?? '', /WBX_STRICT_EDITORS=1: Vim: editor binary not found/);
      assert.match(failure.stdout ?? '', /# skipped 0/);
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('strict full-editor capability admission fails rather than silently skipping a limited Vim', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-harness-capabilities-'), binary = join(directory, 'limited-vim');
  const skipped: string[] = [], context = { skip(message?: string) { skipped.push(message ?? ''); } };
  try {
    await writeFile(binary, '#!/bin/sh\nexit 2\n', { mode: 0o700 });
    const editor = { name: 'Vim', binary } as const;
    await assert.rejects(editorAvailable(context, editor, { ...process.env, WBX_STRICT_EDITORS: '1' }), /WBX_STRICT_EDITORS=1: Vim: full editor capabilities unavailable/);
    assert.deepEqual(skipped, []);
    assert.equal(await editorAvailable(context, editor, { ...process.env, WBX_STRICT_EDITORS: '0' }), false);
    assert.match(skipped[0]!, /Vim requires \+job \+channel \+timers/);
    await writeFile(binary, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    await assert.rejects(editorAvailable(context, editor, { ...process.env, WBX_STRICT_EDITORS: '0' }));
    assert.equal(skipped.length, 1, 'unexpected probe failures are not hidden as unsupported-editor skips');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('meeting runner admits editors before starting or cleaning up even a private tmux server', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-harness-meeting-'), audit = join(directory, 'tmux-audit');
  try {
    await writeFile(join(directory, 'tmux'), '#!/bin/sh\nprintf hit > "$WBX_HARNESS_TMUX_AUDIT"\nexit 99\n', { mode: 0o700 });
    const env: NodeJS.ProcessEnv = { ...pluginVerificationEnvironment(), PATH: directory + delimiter + process.env.PATH, WBX_EDITOR_MEETING_TEST: '1', WBX_STRICT_EDITORS: '1',
      WBX_NVIM: join(directory, 'missing-nvim'), WBX_VIM: join(directory, 'missing-vim'), WBX_HARNESS_TMUX_AUDIT: audit };
    delete env.NODE_TEST_CONTEXT;
    await assert.rejects(exec(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', 'test/editor/meeting.test.ts'], { env, timeout: 10_000 }), error => {
      const failure = error as { code?: unknown; stdout?: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout ?? '', /WBX_STRICT_EDITORS=1/);
      return true;
    });
    await assert.rejects(readFile(audit), { code: 'ENOENT' }, 'tmux was never invoked, including kill-server cleanup');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
