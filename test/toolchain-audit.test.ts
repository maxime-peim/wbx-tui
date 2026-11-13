import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
test('installed-tool audit detects a lock mismatch without repairing dependencies or trusting build overrides', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-toolchain-audit-');
  try {
    await writeFile(join(directory, 'package.json'), await readFile('package.json'));
    await writeFile(join(directory, 'package-lock.json'), await readFile('package-lock.json'));
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    const script = `
import importlib.util,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location("tools",sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
root=Path(sys.argv[2]);before=module.audit(root)
path=root/"package-lock.json";lock=json.loads(path.read_text())
lock["packages"]["node_modules/esbuild"]["version"]="0.0.0-synthetic-mismatch"
path.write_text(json.dumps(lock));after=module.audit(root)
print(json.dumps({"before":before,"after":after}))
`;
    const { stdout } = await exec('python3', ['-c', script, resolve('scripts/verify-toolchain.py'), directory], {
      timeout: 25_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '--require /FORBIDDEN-OVERRIDE.js', ESBUILD_BINARY_PATH: '/FORBIDDEN-ESBUILD', TSX_TSCONFIG_PATH: '/FORBIDDEN-CONFIG' },
    });
    const { before, after } = JSON.parse(stdout);
    assert.equal(before.status, 'matched-installed-versions');
    assert.equal(after.status, 'mismatch');
    assert.deepEqual(after.mismatches, [{ tool: 'esbuild', fields: ['version'] }]);
    assert.equal(after.tools.esbuild.installed, before.tools.esbuild.installed);
    for (const key of Object.keys(before.tools)) assert.equal(after.tools[key].tree_sha256, before.tools[key].tree_sha256);
    assert.match(before.not_proven, /clean-install/);
    assert.ok(before.tools['tsx-esbuild-native'].entry_sha256);
    assert.equal(before.node.version, process.version);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
