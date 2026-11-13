import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { peopleId, validDirectoryQuery } from '../src/identity-contracts.js';
import { safeSpaceTitle, safeSpaceDescription } from '../src/action-contracts.js';
import { validLocalDrafts } from '../src/local-context-contracts.js';

test('wire admission has no operational filesystem/transport/action/provider dependency closure', async () => {
  const result = await build({ entryPoints: ['src/editor-protocol.ts'], platform: 'node', format: 'esm',
    bundle: true, write: false, metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(result.metafile!.inputs);
  for (const name of ['uploads', 'message-actions', 'conversation-actions', 'local-drafts', 'local-sections',
    'directory-search', 'people-status', 'sender-names', 'public-rest', 'attachment-transfer'])
    assert.ok(!inputs.includes(`src/${name}.ts`), `${name} is an owner, not a wire validation dependency`);
  const external = Object.values(result.metafile!.inputs).flatMap(input => input.imports.filter(value => value.external).map(value => value.path));
  assert.ok(external.every(name => ['node:path', 'node:string_decoder'].includes(name)), external.join(', '));
  const store = await readFile('src/messaging-store.ts', 'utf8');
  assert.doesNotMatch(store, /from '\.\/conversation-actions\.js'/);
  assert.match(store, /from '\.\/action-contracts\.js'/);
});
test('pure contracts retain independent language-neutral native fixture expectations', async () => {
  const fixture = JSON.parse(await readFile('test/policy-contracts.json', 'utf8'));
  const validators: Record<string, (v: unknown) => boolean> = {
    person: peopleId, title: safeSpaceTitle, query: validDirectoryQuery, description: safeSpaceDescription, drafts: validLocalDrafts,
  };
  assert.equal(fixture.version, 1);
  for (const row of fixture.cases) assert.equal(validators[row.kind]!(row.value), row.valid, JSON.stringify(row));
});
