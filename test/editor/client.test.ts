import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './helpers.js';
import { editorFixtures } from './fixtures.js';

for (const editor of editorBinaries()) {
  for (const script of editorFixtures('client', editor)) {
  test(`${editor.name}/${script}: native editing, safe delivery and transport lifecycle`, { timeout: 30_000 }, async t => {
    const directory = await mkdtemp('/tmp/opencode/wbx-editor-client-'), config = join(directory, 'config.json');
    await writeFile(config, '{}');
    try {
      const env = editorEnvironment(editor, directory, { WBX_EDITOR_AUDIT: join(directory, 'audit') });
      if (!await editorAvailable(t, editor, env)) return;
      await writeFile(env.WBX_EDITOR_AUDIT!, '');
      const data = await runEditorFixture(editor, script, env, 25_000);
      if (data.errors.length) t.diagnostic(JSON.stringify(data));
      if (Array.isArray(data.work)) t.diagnostic(JSON.stringify({ work: data.work }));
      assert.deepEqual(data.errors, []);
      if (typeof data.skip === 'string') { t.skip(data.skip); return; }
      t.diagnostic(`${editor.name}/${script}: passed with no editor assertion errors`);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  }
}
