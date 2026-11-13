import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('read-only CLI static dependency graph excludes host and Puppeteer ownership infrastructure', async () => {
  const result = await build({ entryPoints: ['src/cli.ts'], bundle: true, write: false, metafile: true,
    platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  const inputs = result.metafile!.inputs, seen = new Set<string>();
  function visit(path: string) {
    if (seen.has(path)) return; seen.add(path);
    for (const dependency of inputs[path]?.imports ?? []) {
      if (dependency.kind === 'dynamic-import') continue;
      assert.ok(!/puppeteer|chromium-bidi|devtools-protocol/.test(dependency.path), dependency.path);
      if (!dependency.external) visit(dependency.path);
    }
  }
  visit('src/cli.ts');
  assert.ok(!seen.has('src/host.ts'), 'view must not evaluate the media owner module');
  assert.ok(seen.has('src/viewer.ts'));
  assert.ok(inputs['src/cli.ts']!.imports.some(item => item.path === 'src/host.ts' && item.kind === 'dynamic-import'));
  assert.ok(inputs['src/host.ts']!.imports.some(item => item.path === 'puppeteer-core' && item.kind === 'dynamic-import'));
  for (const output of Object.values(result.metafile!.outputs)) {
    assert.ok(output.imports.filter(item => /puppeteer|chromium-bidi|devtools-protocol/.test(item.path)).every(item => item.kind === 'dynamic-import'), 'the actual CLI bundle must also preserve lazy ownership imports');
  }
});
test('source CLI viewer admission evaluates with ownership imports actively forbidden', { timeout: 10_000 }, async () => {
  const hook = `export async function resolve(specifier, context, next) {
    if (/puppeteer|chromium-bidi|devtools-protocol|\\/host\\.[jt]s$/.test(specifier)) throw new Error('OWNER_IMPORT_FORBIDDEN: ' + specifier);
    return next(specifier, context);
  }`;
  const program = `import { register } from 'node:module';
    register(${JSON.stringify('data:text/javascript,' + encodeURIComponent(hook))}, import.meta.url);
    process.argv = [process.execPath, 'src/cli.ts', 'view', '--session', '/unused/not-connected.sock', '--source', 'video'];
    await import('./src/cli.ts');`;
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
      cwd: new URL('../', import.meta.url), timeout: 8000,
      env: { ...process.env, WBX_CONFIG: '', XDG_CONFIG_HOME: '/unused/wbx-viewer-import', WBX_BROWSER_TEST: '0' },
    });
    assert.fail('noninteractive viewer should stop before connecting');
  } catch (error) {
    const result = error as { code?: number; stderr?: string };
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stderr ?? '', /OWNER_IMPORT_FORBIDDEN/);
    assert.match(result.stderr ?? '', /interactive terminal is required/);
  }
});
