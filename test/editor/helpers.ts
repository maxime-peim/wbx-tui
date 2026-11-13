import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { TestContext } from 'node:test';

const exec = promisify(execFile);
export interface EditorBinary { name: 'Neovim' | 'Vim'; binary: string }
export interface EditorResult extends Record<string, unknown> { errors: unknown[] }

export function editorBinaries(env: NodeJS.ProcessEnv = process.env): EditorBinary[] {
  const binaries: EditorBinary[] = [{ name: 'Neovim', binary: env.WBX_NVIM || 'nvim' }, { name: 'Vim', binary: env.WBX_VIM || 'vim' }];
  if (!env.WBX_EDITOR_TEST_ONLY) return binaries;
  const selected = binaries.filter(editor => editor.name === env.WBX_EDITOR_TEST_ONLY);
  if (!selected.length) throw new Error('WBX_EDITOR_TEST_ONLY must explicitly name Neovim or Vim.');
  return selected;
}
function editorArguments(editor: EditorBinary): string[] {
  return editor.name === 'Neovim' ? ['--headless', '-u', 'NONE', '-i', 'NONE', '-n'] : ['-Nu', 'NONE', '-i', 'NONE', '-n', '-es'];
}
export function editorEnvironment(editor: EditorBinary, directory: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory, WBX_CONFIG: join(directory, 'config.json'),
    XDG_CONFIG_HOME: directory, XDG_DATA_HOME: join(directory, 'data'), XDG_CACHE_HOME: join(directory, 'cache'), XDG_STATE_HOME: join(directory, 'state'),
    WBX_EDITOR_ROOT: resolve('.'), WBX_EDITOR_RESULT: join(directory, 'result.json'), WBX_NODE: process.execPath, ...extra };
  if (editor.name === 'Neovim') delete env.VIMRUNTIME;
  return env;
}

/** Probe before meeting tests start even a private tmux server. */
export async function editorAvailable(t: Pick<TestContext, 'skip'>, editor: EditorBinary, env: NodeJS.ProcessEnv): Promise<boolean> {
  const missing = editor.name === 'Neovim' ? '!has("nvim")' : 'has("nvim") || !has("job") || !has("channel") || !has("timers")';
  try {
    await exec(editor.binary, [...editorArguments(editor), '-c', `if ${missing} || !exists("*json_decode") || !exists("*bufadd") || !exists("*win_execute") | cquit 2 | endif`, '-c', 'qa!'], { env, timeout: 2000 });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 'ENOENT' && code !== 2) throw error;
    const setting = editor.name === 'Neovim' ? 'WBX_NVIM' : 'WBX_VIM';
    const reason = `${editor.name}: ${code === 'ENOENT' ? 'editor binary not found' : 'full editor capabilities unavailable (Vim requires +job +channel +timers)'}. Set ${setting} to a full editor binary.`;
    if (env.WBX_STRICT_EDITORS === '1') throw new Error(`WBX_STRICT_EDITORS=1: ${reason}`);
    t.skip(reason); return false;
  }
}

export async function runEditorFixture(editor: EditorBinary, script: string, env: NodeJS.ProcessEnv, timeout: number): Promise<EditorResult> {
  const result = env.WBX_EDITOR_RESULT;
  if (!result) throw new Error('Missing private WBX_EDITOR_RESULT path.');
  try { await exec(editor.binary, [...editorArguments(editor), '-S', resolve(`test/editor/${script}.vim`)], { env: { ...env, WBX_TEST_FIXTURE: script }, timeout }); }
  catch (error) {
    const details = await readFile(result, 'utf8').catch(() => (error as { stderr?: string }).stderr || String(error));
    throw new Error(`${editor.name}/${script} exited: ${details}`);
  }
  const data: unknown = JSON.parse(await readFile(result, 'utf8'));
  if (!data || typeof data !== 'object' || !('errors' in data) || !Array.isArray(data.errors)) throw new Error(`${editor.name}/${script}: invalid editor result.`);
  return data as EditorResult;
}
