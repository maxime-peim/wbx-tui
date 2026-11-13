import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './helpers.js';
import { editorFixtures } from './fixtures.js';
for (const editor of editorBinaries()) for (const script of editorFixtures('cache-wrap', editor)) {
  test(`${editor.name}/${script}: cached presence and readable native history`, { timeout: 30_000 }, async t => {
    const directory = await mkdtemp('/tmp/opencode/wbx-cache-wrap-');
    try {
      await writeFile(join(directory, 'config.json'), '{}');
      const env = editorEnvironment(editor, directory);
      if (!await editorAvailable(t, editor, env)) return;
      const result = await runEditorFixture(editor, script, env, 25_000);
      if (result.errors.length) t.diagnostic(JSON.stringify(result));
      assert.deepEqual(result.errors, []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
