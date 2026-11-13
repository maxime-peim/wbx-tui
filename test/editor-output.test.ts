import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorOutput, serializeEditorOutput } from '../src/editor-output.js';
import { MAX_EDITOR_EVENT } from '../src/editor-protocol.js';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

class SlowSink extends EventEmitter {
  writableLength = 0;
  lines: string[] = [];
  callbacks: ((error?: Error | null) => void)[] = [];
  blocked = false;
  write(line: string, callback: (error?: Error | null) => void) {
    this.lines.push(line); this.writableLength += Buffer.byteLength(line); this.callbacks.push(callback);
    return !this.blocked;
  }
  complete() { this.writableLength = 0; this.callbacks.shift()?.(); }
}
const state = (revision: number, patch: object = {}) => ({ jsonrpc: '2.0', method: 'state', params: {
  revision, state: 'ready', mode: 'live', auth: 'oauth', ready: true, loading: false, sending: false,
  rooms: [{ id: 'r', title: `Title ${revision}`, type: 'group', unread: true, unreadStale: false, unreadActivity: '2026-11-12T12:00:00.000Z' }],
  room: null, messages: [{ id: 'endpoint', created: '2026-11-12T12:00:00.000Z', text: `Text ${revision}` }],
  messageEvents: { state: 'live', received: 0, items: [] }, ...patch,
} });

const shapes = (state: object) => [
  { value: { jsonrpc: '2.0', method: 'state', params: state }, state: (value: any) => value.params },
  { value: { jsonrpc: '2.0', id: 2, result: state }, state: (value: any) => value.result },
  { value: { jsonrpc: '2.0', id: 1, result: { version: 1, state, meeting: { active: false, ready: false } } }, state: (value: any) => value.result.state },
];
const immediateSink = (writableLength: number, write: (line: string) => unknown) => Object.assign(new EventEmitter(), {
  writableLength, write(line: string, complete: (error?: Error | null) => void) { const result = write(line); complete(); return result; },
});
const messages = Array.from({ length: 50 }, (_, id) => ({ id: String(id), text: '世界 👩🏽‍💻 "\\\n\t'.repeat(20) }));

test('editor output preserves ordinary responses and all three snapshot envelope shapes', () => {
  for (const { value } of shapes({ revision: 4, rooms: [{ id: 'room', title: 'World 世界' }], messages: messages.slice(0, 2) })) {
    assert.deepEqual(JSON.parse(serializeEditorOutput(value)!), value);
    assert.equal(Buffer.byteLength(serializeEditorOutput(value)!), Buffer.byteLength(JSON.stringify(value)));
  }
  const response = { jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'Bounded error' } };
  assert.deepEqual(JSON.parse(serializeEditorOutput(response)!), response);
});

test('oversized notifications, state responses and nested hellos retain the newest ordered suffix without mutating source objects', () => {
  const state = Object.freeze({ revision: 5, rooms: Object.freeze([{ id: 'room', title: 'World' }]), messages: Object.freeze(messages), ready: true });
  for (const shape of shapes(state)) {
    const before = JSON.stringify(shape.value), line = serializeEditorOutput(shape.value, 4096)!;
    assert.ok(Buffer.byteLength(line) <= 4096);
    const received = shape.state(JSON.parse(line));
    assert.equal(received.revision, 5); assert.equal(received.ready, true); assert.equal(received.truncated, true);
    assert.ok(received.messages.length > 0 && received.messages.length < messages.length);
    assert.deepEqual(received.messages, messages.slice(-received.messages.length));
    assert.deepEqual(received.rooms, state.rooms);
    assert.equal(JSON.stringify(shape.value), before, 'live snapshots and cached RPC responses stay unchanged');
    assert.equal(serializeEditorOutput(shape.value, 4096), line, 'replay serialization is deterministic');
  }
});

