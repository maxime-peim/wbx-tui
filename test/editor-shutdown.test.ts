import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';

const wire = (id: number, method: string, params: object = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

test('valid shutdown rejects later mutations synchronously while meeting leave is deferred, then sends its final response and closes once', async t => {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), calls: string[] = [], output: any[] = [];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  for (const method of ['start', 'stop', 'refreshAuth', 'rooms', 'select', 'markRead', 'history', 'send', 'resolveDelivery'] as const)
    t.mock.method(engine, method, () => { calls.push(`engine.${method}`); });
  for (const method of ['start', 'present', 'action', 'close'] as const)
    t.mock.method(meetings, method, () => { calls.push(`meeting.${method}`); });
  t.mock.method(meetings, 'leave', async (explicit: boolean) => { assert.equal(explicit, true); calls.push('meeting.leave'); await gate; });
  const rpc = new EditorRPC(engine, meetings, value => output.push(value)); let closed = 0;
  rpc.on('closed', () => { closed++; });
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 }));
    const shutdown = rpc.receive(wire(2, 'shutdown', { leaveMeeting: true }));
    assert.deepEqual(calls, ['engine.stop', 'meeting.leave'], 'shutdown barrier is established before the first await');
    const mutations: [string, object][] = [['session.start', { mode: 'demo' }], ['messages.send', { roomId: 'room', requestId: 'draft', text: 'explicit draft' }],
      ['rooms.read', { roomId: 'room', messageId: 'latest' }], ['meeting.start', { mode: 'demo' }], ['meeting.control', { action: 'video.toggle' }],
      ['meeting.present', { display: 'editor' }], ['rooms.list', {}], ['messages.list', {}], ['rooms.select', { roomId: 'room' }],
      ['auth.refresh', {}], ['delivery.resolve', {}], ['session.stop', {}], ['meeting.leave', {}], ['shutdown', {}],
      ['meetings.upcoming', {}], ['meeting.joinUpcoming', { meetingId: 'meeting', revision: 1 }]];
    let id = 2;
    for (const [method, params] of mutations) {
      await rpc.receive(wire(++id, method, params)); assert.equal(output.at(-1).error?.code, -32002, method);
    }
    assert.deepEqual(calls, ['engine.stop', 'meeting.leave']);
    await rpc.receive(wire(++id, 'state.get')); assert.equal(output.at(-1).result.state, 'idle');
    assert.equal(output.some(value => value.id === 2), false); assert.equal(closed, 0);
    release(); await shutdown;
    assert.deepEqual(output.at(-1), { jsonrpc: '2.0', id: 2, result: null }); assert.equal(closed, 1);
    const first = rpc.close(), second = rpc.close(); assert.equal(first, second); await first;
    assert.equal(calls.filter(call => call === 'meeting.close').length, 1); assert.equal(closed, 1);
  } finally { release(); await rpc.close(); }
});

test('failed leave still returns a bounded final error and closes; malformed shutdown does not establish a barrier', async t => {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = []; let starts = 0, closes = 0;
  t.mock.method(engine, 'start', async () => { starts++; });
  t.mock.method(meetings, 'leave', async () => { throw new Error('private-provider-canary'); });
  t.mock.method(meetings, 'close', async () => { closes++; });
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 }));
    await rpc.receive(wire(2, 'shutdown', { leaveMeeting: 'invalid' })); assert.equal(output.at(-1).error?.code, -32602);
    await rpc.receive(wire(3, 'session.start', { mode: 'demo' })); assert.equal(starts, 1);
    await rpc.receive(wire(4, 'shutdown', { leaveMeeting: true }));
    assert.equal(output.at(-1).id, 4); assert.equal(output.at(-1).error?.code, -32603); assert.equal(closes, 1);
    assert.ok(!JSON.stringify(output).includes('private-provider-canary'));
  } finally { await rpc.close(); }
});
