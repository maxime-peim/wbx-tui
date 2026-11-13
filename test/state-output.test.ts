import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedOutput } from '../src/bounded-output.js';
import { editorStateLane, readStatusOutput, READ_STATUS_OUTPUT_LIMITS } from '../src/state-output.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';

test('ordered admission bounds records/bytes, drains one at a time and closes exactly once on overflow', async () => {
  const sent: string[] = [], callbacks: ((error?: Error | null) => void)[] = []; let failures = 0;
  const queue = new BoundedOutput<string>((value, complete) => { sent.push(value); callbacks.push(complete); }, () => { failures++; }, 10, 4);
  queue.offer('first', 5); queue.offer('old', 3, 'state'); queue.offer('new', 3, 'state');
  assert.deepEqual(queue.diagnostics(), { active: 1, pending: 1, bytes: 8, closed: false });
  assert.deepEqual(sent, ['first']); callbacks.shift()!(); assert.deepEqual(sent, ['first', 'new']);
  const flushed = queue.flush(); callbacks.shift()!(); await flushed;
  for (let i = 0; i < 5; i++) queue.offer('x', 1);
  assert.equal(failures, 1); assert.equal(queue.diagnostics().closed, true);
  callbacks.shift()?.(); queue.offer('late', 4); assert.equal(failures, 1); assert.equal(sent.length, 3);
});

test('IPC completion coalesces only equivalent snapshot authority; outcomes and message evidence remain ordered and detached', async () => {
  const sent: any[] = [], callbacks: (() => void)[] = []; let failures = 0;
  const write = readStatusOutput((value, complete) => { sent.push(value); callbacks.push(complete); }, () => { failures++; });
  const room = { id: 'r', type: 'group', title: 'Initial', lastActivity: '2026-11-12T12:00:00.000Z', lastSeen: '2026-11-12T11:00:00.000Z' };
  const snapshot = (title: string) => ({ type: 'snapshot', rooms: [{ ...room, title }] });
  write(snapshot('First'));
  for (let i = 0; i < 1000; i++) write(snapshot(String(i)));
  assert.equal(sent.length, 1); assert.equal(write.diagnostics().pending, 1);
  write({ type: 'health', status: 'refresh-unavailable' }); write({ type: 'snapshot', rooms: [] });
  write({ type: 'read', id: 1, ok: false });
  const evidence = { type: 'messages', messages: [{ id: 'native-client', roomId: 'r', self: true }] };
  write(evidence); evidence.messages[0]!.id = 'foreign-mutation';
  write({ type: 'failed', reason: 'receipt' });
  while (callbacks.length) callbacks.shift()!();
  await write.flush(); assert.equal(failures, 0);
  assert.deepEqual(sent.map(value => value.type), ['snapshot', 'snapshot', 'health', 'snapshot', 'read', 'messages', 'failed']);
  assert.equal(sent[1].rooms[0].title, '999'); assert.equal(sent[5].messages[0].id, 'native-client');
  write.close(); write(snapshot('Late')); assert.equal(sent.length, 7);
});

test('IPC queue overflow or send callback error is fatal, bounded and never retried', () => {
  for (const overflow of ['records', 'bytes', 'callback'] as const) {
    let sends = 0, failures = 0, finish!: (error?: Error | null) => void;
    const write = readStatusOutput((_value, complete) => { sends++; finish = complete; }, () => { failures++; });
    write({ type: 'ready' });
    if (overflow === 'records') for (let i = 0; i < READ_STATUS_OUTPUT_LIMITS.records; i++) write({ type: 'read', id: i, ok: false });
    if (overflow === 'bytes') write({ type: 'messages', messages: ['x'.repeat(READ_STATUS_OUTPUT_LIMITS.bytes)] });
    if (overflow === 'callback') finish(new Error('Synthetic IPC failure'));
    assert.equal(failures, 1); assert.equal(sends, 1); assert.equal(write.diagnostics().bytes, 0);
    finish(); write({ type: 'ready' }); assert.equal(sends, 1); assert.equal(failures, 1);
  }
});

test('state lanes preserve equal-length authority/status/evidence changes, not just identity and counts', () => {
  const state = { revision: 1, loading: false, rooms: [{ id: 'r', title: 'A', unread: false, unreadStale: false }],
    room: null, messages: [{ id: 'm', created: '2026-11-12T12:00:00.000Z', text: 'A' }],
    messageEvents: { received: 1, items: [{ id: 'a', self: true }] } };
  const key = editorStateLane(state);
  assert.equal(editorStateLane({ ...state, revision: 2, messages: [{ ...state.messages[0], text: 'B' }] }), key);
  for (const patch of [{ loading: true }, { rooms: [{ ...state.rooms[0], unread: true }] },
    { rooms: [{ ...state.rooms[0], unreadStale: true }] }, { room: { id: 'selected' } },
    { messages: [{ ...state.messages[0], created: '2026-11-12T12:01:00.000Z' }] },
    { messageEvents: { received: 1, items: [{ id: 'b', self: true }] } }]) assert.notEqual(editorStateLane({ ...state, ...patch }), key);
});

test('RPC same-turn bursts preserve every message-evidence and status barrier before its retained ring can evict evidence', async () => {
  const engine = new EditorEngine(), packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  try {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } })); packets.length = 0;
    const base = engine.snapshot();
    engine.emit('state', { ...base, revision: 1, loading: true });
    engine.emit('state', { ...base, revision: 2, loading: false });
    for (let i = 0; i < 200; i++) engine.emit('state', { ...base, revision: i + 3,
      messageEvents: { state: 'live', received: i + 1, items: [{ id: `event-${i}`, roomId: 'r', self: i % 2 === 0, created: '2026-11-12T12:00:00.000Z' }] } });
    await Promise.resolve();
    assert.deepEqual(packets.slice(0, 2).map(value => value.params.loading), [true, false]);
    assert.deepEqual(packets.flatMap(value => value.params.messageEvents.items.map((item: any) => item.id)), Array.from({ length: 200 }, (_, i) => `event-${i}`));
  } finally { await rpc.close(); }
});