test('snapshot byte accounting is exact for Unicode and JSON escapes at the output limit', () => {
  for (const { value } of shapes({ messages: messages.slice(0, 2) })) {
    const exact = Buffer.byteLength(JSON.stringify(value));
    assert.equal(Buffer.byteLength(serializeEditorOutput(value, exact)!), exact);
    const shorter = serializeEditorOutput(value, exact - 1)!;
    assert.ok(Buffer.byteLength(shorter) < exact);
    assert.ok(JSON.parse(shorter));
  }
  assert.equal(serializeEditorOutput({ result: { rooms: ['x'.repeat(500)], messages: [] } }, 128), undefined);
  assert.equal(serializeEditorOutput({ notice: 'x'.repeat(500) }, 128), undefined);
});
test('trimming message text also drops its optional cached reaction projection without changing authority', () => {
  const input = { messages, ready: false, historyLatest: false, historyCached: true,
    cachedReactions: [{ messageId: '0', roomId: 'room', groups: [] }] };
  for (const shape of shapes(input)) {
    const result = shape.state(JSON.parse(serializeEditorOutput(shape.value, 4096)!));
    assert.equal(result.truncated, true); assert.equal(result.cachedReactions, undefined);
    assert.equal(result.ready, false); assert.equal(result.historyLatest, false); assert.equal(result.historyCached, true);
    assert.equal(input.cachedReactions.length, 1);
  }
});

test('output visits at most the selected messages plus one rejected candidate, not the discarded history', () => {
  let encodings = 0;
  const source = Array.from({ length: 500 }, (_, id) => ({ toJSON() { encodings++; return { id, text: '世界'.repeat(2000) }; } }));
  const line = serializeEditorOutput({ params: { messages: source } }, 65536)!;
  const result = JSON.parse(line).params;
  assert.equal(result.truncated, true);
  assert.ok(result.messages.length > 0);
  assert.ok(encodings <= result.messages.length + 2, 'each candidate is encoded once; older discarded messages are untouched');
  assert.ok(encodings < source.length / 10);
});

test('a full-size production-budget history stays bounded, including a nested hello', () => {
  const state = { messages: Array.from({ length: 500 }, (_, id) => ({ id, text: '界'.repeat(10000) })) };
  const line = serializeEditorOutput({ jsonrpc: '2.0', id: 1, result: { version: 1, state } })!;
  assert.ok(Buffer.byteLength(line) <= MAX_EDITOR_EVENT);
  const received = JSON.parse(line).result.state;
  assert.equal(received.truncated, true);
  assert.ok(received.messages.length > 250 && received.messages.length < 500);
  assert.equal(received.messages.at(-1).id, 499);
});

test('backpressured output fails once before serialization and suppresses subsequent writes', () => {
  let encodings = 0, failures = 0, writes = 0;
  const write = editorOutput(immediateSink(257, () => { writes++; }), () => { failures++; }, 128);
  write({ toJSON() { encodings++; return {}; } }); write({ result: null });
  assert.equal(encodings, 0); assert.equal(writes, 0); assert.equal(failures, 1);
});

test('output keeps reply order, appends one newline and closes on an unrepresentable envelope or failed sink', () => {
  const lines: string[] = []; let failures = 0;
  const write = editorOutput(immediateSink(0, line => { lines.push(line); }), () => { failures++; }, 256);
  write({ jsonrpc: '2.0', id: 1, result: null }); write({ jsonrpc: '2.0', method: 'delivery', params: { status: 'sent' } });
  assert.deepEqual(lines.map(line => JSON.parse(line).id ?? 'event'), [1, 'event']);
  assert.ok(lines.every(line => line.endsWith('\n') && !line.slice(0, -1).includes('\n')));
  write({ metadata: 'x'.repeat(300) }); write({ id: 2, result: null });
  assert.equal(failures, 1); assert.equal(lines.length, 2);
  const broken = editorOutput(immediateSink(0, () => { throw new Error('Synthetic sink failure'); }), () => { failures++; });
  broken({ result: null }); broken({ result: null }); assert.equal(failures, 2);
});

test('a slow editor admits one active write and one latest presentation snapshot', () => {
  const sink = new SlowSink(); let failures = 0;
  const write = editorOutput(sink, () => { failures++; }, 4096);
  write(state(1));
  for (let revision = 2; revision <= 1000; revision++) write(state(revision));
  assert.equal(failures, 0); assert.equal(sink.lines.length, 1, 'no repeated writes into a slow stream');
  sink.complete();
  assert.equal(sink.lines.length, 2); assert.equal(JSON.parse(sink.lines[1]!).params.revision, 1000);
  sink.complete(); assert.equal(sink.lines.length, 2);
});

