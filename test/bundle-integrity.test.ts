import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUNDLE_FILES, verifyBundles, type BundleBuild } from '../scripts/verify-bundles.js';

async function fixture() {
  const root = await mkdtemp('/tmp/opencode/wbx-bundle-integrity-test-');
  for (const name of ['src', 'scripts', 'dist', 'node_modules']) await mkdir(join(root, name));
  for (const [name, text] of Object.entries({ 'src/main.ts': 'export const example = 1;\n', 'scripts/build.ts': '// synthetic build only\n',
    'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'tsconfig.json': '{}' })) await writeFile(join(root, name), text);
  const bytes = (name: string) => Buffer.from(`Synthetic frozen artifact: ${name}\n`);
  for (const name of BUNDLE_FILES) await writeFile(join(root, 'dist', name), bytes(name));
  const projects: string[] = [];
  const build: BundleBuild = async project => {
    projects.push(project);
    assert.notEqual(project, root);
    assert.equal(await readFile(join(project, 'src/main.ts'), 'utf8'), 'export const example = 1;\n');
    assert.equal(await readFile(join(project, 'scripts/build.ts'), 'utf8'), '// synthetic build only\n');
    await mkdir(join(project, 'dist'));
    for (const name of BUNDLE_FILES) await writeFile(join(project, 'dist', name), bytes(name));
  };
  return { root, build, projects, close: () => rm(root, { recursive: true, force: true }) };
}

test('bundle integrity compares all ten files to two isolated builds and never rewrites the checkout', async () => {
  const f = await fixture();
  try {
    const before = await Promise.all(BUNDLE_FILES.map(name => readFile(join(f.root, 'dist', name))));
    const result = await verifyBundles(f.root, f.build);
    assert.equal(result.policy, 'two-isolated-builds'); assert.equal(Object.keys(result.artifacts).length, 10);
    assert.equal(f.projects.length, 2); assert.notEqual(f.projects[0], f.projects[1]);
    assert.equal(Object.keys(result.inputs).length, 5);
    assert.deepEqual(await Promise.all(BUNDLE_FILES.map(name => readFile(join(f.root, 'dist', name)))), before);
    for (const project of f.projects) await assert.rejects(readdir(project), { code: 'ENOENT' });
  } finally { await f.close(); }
});

for (const name of ['cli.js', 'editor-main.js.map']) test(`bundle integrity rejects stale/corrupt ${name} without repairing it implicitly`, async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'dist', name), 'Different artifact');
    await assert.rejects(verifyBundles(f.root, f.build), new RegExp(`Bundles do not match current source:.*${name.replaceAll('.', '\\.')}`));
    assert.equal(await readFile(join(f.root, 'dist', name), 'utf8'), 'Different artifact');
  } finally { await f.close(); }
});

test('bundle integrity rejects missing/extra artifacts before starting builds', async () => {
  const f = await fixture();
  try {
    await rm(join(f.root, 'dist', 'cli.js.map'));
    await assert.rejects(verifyBundles(f.root, f.build), /exactly five bundles/);
    await writeFile(join(f.root, 'dist', 'cli.js.map'), 'restored');
    await writeFile(join(f.root, 'dist', 'unexpected.txt'), 'Retain user work');
    await assert.rejects(verifyBundles(f.root, f.build), /exactly five bundles/);
    assert.equal(f.projects.length, 0);
    assert.equal(await readFile(join(f.root, 'dist', 'unexpected.txt'), 'utf8'), 'Retain user work');
  } finally { await f.close(); }
});

test('bundle integrity detects disagreement between independent builds', async () => {
  const f = await fixture(); let calls = 0;
  try {
    await assert.rejects(verifyBundles(f.root, async project => {
      const call = ++calls; await f.build(project);
      if (call === 2) await writeFile(join(project, 'dist', 'browser.js'), 'nondeterministic output');
    }), /Isolated builds disagree: browser\.js/);
  } finally { await f.close(); }
});

test('bundle integrity rejects source edits racing the verification', async () => {
  const f = await fixture();
  try {
    await assert.rejects(verifyBundles(f.root, async project => {
      await f.build(project);
      await writeFile(join(f.root, 'src/main.ts'), 'Changed source');
    }), /Build inputs changed during verification: src\/main\.ts/);
    assert.equal(await readFile(join(f.root, 'src/main.ts'), 'utf8'), 'Changed source');
  } finally { await f.close(); }
});

test('bundle integrity rejects checkout artifact changes racing the verification', async () => {
  const f = await fixture();
  try {
    await assert.rejects(verifyBundles(f.root, async project => {
      await f.build(project);
      await writeFile(join(f.root, 'dist', 'cli.js'), 'Changed outside the verifier');
    }), /Checkout bundles changed during verification/);
    assert.equal(await readFile(join(f.root, 'dist', 'cli.js'), 'utf8'), 'Changed outside the verifier');
  } finally { await f.close(); }
});

test('bundle integrity rejects symlinked inputs or artifacts rather than following unexpected files', async () => {
  const f = await fixture();
  try {
    await symlink(join(f.root, 'package.json'), join(f.root, 'src', 'external.ts'));
    await assert.rejects(verifyBundles(f.root, f.build), /Unsupported build input/);
    await rm(join(f.root, 'src', 'external.ts'));
    await rm(join(f.root, 'dist', 'cli.js'));
    await symlink(join(f.root, 'package.json'), join(f.root, 'dist', 'cli.js'));
    await assert.rejects(verifyBundles(f.root, f.build), /Expected a regular file/);
    assert.equal(f.projects.length, 0);
  } finally { await f.close(); }
});

test('failed isolated builds are reported without changing artifacts and clean up private copies', async () => {
  const f = await fixture();
  try {
    await assert.rejects(verifyBundles(f.root, async project => {
      await f.build(project); throw new Error('Synthetic build failure');
    }), /Synthetic build failure/);
    assert.match(await readFile(join(f.root, 'dist', 'cli.js'), 'utf8'), /Synthetic frozen artifact/);
    for (const project of f.projects) await assert.rejects(readdir(project), { code: 'ENOENT' });
  } finally { await f.close(); }
});
