/** Bounded installed-source audit. Absence in this input is not global API absence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

test('research: exact installed SDK inputs and source search do not confuse favorites with native personal Sections', {
  skip: process.env.WBX_REACTIONS_RESEARCH_TEST !== '1',
}, async t => {
  const base = fileURLToPath(new URL('../../optional/read-status-sdk/', import.meta.url));
  const inventory = JSON.parse(await readFile(new URL('./sdk-inventory.json', import.meta.url), 'utf8'));
  for (const [path, hash] of Object.entries(inventory.sha256)) {
    assert.equal(createHash('sha256').update(await readFile(join(base, path))).digest('hex'), hash, path);
  }
  const found: string[] = [], packages = join(base, 'node_modules/@webex');
  let scanned = 0;
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (/\.(js|ts)$/.test(entry.name)) {
        scanned++; assert.ok(scanned <= 1000, 'bounded source audit');
        const content = await readFile(full, 'utf8');
        assert.ok(Buffer.byteLength(content) <= 2_097_152);
        for (const [index, line] of content.split('\n').entries()) {
          if (/\bsections?\b|favorite|unfavorite/i.test(line)) found.push(relative(packages, full).replaceAll('\\', '/') + ':' + (index + 1));
        }
      }
    }
  }
  for (const entry of await readdir(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(packages, entry.name, 'src');
    try { await readdir(source); } catch { continue; }
    await visit(source);
  }
  assert.equal(scanned, 238, 'new installed source requires a fresh review, not an old absence claim');
  assert.deepEqual(found.sort(), [
    'internal-plugin-conversation/src/conversation.js:179',
    'internal-plugin-conversation/src/conversation.js:2462',
    'internal-plugin-conversation/src/conversation.js:2464',
    'internal-plugin-conversation/src/conversation.js:2499',
    'webex-core/src/credentials-config.js:61', 'webex-core/src/credentials-config.js:71',
    'webex-core/src/credentials-config.js:83', 'webex-core/src/credentials-config.js:95',
    'webex-core/src/lib/credentials/credentials.js:204', 'webex-core/src/lib/credentials/credentials.js:207',
    'webex-core/src/lib/credentials/credentials.js:211', 'webex-core/src/lib/credentials/credentials.js:224',
  ].sort());
  t.diagnostic(JSON.stringify({ researchedFiles: scanned, inputHashes: Object.keys(inventory.sha256).length,
    sectionHits: found.length, finding: 'favorites and unrelated token/RFC text only; no validated native Sections provider' }));
});