test('loading, authority, evidence and mandatory outcomes are barriers, not latest-wins data', () => {
  const sink = new SlowSink(), write = editorOutput(sink, () => assert.fail('Unexpected overflow'), 65536);
  write(state(1)); write(state(2)); write(state(3));
  write(state(4, { loading: true })); write(state(5, { loading: false }));
  write({ jsonrpc: '2.0', id: 7, error: { code: -32003, message: 'Receipt failed; nothing retried.' } });
  write({ jsonrpc: '2.0', method: 'delivery', params: { requestId: 'once', status: 'unknown' } });
  write(state(6, { rooms: [{ id: 'r', unread: true, unreadStale: true }] }));
  write(state(7, { messageEvents: { state: 'live', received: 1, items: [{ id: 'other-client', self: true }] } }));
  write(state(8, { messageEvents: { state: 'live', received: 2, items: [{ id: 'other-person', self: false }] } }));
  for (let i = 0; i < 20; i++) sink.complete();
  const packets = sink.lines.map(line => JSON.parse(line));
  assert.deepEqual(packets.filter(value => value.method === 'state').map(value => value.params.revision), [1, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(packets.map(value => value.id ?? value.method), ['state', 'state', 'state', 'state', 7, 'delivery', 'state', 'state', 'state']);
});

test('write completion does not bypass stream drain, and a late callback cannot reopen failed output', () => {
  const sink = new SlowSink(); sink.blocked = true;
  let failures = 0;
  const write = editorOutput(sink, () => { failures++; }, 4096);
  write(state(1)); write(state(2)); sink.complete();
  assert.equal(sink.lines.length, 1, 'false write return retains backpressure even after callback');
  sink.blocked = false; sink.emit('drain');
  assert.equal(sink.lines.length, 2);
  sink.callbacks.shift()!(new Error('Synthetic pipe error'));
  write(state(3)); sink.emit('drain');
  assert.equal(failures, 1); assert.equal(sink.lines.length, 2);
});

test('bounded mandatory overflow closes once; flush/close never resurrect queued snapshots', async () => {
  const sink = new SlowSink(); let failures = 0;
  const write = editorOutput(sink, () => { failures++; }, 65536);
  write(state(1));
  for (let i = 0; i < 128; i++) write({ jsonrpc: '2.0', id: i + 1, result: null });
  assert.equal(failures, 1); assert.equal(write.diagnostics().closed, true);
  await write.flush(); sink.complete(); sink.emit('drain');
  assert.equal(sink.lines.length, 1); assert.equal(sink.listenerCount('drain'), 0);
  const next = new SlowSink(), output = editorOutput(next, () => assert.fail('Unexpected failure'));
  output(state(1)); output({ jsonrpc: '2.0', id: 99, result: { messages: [], ready: false } });
  let drained = false; const pending = output.flush().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false);
  next.complete(); assert.equal(JSON.parse(next.lines[1]!).id, 99);
  await Promise.resolve(); assert.equal(drained, false, 'shutdown/response flushing waits for transport completion');
  next.complete(); await pending; assert.equal(drained, true);
  output(state(2)); output(state(3)); output.close(); next.complete();
  assert.equal(next.lines.length, 3, 'close discards only untransmitted data after explicit teardown');
});

test('real Node Writable callback/drain ordering admits the next state and final response exactly once', async () => {
  const lines: string[] = [], callbacks: (() => void)[] = [];
  const sink = new Writable({ highWaterMark: 1, write(chunk, _encoding, complete) { lines.push(String(chunk)); callbacks.push(complete); } });
  const write = editorOutput(sink, () => assert.fail('Unexpected stream failure'));
  try {
    write(state(1)); write(state(2)); write(state(3)); write({ jsonrpc: '2.0', id: 99, result: null });
    assert.equal(lines.length, 1);
    for (let i = 0; i < 3; i++) { callbacks.shift()!(); await new Promise<void>(resolve => setImmediate(resolve)); }
    await write.flush();
    assert.deepEqual(lines.map(line => { const value = JSON.parse(line); return value.id ?? value.params.revision; }), [1, 3, 99]);
    assert.equal(sink.listenerCount('drain'), 0);
  } finally { write.close(); sink.destroy(); }
});
