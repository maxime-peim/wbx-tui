import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { readFile, readdir } from 'node:fs/promises';
test('unapproved reaction aliases, Sections sync and caller actors remain closed after explicit internal-interface approval', async () => {
  for (const method of ['reactions.list', 'reactions.summary', 'reactions.prepare', 'reactions.submit', 'reactions.add',
    'reactions.remove', 'reactions.delete', 'reactions.resolve', 'sections.import', 'sections.sync']) {
    for (const params of [{}, { actorId:'forged',uri:'https://synthetic.invalid',reactionId:'foreign' }])
      assert.throws(() => parseEditorOperation({ jsonrpc:'2.0',id:1,method,params }));
  }
  for (const path of ['src/editor-engine.ts', 'src/editor-worker.ts', 'src/read-status-worker.ts']) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /\b(?:addReaction|deleteReaction|getReactionSummaryByParentId)\s*\(/);
    assert.doesNotMatch(text, /from\s+['"][^'"]*test\/research/);
  }
});
test('research candidates remain test-only; approved reaction submode stays within the 32-capability limit', async () => {
  const catalogue = JSON.parse(await readFile('src/editor-features.json','utf8'));
  assert.equal(catalogue.capabilityLimit,32); assert.equal(catalogue.capabilities.length,32);
  assert.deepEqual(catalogue.features.messageReactions,{
    'pinned-internal-v1':{ capabilities:['messaging','message-actions-v1','local-context-v1'] },
    'viewport-batch-v1':{ capabilities:['messaging','message-actions-v1','local-context-v1'] },
    'self-summary-v1':{ capabilities:['messaging','message-actions-v1','local-context-v1'] },
    'progressive-v1':{ capabilities:['messaging','message-actions-v1','local-context-v1'] },
    'actor-details-v1':{ capabilities:['messaging','message-actions-v1','local-context-v1'] },
  });
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path,{ withFileTypes:true })) {
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) await visit(name);
      else if (entry.name.endsWith('.ts')) assert.doesNotMatch(await readFile(name,'utf8'),
        /(?:from\s*|import\s*\()\s*['"][^'"]*(?:test\/research|reaction-boundary-candidate|reaction-transport-fixture)/,name);
    }
  }
  await visit('src');
});
