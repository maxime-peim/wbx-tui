/** Execute actual pinned SDK paths in a separate process with native I/O blocked. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

test('research: direct candidate execution without opt-in stops before optional SDK construction', async () => {
  await assert.rejects(promisify(execFile)(process.execPath,
    ['--import','tsx',resolve('test/research/reaction-transport-fixture.ts')],
    { timeout:5000,env:{ ...process.env,WBX_REACTIONS_RESEARCH_TEST:'0' } }),
  (error: any) => error.code === 1 && /requires explicit offline opt-in/.test(error.stderr));
});

test('research: candidate reaction boundary contains pinned SDK replay paths and retains physical admission, without native I/O', {
  skip: process.env.WBX_REACTIONS_RESEARCH_TEST !== '1', timeout: 25_000,
}, async t => {
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--import', 'tsx', resolve('test/research/reaction-transport-fixture.ts')], { timeout: 20_000 });
  assert.match(stdout, /PASS: research-only reaction transport candidate/);
  t.diagnostic(stdout.trim());
});
