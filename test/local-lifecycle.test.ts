import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('local consumers share exact-owner release and guarded terminal mechanics, not meeting/notifier policy', async () => {
  for (const path of ['attachments', 'image_external']) {
    const source = await readFile(`autoload/wbx/${path}.vim`, 'utf8');
    assert.match(source, /wbx#local_job#release\(previous\)/);
    assert.match(source, /wbx#local_terminal#open\(argv,/);
    assert.doesNotMatch(source, /\b(?:termopen|term_start)\(/);
  }
  for (const path of ['src/editor-meetings.ts', 'autoload/wbx/notifications.vim']) {
    assert.doesNotMatch(await readFile(path, 'utf8'), /wbx#local_(?:job|terminal)/);
  }
});
test('shared local mechanisms have no replacement registry, retry, broad filesystem or leave policy', async () => {
  const source = await readFile('autoload/wbx/local_job.vim', 'utf8');
  assert.doesNotMatch(source, /let s:active|timer_start|delete\(|remove\(|meeting#|transport#/);
  const terminal = await readFile('autoload/wbx/local_terminal.vim', 'utf8');
  assert.match(terminal, /b:changedtick != tick/);
  assert.match(terminal, /win_getid\(\) != window/);
  assert.match(terminal, /term_getjob\(buffer\)/);
});
