import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { imagePreview } from '../src/message-images.js';

const png = imagePreview('a'.repeat(64), Buffer.alloc(240 * 144 * 3, 42)).png!;
for (const finish of ['eof', 'signal'] as const) {
  test(`private image lease: normalized bytes, private modes, cleanup on ${finish}`, { timeout: 5000 }, async () => {
    const directory = await mkdtemp('/tmp/opencode/wbx-image-lease-test-');
    const child = spawn(process.execPath, ['scripts/image-lease.mjs'], { env: { ...process.env, TMPDIR: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = once(child, 'close');
    try {
      let output = '';
      const ready = new Promise<string>((done, fail) => {
        child.once('error', fail);
        child.stdout.on('data', data => { output += String(data); if (output.includes('\n')) done(JSON.parse(output).path); });
      });
      child.stdin.write(JSON.stringify(png) + '\n');
      const path = await ready;
      assert.equal(dirname(dirname(path)), resolve(directory));
      assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.deepEqual(await readFile(path), Buffer.from(png, 'base64'));
      assert.deepEqual(Object.keys(JSON.parse(output)), ['path'], 'no attachment identity or image bytes in status output');
      if (finish === 'eof') child.stdin.end(); else child.kill('SIGTERM');
      assert.equal((await exited)[0], 0);
      assert.deepEqual(await readdir(directory), [], 'only the owned image and directory are removed');
    } finally {
      child.kill('SIGTERM');
      await exited;
      await rm(directory, { recursive: true, force: true });
    }
  });
}
test('image lease fails closed before allocating files for malformed, non-raster and oversized input', { timeout: 5000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-image-lease-invalid-');
  try {
    for (const input of ['https://example.com/private.png', JSON.stringify('PHN2Zz4=') + '\n', JSON.stringify(png + '!') + '\n', 'A'.repeat(8_010_001)]) {
      const child = spawn(process.execPath, ['scripts/image-lease.mjs'], { env: { ...process.env, TMPDIR: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
      const exited = once(child, 'close');
      let output = '', error = '';
      child.stdout.on('data', part => { output += part; });
      child.stderr.on('data', part => { error += part; });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      await exited;
      assert.equal(output, ''); assert.equal(error, '');
      assert.deepEqual(await readdir(directory), []);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
