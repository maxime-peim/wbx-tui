import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './helpers.js';
import { editorFixtures } from './fixtures.js';

for (const editor of editorBinaries()) for (const fixture of editorFixtures('review-remediation', editor)) {
  test(`${editor.name}/${fixture}: review remediation`, { timeout: 30_000 }, async t => {
    const directory = await mkdtemp('/tmp/opencode/wbx-remediation-native-');
    try {
      await writeFile(join(directory, 'config.json'), '{}');
      await writeFile(join(directory, 'audit'), '');
      const env = editorEnvironment(editor, directory, { WBX_EDITOR_AUDIT: join(directory, 'audit') });
      if (!await editorAvailable(t, editor, env)) return;
      const result = await runEditorFixture(editor, fixture, env, 25_000);
      if (result.work) t.diagnostic(JSON.stringify({ work: result.work }));
      assert.deepEqual(result.errors, []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
