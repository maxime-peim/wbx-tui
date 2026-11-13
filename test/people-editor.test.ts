import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './editor/helpers.js';

// Keep the former standalone popup-ownership regression in the core tier, but
// share the native fixture instead of maintaining a second generated UI script.
for (const editor of editorBinaries()) test(`${editor.name}: native People ownership and late replies use only inert mocked RPC`, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-people-editor-');
  const env = editorEnvironment(editor, directory);
  try {
    if (!await editorAvailable(t, editor, env)) return;
    const result = await runEditorFixture(editor, 'people-ownership', env, 15_000);
    assert.deepEqual(result.errors, []);
    assert.equal((result.checks as string[]).length, 14);
    assert.equal(result.requests, 14, 'only the deliberately explicit provider reads are admitted');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
