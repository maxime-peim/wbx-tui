import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fixtureInventory as inventory } from './editor/fixtures.js';

test('every native fixture has an explicit mode/editor inventory or a documented exclusion', async () => {
  const suiteNames = Object.values(inventory.suites).flat();
  const names = [...suiteNames, ...inventory.mediaOptIn, ...Object.keys(inventory.excluded)];
  assert.equal(new Set(names).size, names.length, 'no duplicate admission/hidden suite ownership');
  assert.deepEqual(names.sort(), (await readdir('test/editor')).filter(name => name.endsWith('.vim')).map(name => name.slice(0, -4)).sort());
  for (const name of [...Object.keys(inventory.headlessOnly), ...inventory.restart, ...Object.keys(inventory.editorOverrides)])
    assert.ok(suiteNames.includes(name), name);
  for (const reason of [...Object.values(inventory.headlessOnly), ...Object.values(inventory.excluded)]) assert.ok(reason.length > 20);
  assert.deepEqual(inventory.defaultModes, ['headless', 'drawn']);
  assert.deepEqual(inventory.defaultEditors, ['nvim', 'vim']);
  assert.deepEqual(inventory.editorOverrides, { 'image-incremental': ['nvim'] }, 'Neovim-only cannot become a no-op Vim pass');
  assert.ok(suiteNames.includes('activity') && !inventory.headlessOnly.activity, 'positive drawn Vim activity cell is required');
  assert.deepEqual(inventory.restart, ['draft-persistence']);
});
test('headless, drawn and preserved-copy gates consume the shared inventory', async () => {
  for (const name of ['client', 'cache-wrap', 'review-remediation'])
    assert.match(await readFile(`test/editor/${name}.test.ts`, 'utf8'), /editorFixtures\(/);
  for (const path of ['test/editor/drawn.py', 'scripts/verify-isolated.py'])
    assert.match(await readFile(path, 'utf8'), /fixtures\.json/);
});
test('UI, timestamp, Markdown, recovery and People popup fixtures cannot be excluded from either focused editor gate', () => {
  const selection = JSON.parse(execFileSync('python3', ['-c', `
import ast, json
from pathlib import Path
tree = ast.parse(Path("scripts/verify-isolated.py").read_text())
pattern = next(node.value.value for node in ast.walk(tree)
    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant)
    and any(isinstance(target, ast.Name) and target.id == "pattern" for target in node.targets))
drawn = next(comparison.comparators[0] for node in ast.walk(tree) if isinstance(node, ast.ListComp)
    for generator in node.generators for comparison in generator.ifs
    if isinstance(comparison, ast.Compare) and isinstance(comparison.left, ast.Name)
    and comparison.left.id == "name" and isinstance(comparison.comparators[0], ast.Set))
print(json.dumps({"pattern": pattern, "drawn": sorted(ast.literal_eval(drawn))}))
`], { encoding: 'utf8' })) as { pattern: string; drawn: string[] };
  for (const fixture of ['ui', 'history-timestamps', 'history-syntax-buckets', 'history-features', 'reading', 'replies', 'thread-subtrees', 'sdk-native-recovery', 'people-popup', 'read-by']) {
    assert.ok(inventory.suites.client!.includes(fixture));
    assert.equal(inventory.excluded[fixture], undefined);
    assert.equal(inventory.headlessOnly[fixture], undefined);
    for (const editor of ['Neovim', 'Vim']) assert.match(`${editor}/${fixture}:`, new RegExp(selection.pattern));
    assert.ok(selection.drawn.includes(fixture), `${fixture} must also be drawn in both editors`);
  }
});
