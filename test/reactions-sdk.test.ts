import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
test('production reaction adapter, actual pinned SDK and transport: all native I/O blocked', {
  skip:process.env.WBX_READ_STATUS_SDK_TEST !== '1',timeout:30_000,
},async t=>{
  const { stdout }=await exec(process.execPath,['--import','tsx','test/reactions-sdk-fixture.ts'],{ timeout:25_000 });
  assert.match(stdout,/PASS: production reaction adapter/); t.diagnostic(stdout.trim());
});
