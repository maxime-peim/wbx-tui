import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { editorFeatures } from '../src/editor-features.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
test('actual hello preserves the independently frozen pre-consolidation advertisement', async () => {
  const expected = JSON.parse(await readFile('test/editor-feature-contract.json', 'utf8')).advertisement;
  const output: any[] = [], rpc = new EditorRPC(new EditorEngine(), new EditorMeetings(), value => { output.push(value); });
  try {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } }));
    const { version, backend, state, meeting, ...features } = output.at(-1).result;
    assert.equal(version, 1); assert.equal(backend, 'wbx-tui');
    assert.deepEqual(features, expected);
    const detached = editorFeatures(); detached.capabilities.length = 0; detached.localDrafts!.push('invented');
    assert.deepEqual(editorFeatures(), expected, 'callers cannot mutate the catalogue');
    for (const field of Object.keys(expected).filter(key => key !== 'capabilities'))
      assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 2, method: field, params: {} }), /Unknown/);
  } finally { await rpc.close(); }
});
