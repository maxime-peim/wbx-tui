import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const exec = promisify(execFile);
test('LazyVim installation guide includes the complete checked-in plugin spec', async () => {
  const [example, guide] = await Promise.all([
    readFile('examples/lazyvim.lua', 'utf8'), readFile('docs/editor.md', 'utf8'),
  ]);
  const snippet = /### LazyVim\n[\s\S]*?```lua\n([\s\S]*?)\n```/.exec(guide)?.[1];
  assert.equal(snippet?.trim(), example.trim());
});

test('documented LazyVim spec imports through real lazy.nvim, preserves editor defaults and runs only an explicit local demo', {
  skip: !process.env.WBX_LAZY_PATH, timeout: 30_000,
}, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-lazyvim-');
  const result = join(directory, 'result.json');
  try {
    const plugins = join(directory, 'config/nvim/lua/plugins');
    await mkdir(plugins, { recursive: true });
    const example = await readFile('examples/lazyvim.lua', 'utf8');
    // Change only the user's checkout path, as instructed in the guide.
    const spec = example.replace("vim.fn.expand('~/src/wbx-tui')", JSON.stringify(resolve('.')));
    assert.notEqual(spec, example);
    await writeFile(join(plugins, 'wbx-tui.lua'), spec);
    await writeFile(join(directory, 'config.json'), '{}');
    const env: NodeJS.ProcessEnv = {
      ...process.env, NVIM_APPNAME: 'nvim',
      XDG_CONFIG_HOME: join(directory, 'config'), XDG_DATA_HOME: join(directory, 'data'),
      XDG_CACHE_HOME: join(directory, 'cache'), XDG_STATE_HOME: join(directory, 'state'),
      WBX_CONFIG: join(directory, 'config.json'), WBX_EDITOR_RESULT: result,
      WBX_LAZY_PATH: resolve(process.env.WBX_LAZY_PATH!),
    };
    delete env.VIMRUNTIME;
    await exec(process.env.WBX_NVIM || 'nvim', ['--headless', '-u', resolve('test/lazyvim/init.lua'), '-i', 'NONE', '-n'], {
      env, timeout: 25_000,
    }).catch(async (error: any) => {
      throw new Error(`Neovim exited: ${await readFile(result, 'utf8').catch(() => error.stderr)}`);
    });
    const data = JSON.parse(await readFile(result, 'utf8'));
    if (data.errors.length) t.diagnostic(JSON.stringify(data));
    assert.deepEqual(data.errors, []);
    assert.equal(data.startup_backend_running, 0);
    t.diagnostic('Real lazy.nvim import/setup and account-free messaging passed; no full LazyVim distribution or remote installation was run.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
