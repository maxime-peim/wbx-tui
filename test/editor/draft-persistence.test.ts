import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './helpers.js';
import { fixtureInventory } from './fixtures.js';

for (const editor of editorBinaries()) for (const fixture of fixtureInventory.restart) test(`${editor.name}: drafts survive a completely fresh editor process`, { timeout: 45_000 }, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-draft-restart-');
  try {
    await writeFile(join(directory, 'config.json'), '{}');
    const env = editorEnvironment(editor, directory, { WBX_EDITOR_AUDIT: join(directory, 'audit') });
    await writeFile(env.WBX_EDITOR_AUDIT!, '');
    if (!await editorAvailable(t, editor, env)) return;
    for (const phase of ['save', 'restore']) {
      const result = await runEditorFixture(editor, fixture, { ...env, WBX_DRAFT_PHASE: phase }, 20_000);
      assert.deepEqual(result.errors, [], `${phase}: ${JSON.stringify(result)}`);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
