import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorEngine } from '../src/editor-engine.js';

test('local context is an ephemeral session fence, never a durable account identity', async () => {
  const engine = new EditorEngine(), other = new EditorEngine();
  try {
    assert.equal(engine.snapshot().localContext, undefined);
    await engine.start('demo'); await other.start('demo');
    const first = engine.snapshot().localContext!;
    assert.deepEqual(Object.keys(first).sort(), ['coverage', 'sessionId']);
    assert.equal(first.coverage, 'session-only');
    assert.match(first.sessionId, /^[a-f0-9]{32}$/);
    assert.notEqual(first.sessionId, other.snapshot().localContext!.sessionId);
    await engine.select('demo-general');
    assert.deepEqual(engine.snapshot().localContext, first);
    const changed = engine.snapshot().localContext!;
    changed.sessionId = 'foreign';
    assert.deepEqual(engine.snapshot().localContext, first, 'defensive metadata snapshot');
    await engine.start('demo');
    assert.deepEqual(engine.snapshot().localContext, first, 'idempotent ready start is not a new session');
    engine.stop();
    assert.equal(engine.snapshot().localContext, undefined);
    await engine.start('demo');
    assert.notEqual(engine.snapshot().localContext!.sessionId, first.sessionId);
  } finally { engine.stop(); other.stop(); }
});
