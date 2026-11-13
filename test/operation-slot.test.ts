import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationSlot } from '../src/operation-slot.js';

test('operation cancellation retains admission until owner settlement; old releases cannot free a replacement', () => {
  const slot = new OperationSlot(), first = slot.acquire();
  slot.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(slot.busy(), true, 'revoked intent still owns unsettled work');
  assert.throws(() => slot.acquire(), /occupied/);
  assert.equal(slot.release(new AbortController()), false);
  assert.equal(slot.release(first), true);
  const second = slot.acquire();
  assert.equal(slot.release(first), false, 'a late old cleanup cannot release newer work');
  assert.equal(slot.busy(), true);
  assert.equal(second.signal.aborted, false);
  assert.equal(slot.release(second), true);
  assert.equal(slot.busy(), false);
});
