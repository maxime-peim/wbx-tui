import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrictMocks } from './strict-mocks.js';
import { handled, until } from './async-test.js';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers } from '../src/room-members.js';
import type { ActionREST } from '../src/public-rest.js';

test('strict mocks retain assertions even when the caller catches every thrown error', async () => {
  const mocks = new StrictMocks();
  const call = mocks.wrap(async () => { assert.fail('UNEXPECTED OPERATION'); });
  const outcome = await call('/v1/unexpected', 'GET', 'SYNTHETIC', new AbortController().signal)
    .then(() => 'success', () => 'failed');
  assert.equal(outcome, 'failed', 'an ordinary outcome-only negative test would pass here');
  assert.throws(() => mocks.verify(), /Mock assertions were caught/);
  mocks.verify();
});
test('a forbidden fallback caught by the real mutation owner still fails the replacement mock contract', async () => {
  const mocks = new StrictMocks(), calls: string[] = [];
  const rest: ActionREST = { busy: () => false, call: async () => ({ value: {} }) };
  mocks.track(rest);
  // Races replace callbacks after construction; the recorder must follow them.
  rest.call = async (path, method) => {
    calls.push(method + ' ' + path);
    assert.fail('UNEXPECTED GET / fallback');
  };
  const owner = new ConversationActions(rest, new RoomMembers(),
    () => ({ token: 'SYNTHETIC', scopes: ['spark:all'], expiresAt: Date.now() + 10000 }),
    async () => 'self');
  try {
    assert.equal((await owner.rename('rename', 'room', 'Before', 'After', () => true)).outcome.status, 'failed');
    assert.deepEqual(calls, ['GET /v1/rooms/room'], 'complete forbidden trace, with no mutation');
    assert.throws(() => mocks.verify(), /Mock assertions were caught/);
    mocks.verify();
  } finally { owner.reset(); }
});
test('bounded test waits terminate with a frozen wall clock and retain normal rejection assertions', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  await assert.rejects(until(() => false, 'missing callback', 15), /Timed out waiting for synthetic missing callback/);
  await assert.rejects(handled(Promise.reject(new Error('Expected rejection'))), /Expected rejection/);
  await until(() => true, 'already ready', 15);
});
