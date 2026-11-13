import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('all blocking menu fallbacks are confined to the shared native chooser', async () => {
  const paths = ['autoload/wbx.vim', ...(await readdir('autoload/wbx')).filter(name => name.endsWith('.vim')).map(name => `autoload/wbx/${name}`)];
  const blocking: string[] = [];
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    for (const _match of source.matchAll(/\binputlist\s*\(/g)) blocking.push(path);
  }
  assert.deepEqual(blocking, ['autoload/wbx/chooser.vim'], 'only editors lacking both native UI APIs may use the legacy fallback');
  const chooser = await readFile('autoload/wbx/chooser.vim', 'utf8');
  assert.match(chooser, /has\('nvim'\)/); assert.match(chooser, /exists\('\*popup_menu'\)/);
  for (const owner of ['notifications', 'sections', 'members', 'meeting', 'conversations', 'message_actions', 'rich']) {
    assert.match(await readFile(`autoload/wbx/${owner}.vim`, 'utf8'), /wbx#chooser#select\(/, `${owner}: native chooser delegation`);
  }
});
