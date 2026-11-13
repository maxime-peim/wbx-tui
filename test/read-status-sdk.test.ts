import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
const exec = promisify(execFile);
test('actual optional pinned SDK joined-elsewhere discovery uses only the existing read proxy and Mercury', {
  skip: process.env.WBX_READ_STATUS_SDK_TEST !== '1', timeout: 20_000,
}, async t => {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', resolve('test/read-status-joined-fixture.ts')], { timeout: 15_000 });
  assert.match(stdout, /PASS: actual SDK read-only joined-elsewhere/); t.diagnostic(stdout.trim());
});
test('actual optional pinned Node SDK read-status/receipt contract, with all network blocked', {
  skip: process.env.WBX_READ_STATUS_SDK_TEST !== '1', timeout: 20_000,
}, async t => {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', resolve('test/read-status-sdk-fixture.ts')], { timeout: 15_000 });
  assert.match(stdout, /PASS: actual SDK/); t.diagnostic(stdout.trim());
});
test('actual pinned public SDK receipt chain has one transport admission below acknowledge, with all network blocked', {
  skip: process.env.WBX_READ_STATUS_SDK_TEST !== '1', timeout: 20_000,
}, async t => {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', resolve('test/read-status-receipt-fixture.ts')], { timeout: 15_000 });
  assert.match(stdout, /PASS: actual SDK one-shot receipt chain/); t.diagnostic(stdout.trim());
});
for (const preview of [false, true]) for (const senderNames of [false, true]) test(`actual pinned public message listener reaches worker IPC, engine and native notifications (preview=${preview}, senderNames=${senderNames})`, {
  skip: process.env.WBX_READ_STATUS_SDK_TEST !== '1', timeout: 20_000,
}, async t => {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', resolve('test/read-status-message-events-fixture.ts'),
    ...(preview ? ['--preview'] : []), ...(senderNames ? ['--sender-names'] : [])], { timeout: 15_000 });
  assert.match(stdout, /PASS: actual SDK public created event/); t.diagnostic(stdout.trim());
});
