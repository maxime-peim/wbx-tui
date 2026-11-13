import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorEngine } from '../src/editor-engine.js';
test('named startup keeps every source combination and legacy overridden owner arity/defaults', async () => {
  for (let bits = 0; bits < 64; bits++) {
    const engine = new EditorEngine(); let received: unknown[] = [];
    engine.start = async (...args) => { received = args; };
    const flags = Array.from({ length: 6 }, (_, i) => !!(bits & 1 << i));
    await engine.startSession({ mode: 'demo', readStatus: flags[0], peopleStatus: flags[1],
      upcomingMeetings: flags[2], spacesCache: flags[3], notificationPreview: flags[4], senderNames: flags[5] });
    const expected: unknown[] = ['demo', undefined, ...flags];
    while (expected.length > 3 && expected.at(-1) === false) expected.pop();
    assert.deepEqual(received, expected);
  }
});
