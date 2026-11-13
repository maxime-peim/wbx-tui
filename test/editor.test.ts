import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { EditorEngine } from '../src/editor-engine.js';
import { MessagingStore } from '../src/messaging-store.js';
import type { MessagingAPI } from '../src/messaging-api.js';
import type { ChatMessage } from '../src/chat-protocol.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorLines, MAX_EDITOR_REQUEST, parseEditorRequest } from '../src/editor-protocol.js';

const wire = (id: number, method: string, params: object = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

/** Record all admitted operations without auth, network, tmux or browser work. */
function admissionFixture(t: TestContext) {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), state = engine.snapshot(), meeting = meetings.snapshot();
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, result?: unknown) => (...args: unknown[]) => { calls.push({ method, args }); return result; };
  for (const method of ['start', 'stop', 'refreshAuth', 'rooms', 'select', 'markRead', 'history', 'images', 'send', 'resolveDelivery'] as const) t.mock.method(engine, method, record(`engine.${method}`));
  t.mock.method(engine, 'snapshot', record('engine.snapshot', state));
  for (const method of ['start', 'present'] as const) t.mock.method(meetings, method, record(`meetings.${method}`, meeting));
  for (const method of ['action', 'leave', 'close'] as const) t.mock.method(meetings, method, record(`meetings.${method}`));
  t.mock.method(meetings, 'snapshot', record('meetings.snapshot', meeting));
  const output: any[] = [], rpc = new EditorRPC(engine, meetings, value => output.push(value));
  return { rpc, calls, output };
}

test('dedicated editor backend never imports the standalone UI, terminal input/rendering or Chromium host', async () => {
  const result = await build({ entryPoints: ['src/editor-main.ts'], bundle: true, write: false, packages: 'external', platform: 'node', format: 'esm', metafile: true });
  const sources = Object.keys(result.metafile!.inputs);
  assert.ok(sources.includes('src/editor-engine.ts'));
  for (const path of ['src/cli.ts', 'src/ui.ts', 'src/terminal.ts', 'src/render.ts', 'src/messaging-ui.ts', 'src/messaging-cli.ts', 'src/host.ts', 'src/read-status-worker.ts', 'src/read-status-sdk.ts']) assert.ok(!sources.includes(path), `unexpected editor backend dependency: ${path}`);
});
test('editor framing preserves every fragmented Unicode boundary and bounds both complete and incomplete lines', () => {
  const expected = wire(1, 'messages.send', { text: 'héllo 世界 👩🏽‍💻\nsecond line' });
  const bytes = Buffer.from(expected + '\n\n');
  for (let at = 0; at <= bytes.length; at++) {
    const result: string[] = [], lines = new EditorLines(line => result.push(line));
    lines.push(bytes.subarray(0, at)); lines.push(bytes.subarray(at));
    assert.deepEqual(result, [expected]);
  }
  for (const suffix of ['', '\n']) assert.throws(() => new EditorLines(() => {}).push(Buffer.from('x'.repeat(MAX_EDITOR_REQUEST + 1) + suffix)), /Oversized/);
  for (const value of ['{}', wire(0, 'hello'), wire(1.1, 'hello'), wire(1, 'bad;command'), wire(1, 'hello', []), wire(2 ** 31, 'hello'), '{"jsonrpc":"2.0","id":1,"method":"hello","token":"secret"}']) {
    assert.throws(() => parseEditorRequest(value));
  }
});

test('concurrent and reentrant RPC close calls share one completed resource cleanup', async () => {
  const engine = new EditorEngine(), meetings = new EditorMeetings();
  let release!: () => void, cleanups = 0, closed = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = meetings.close.bind(meetings);
  meetings.close = () => { cleanups++; return gate.then(original); };
  const rpc = new EditorRPC(engine, meetings, () => {});
  rpc.on('closed', () => { closed++; });
  engine.on('state', () => { void rpc.close(); });
  try {
    const first = rpc.close(), second = rpc.close();
    assert.equal(first, second);
    await Promise.resolve(); assert.equal(cleanups, 1);
    release(); await Promise.all([first, second]); assert.equal(closed, 1);
  } finally { release(); await rpc.close(); }
});

test('RPC state microtasks retain the latest emitted payload without resnapshotting', async t => {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [];
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  t.after(() => rpc.close());
  engine.emit('state', { revision: 10 }); await Promise.resolve();
  assert.equal(output.length, 0, 'pre-hello state is not sent');
  await rpc.receive(wire(1, 'hello', { version: 1 })); output.length = 0;
  const snapshot = t.mock.method(engine, 'snapshot');
  const first = { revision: 11 }, latest = { revision: 12 };
  engine.emit('state', first); engine.emit('state', latest);
  engine.emit('delivery', { requestId: 'inert', status: 'unknown' });
  assert.equal(output.length, 1, 'nonreplaceable delivery is still synchronous');
  await Promise.resolve();
  assert.equal(snapshot.mock.callCount(), 0);
  assert.deepEqual(output.map(value => value.method), ['delivery', 'state']);
  assert.equal(output[1].params, latest, 'latest emission wins, not the first or another getter result');
  engine.emit('state', { revision: 13 }); await rpc.close();
  assert.equal(output.length, 2, 'close suppresses an already scheduled notification');
});

test('each real state publication projects once; state.get remains an independent defensive read', async t => {
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [];
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  t.after(() => rpc.close());
  await rpc.receive(wire(1, 'hello', { version: 1 }));
  const snapshot = t.mock.method(engine, 'snapshot'); let emissions = 0;
  engine.on('state', () => { emissions++; });
  await engine.start('demo'); await engine.select('demo-alex'); await Promise.resolve();
  assert.equal(snapshot.mock.callCount(), emissions, 'notification flushes add no projection work');
  assert.ok(output.some(value => value.method === 'state' && value.params.ready));
  await rpc.receive(wire(2, 'state.get'));
  assert.equal(snapshot.mock.callCount(), emissions + 1);
  assert.notEqual(output.at(-1).result, output.filter(value => value.method === 'state').at(-1).params);
});

test('public snapshots cannot mutate rooms, selected destination or message history', async () => {
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-alex');
    const original = engine.snapshot(), expected = structuredClone(original), changed = engine.snapshot();
    changed.rooms[0]!.id = 'foreign-room'; changed.room!.title = 'Foreign title';
    changed.messages[0]!.text = 'Foreign text'; changed.messages.length = 0;
    assert.deepEqual(engine.snapshot(), expected);
    assert.deepEqual(original, expected, 'retained snapshots do not change with another public caller');
  } finally { engine.stop(); }
});

test('owner transitions preserve loading events, nested snapshot isolation and replacement guards', async t => {
  const stores: MessagingStore[] = [], events: ReturnType<EditorEngine['snapshot']>[] = [];
  const message: ChatMessage = { id: 'message', author: 'Synthetic', created: '2026-11-12T12:00:00.000Z', text: 'Original',
    images: [{ id: 'a'.repeat(64), state: 'ready', png: 'inert', lines: ['pixels'] }], attachments: [{ id: 'b'.repeat(64) }] };
  const engine = new EditorEngine(async () => assert.fail('Browser forbidden'), undefined, undefined, undefined, undefined, undefined,
    { messaging(api, pollMs, mode) {
      assert.equal(pollMs, 4000); assert.equal(mode, 'demo');
      t.mock.method(api, 'rooms', async () => ({ items: [{ id: 'room', title: 'Synthetic', type: 'direct' as const, lastActivity: message.created }] }));
      t.mock.method(api, 'history', async () => ({ items: [message] }));
      const store = new MessagingStore(api, 0, mode); stores.push(store); return store;
    } });
  t.after(() => engine.stop());
  engine.on('state', value => events.push(value));
  await engine.start('demo'); const start = events.length;
  await engine.select('room');
  assert.deepEqual(events.slice(start).map(value => [value.loading, value.ready]), [[false, false], [true, false], [false, true]],
    'selection/reset, loading and result remain individually observable owner emissions');
  const emitted = events.at(-1)!, expected = structuredClone(emitted), changed = engine.snapshot();
  changed.messages[0]!.images![0]!.lines![0] = 'Foreign pixels';
  changed.messages[0]!.images!.push({ id: 'foreign', state: 'pending' });
  changed.messages[0]!.attachments![0]!.id = 'foreign';
  changed.messages[0]!.attachments!.length = 0;
  changed.rooms[0]!.title = 'Foreign room'; changed.room!.id = 'foreign';
  assert.deepEqual(engine.snapshot(), expected);
  assert.deepEqual(emitted, expected);
  message.images![0]!.lines![0] = 'Next pixels'; stores[0]!.onChange();
  assert.deepEqual(emitted, expected, 'owner changes do not alter retained emissions');
  assert.equal(engine.snapshot().messages[0]!.images![0]!.lines![0], 'Next pixels');
  engine.stop(); await engine.start('demo');
  const replacement = engine.snapshot(), count = events.length;
  stores[0]!.onChange();
  assert.equal(events.length, count, 'a replaced store cannot publish or reconcile');
  assert.deepEqual(engine.snapshot(), replacement);
});

test('editor RPC requires a versioned handshake, rejects credentials and validates shutdown without closing on error', async () => {
  const output: any[] = [], rpc = new EditorRPC(new EditorEngine(), new EditorMeetings(), value => output.push(value));
  try {
    await rpc.receive(wire(1, 'state.get')); assert.equal(output.at(-1).error.code, -32001);
    await rpc.receive(wire(2, 'hello', { version: 99 })); assert.equal(output.at(-1).error.code, -32001);
    await rpc.receive(wire(3, 'hello', { version: 1 })); assert.equal(output.at(-1).result.version, 1);
    await rpc.receive(wire(4, 'session.start', { mode: 'demo', token: 'private-canary' })); assert.equal(output.at(-1).error.code, -32602);
    assert.ok(!JSON.stringify(output).includes('private-canary'));
    await rpc.receive(wire(5, 'shutdown', { leaveMeeting: 'yes' })); assert.equal(output.at(-1).error.code, -32602);
    await rpc.receive(wire(6, 'state.get')); assert.equal(output.at(-1).result.state, 'idle');
    await rpc.receive(wire(7, 'not.a.method')); assert.equal(output.at(-1).error.code, -32601);
  } finally { await rpc.close(); }
});
test('editor RPC negotiates notification excerpts and forwards only explicit boolean consent', async t => {
  const { rpc, calls, output } = admissionFixture(t);
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 }));
    assert.ok(output.at(-1).result.capabilities.includes('notification-previews'));
    assert.ok(output.at(-1).result.capabilities.includes('sender-names-v1'));
    assert.ok(output.at(-1).result.capabilities.includes('local-sections-v1'));
    assert.ok(output.at(-1).result.capabilities.includes('uploads-v1'));
    await rpc.receive(wire(2, 'session.start', { mode: 'demo', readStatus: true, notificationPreview: true }));
    assert.deepEqual(calls.filter(call => call.method === 'engine.start').at(-1)!.args, ['demo', undefined, true, false, false, false, true]);
    await rpc.receive(wire(3, 'session.start', { mode: 'demo', readStatus: true }));
    assert.deepEqual(calls.filter(call => call.method === 'engine.start').at(-1)!.args, ['demo', undefined, true]);
  } finally { await rpc.close(); }
});

test('typed RPC admission rejects malformed parameters before any engine/controller call and replays errors safely', async t => {
  const { rpc, calls, output } = admissionFixture(t);
  const cases: { method: string; params: unknown; code: number; label?: string }[] = [];
  const enums: { method: string; params: Record<string, unknown>; key: string; values: string[]; required?: boolean }[] = [
    { method: 'session.start', params: { mode: 'demo' }, key: 'mode', values: ['demo', 'live'], required: true },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'mode', values: ['demo', 'live'], required: true },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'display', values: ['auto', 'kitty', 'editor'] },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'fallback', values: ['editor', 'error'] },
    { method: 'meeting.present', params: { display: 'editor' }, key: 'display', values: ['kitty', 'editor'], required: true },
    { method: 'meeting.present', params: { display: 'editor' }, key: 'fallback', values: ['editor', 'error'] },
    { method: 'meeting.control', params: { action: 'microphone.toggle' }, key: 'action', values: ['microphone.toggle', 'video.toggle', 'screen.toggle', 'audio.toggle', 'camera.toggle', 'auth.refresh', 'quit'], required: true },
  ];
  for (const field of enums) {
    for (const value of [[], ...field.values.map(value => [value]), {}, { toString: field.values[0] }, null, true, 1, 'unsupported', ...(field.required ? [undefined] : [])]) {
      cases.push({ method: field.method, params: { ...field.params, [field.key]: value }, code: -32602, label: `${field.method}/${field.key}=${JSON.stringify(value)}` });
    }
  }
  const flags: { method: string; params: Record<string, unknown>; key: string }[] = [
    { method: 'session.start', params: { mode: 'demo' }, key: 'readStatus' },
    { method: 'session.start', params: { mode: 'demo' }, key: 'notificationPreview' },
    { method: 'rooms.list', params: {}, key: 'more' },
    { method: 'rooms.select', params: { roomId: 'room-1' }, key: 'reload' },
    { method: 'messages.list', params: {}, key: 'older' },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'headless' },
    { method: 'shutdown', params: {}, key: 'leaveMeeting' },
  ];
  for (const field of flags) {
    for (const value of [null, [], [false], {}, 0, 1, 'false', 'true']) {
      cases.push({ method: field.method, params: { ...field.params, [field.key]: value }, code: -32602, label: `${field.method}/${field.key}=${JSON.stringify(value)}` });
    }
  }
  const strings: { method: string; params: Record<string, unknown>; key: string; required?: boolean }[] = [
    { method: 'session.start', params: { mode: 'demo' }, key: 'config' },
    { method: 'rooms.select', params: { roomId: 'room-1' }, key: 'roomId', required: true },
    { method: 'messages.images', params: { roomId: 'room-1', messageId: 'message-1' }, key: 'roomId', required: true },
    { method: 'messages.images', params: { roomId: 'room-1', messageId: 'message-1' }, key: 'messageId', required: true },
    { method: 'rooms.read', params: { roomId: 'room-1', messageId: 'message-1' }, key: 'roomId', required: true },
    { method: 'rooms.read', params: { roomId: 'room-1', messageId: 'message-1' }, key: 'messageId', required: true },
    { method: 'messages.send', params: { roomId: 'room-1', requestId: 'send-1', text: 'hello' }, key: 'roomId', required: true },
    { method: 'messages.send', params: { roomId: 'room-1', requestId: 'send-1', text: 'hello' }, key: 'requestId', required: true },
    { method: 'messages.send', params: { roomId: 'room-1', requestId: 'send-1', text: 'hello' }, key: 'text', required: true },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'meeting' },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'config' },
    { method: 'meeting.start', params: { mode: 'demo' }, key: 'callId' },
  ];
  for (const field of strings) {
    for (const value of [null, [], ['value'], {}, 1, false, ...(field.required ? [undefined] : [])]) {
      cases.push({ method: field.method, params: { ...field.params, [field.key]: value }, code: -32602, label: `${field.method}/${field.key}=${JSON.stringify(value)}` });
    }
  }
  for (const version of [undefined, null, [], [1], {}, { toString: '1' }, true, '1', 2]) cases.push({ method: 'hello', params: { version }, code: -32001 });
  for (const [method, params] of [
    ['hello', { version: 1 }], ['session.start', { mode: 'demo' }], ['session.stop', {}], ['state.get', {}], ['auth.refresh', {}],
    ['rooms.list', {}], ['rooms.select', { roomId: 'room-1' }], ['messages.list', {}], ['messages.send', { roomId: 'room-1', requestId: 'send-1', text: 'hello' }],
    ['messages.images', { roomId: 'room-1', messageId: 'message-1' }],
    ['delivery.resolve', {}], ['meeting.start', { mode: 'demo' }], ['meeting.present', { display: 'editor' }], ['meeting.control', { action: 'quit' }], ['meeting.leave', {}], ['shutdown', {}],
  ] as const) cases.push({ method, params: { ...params, token: 'secret-canary' }, code: -32602 });
  for (const params of [null, [], ['demo']]) cases.push({ method: 'session.start', params, code: -32600 });
  cases.push({ method: 'meeting.present', params: { display: 'auto' }, code: -32602 }, { method: 'not.a.method', params: {}, code: -32601 });
  let id = 0;
  try {
    await rpc.receive(wire(++id, 'session.start', { mode: ['demo'] }));
    assert.equal(output.at(-1).error.code, -32001, 'handshake rejection still precedes parameter parsing');
    assert.deepEqual(calls, []);
    await rpc.receive(wire(++id, 'hello', { version: 1 })); calls.length = 0;
    for (const entry of cases) {
      const request = JSON.stringify({ jsonrpc: '2.0', id: ++id, method: entry.method, params: entry.params });
      const label = entry.label ?? request;
      await rpc.receive(request);
      assert.deepEqual(calls, [], label);
      const response = output.at(-1);
      assert.equal(response.error?.code, entry.code, label);
      assert.equal(response.id, entry.code === -32600 ? null : id, label);
      if (entry === cases[0]) {
        await rpc.receive(request); assert.deepEqual(output.at(-1), response, 'identical invalid request replays its error');
        await rpc.receive(wire(id, 'state.get')); assert.equal(output.at(-1).error.code, -32600, 'invalid parameter requests still reserve their IDs');
        assert.deepEqual(calls, []);
      }
    }
    assert.ok(!JSON.stringify(output).includes('secret-canary'));
    await rpc.receive(wire(++id, 'state.get'));
    assert.equal(output.at(-1).result.state, 'idle', 'invalid shutdowns/hellos leave the established RPC session open');
    assert.deepEqual(calls, [{ method: 'engine.snapshot', args: [] }]);
  } finally { await rpc.close(); }
});

test('typed RPC dispatch preserves optional parameters, defaults and valid controller actions', async t => {
  const { rpc, calls, output } = admissionFixture(t);
  const cases: { method: string; params?: object; calls: { method: string; args: unknown[] }[] }[] = [
    { method: 'session.start', params: { mode: 'demo' }, calls: [{ method: 'engine.start', args: ['demo', undefined, false] }, { method: 'engine.snapshot', args: [] }] },
    { method: 'session.start', params: { mode: 'live', config: '/synthetic/not-read.json' }, calls: [{ method: 'engine.start', args: ['live', '/synthetic/not-read.json', false] }, { method: 'engine.snapshot', args: [] }] },
    { method: 'session.start', params: { mode: 'live', readStatus: true }, calls: [{ method: 'engine.start', args: ['live', undefined, true] }, { method: 'engine.snapshot', args: [] }] },
    { method: 'session.stop', calls: [{ method: 'engine.stop', args: [] }] },
    { method: 'state.get', calls: [{ method: 'engine.snapshot', args: [] }] },
    { method: 'auth.refresh', calls: [{ method: 'engine.refreshAuth', args: [] }] },
    { method: 'rooms.select', params: { roomId: 'room-1' }, calls: [{ method: 'engine.select', args: ['room-1'] }] },
    { method: 'rooms.select', params: { roomId: 'room-1', reload: true }, calls: [{ method: 'engine.select', args: ['room-1', true] }] },
    { method: 'messages.images', params: { roomId: 'room-1', messageId: 'message-1' }, calls: [{ method: 'engine.images', args: ['room-1', 'message-1'] }] },
    { method: 'rooms.read', params: { roomId: 'room-1', messageId: 'message-1' }, calls: [{ method: 'engine.markRead', args: ['room-1', 'message-1'] }] },
    { method: 'messages.send', params: { roomId: 'room-1', requestId: 'send-1', text: '世界 👩🏽‍💻\nsecond line' }, calls: [{ method: 'engine.send', args: ['send-1', 'room-1', '世界 👩🏽‍💻\nsecond line'] }] },
    { method: 'delivery.resolve', calls: [{ method: 'engine.resolveDelivery', args: [] }] },
    { method: 'meeting.leave', calls: [{ method: 'meetings.leave', args: [] }] },
    { method: 'meeting.present', params: { display: 'editor' }, calls: [{ method: 'meetings.present', args: ['editor', 'editor'] }] },
    { method: 'meeting.present', params: { display: 'kitty', fallback: 'error' }, calls: [{ method: 'meetings.present', args: ['kitty', 'error'] }] },
  ];
  for (const value of [undefined, false, true]) {
    cases.push({ method: 'rooms.list', params: value === undefined ? undefined : { more: value }, calls: [{ method: 'engine.rooms', args: [value === true] }] });
    cases.push({ method: 'messages.list', params: value === undefined ? undefined : { older: value }, calls: [{ method: 'engine.history', args: [value === true] }] });
  }
  const meetingDefaults = { mode: 'demo', meeting: undefined, config: undefined, display: 'auto', fallback: 'editor', headless: false, callId: undefined };
  for (const params of [{ mode: 'demo' }, { mode: 'demo', headless: true }, { mode: 'live', meeting: 'https://example.webex.com/meet/test', config: '/synthetic/not-read.json', display: 'kitty', fallback: 'error', headless: false, callId: 'call-1' }]) {
    cases.push({ method: 'meeting.start', params, calls: [{ method: 'meetings.start', args: [{ ...meetingDefaults, ...params }] }] });
  }
  for (const action of ['microphone.toggle', 'video.toggle', 'screen.toggle', 'audio.toggle', 'camera.toggle', 'auth.refresh', 'quit']) {
    cases.push({ method: 'meeting.control', params: { action }, calls: [{ method: action === 'quit' ? 'meetings.leave' : 'meetings.action', args: action === 'quit' ? [] : [action] }] });
  }
  let id = 0;
  try {
    await rpc.receive(wire(++id, 'hello', { version: 1 }));
    for (const entry of cases) {
      calls.length = 0;
      await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: ++id, method: entry.method, params: entry.params }));
      assert.equal(output.at(-1).error, undefined, entry.method);
      assert.deepEqual(calls, entry.calls, `${entry.method}: ${JSON.stringify(entry.params)}`);
    }
  } finally { await rpc.close(); }
});

test('typed shutdown admission preserves default detach and explicit leave before closing', async t => {
  for (const leaveMeeting of [undefined, false, true]) {
    const { rpc, calls, output } = admissionFixture(t);
    try {
      await rpc.receive(wire(1, 'hello', { version: 1 })); calls.length = 0;
      await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: leaveMeeting === undefined ? undefined : { leaveMeeting } }));
      assert.equal(output.at(-1).result, null);
      assert.deepEqual(calls, [
        { method: 'engine.stop', args: [] },
        ...(leaveMeeting === true ? [{ method: 'meetings.leave', args: [true] }] : []),
        { method: 'engine.stop', args: [] }, { method: 'meetings.close', args: [] },
      ], `leaveMeeting=${leaveMeeting}`);
    } finally { await rpc.close(); }
  }
});

test('demo editor engine selects explicitly, preserves Unicode plaintext, rejects stale destinations and replays ACK without another send', async () => {
  const output: any[] = [], engine = new EditorEngine(), rpc = new EditorRPC(engine, new EditorMeetings(), value => output.push(value));
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 }));
    await rpc.receive(wire(2, 'session.start', { mode: 'demo' }));
    assert.equal(engine.snapshot().rooms.length, 3); assert.equal(engine.snapshot().room, null);
    await rpc.receive(wire(3, 'rooms.select', { roomId: 'demo-general' })); assert.equal(engine.snapshot().ready, true);
    const request = wire(4, 'messages.send', { roomId: 'demo-general', requestId: 'send-1', text: '世界 👩🏽‍💻\nsecond line' });
    await rpc.receive(request); await rpc.receive(request);
    assert.equal(engine.snapshot().messages.filter(m => m.text === '世界 👩🏽‍💻\nsecond line').length, 1);
    assert.equal(output.filter(v => v.method === 'delivery').length, 1);
    assert.equal(output.find(v => v.method === 'delivery').params.status, 'sent');
    const deliveredId = output.find(v => v.method === 'delivery').params.messageId;
    assert.equal(deliveredId, engine.snapshot().messages.find(m => m.text === '世界 👩🏽‍💻\nsecond line')?.id, 'delivery projects only the exact ACK identity for local notification exclusion');
    await rpc.receive(wire(4, 'session.stop')); assert.equal(output.at(-1).error.code, -32600);
    await rpc.receive(wire(5, 'rooms.select', { roomId: 'demo-engineering' }));
    await rpc.receive(wire(6, 'messages.send', { roomId: 'demo-general', requestId: 'stale-1', text: 'must not send' }));
    assert.equal(output.filter(v => v.method === 'delivery').at(-1).params.status, 'failed');
    assert.equal(output.filter(v => v.method === 'delivery').at(-1).params.messageId, undefined, 'a failed post cannot establish a local sent identity');
    for (let id = 7; id < 74; id++) await rpc.receive(wire(id, 'state.get'));
    await rpc.receive(request); assert.equal(output.at(-1).error.code, -32600, 'evicted requests never execute again');
    await rpc.receive(wire(74, 'session.stop')); assert.equal(engine.snapshot().state, 'idle');
    await rpc.receive(wire(75, 'session.start', { mode: 'demo' })); assert.equal(engine.snapshot().room, null);
    let closed = false; rpc.once('closed', () => { closed = true; });
    await rpc.receive(wire(76, 'shutdown')); assert.equal(closed, true); assert.equal(engine.snapshot().state, 'idle');
  } finally { await rpc.close(); }
});

test('private config failures never expose content or open a browser', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-config-'), config = join(directory, 'config.json');
  let opened = false;
  const engine = new EditorEngine(async () => { opened = true; });
  try {
    await writeFile(config, '{"private-canary": "secret"}', { mode: 0o600 });
    await assert.rejects(engine.start('live', config), error => !String(error).includes('private-canary') && !String(error).includes('secret'));
    assert.equal(opened, false); assert.equal(engine.snapshot().state, 'failed');
    await engine.start('demo', config); assert.equal(engine.snapshot().state, 'ready');
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('disconnect during POST suppresses late ACKs but returns explicit unknown delivery rather than leaving editor admission stuck', async () => {
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const store = (engine as unknown as { store: MessagingStore }).store;
    const api = (store as unknown as { api: MessagingAPI }).api;
    let reject!: (error: Error) => void;
    api.send = () => new Promise((_, failed) => { reject = failed; });
    const send = engine.send('disconnect-1', 'demo-general', 'explicit pending text');
    engine.stop(); reject(new Error('Synthetic canceled HTTP; no network used.'));
    await assert.rejects(send, error => (error as { code?: number }).code === -32004);
    assert.deepEqual(deliveries, []); assert.equal(engine.snapshot().state, 'idle');
    await engine.start('demo'); await engine.select('demo-general');
    await engine.send('after-disconnect', 'demo-general', 'new explicit send');
    assert.equal(deliveries.length, 1);
  } finally { engine.stop(); }
});

test('editor disconnect cancels pending OAuth, releases the loopback port and suppresses late state without any Webex HTTP', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-cancel-'), config = join(directory, 'config.json');
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic-client', clientSecret: 'synthetic-secret-canary', redirectUri: `http://127.0.0.1:${port}/oauth/callback`, scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] } }), { mode: 0o600 });
  let opened!: () => void; const opening = new Promise<void>(resolve => { opened = resolve; });
  const engine = new EditorEngine(async () => { opened(); /* No browser launch or HTTP request. */ });
  const output: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => output.push(value));
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 }));
    const login = rpc.receive(wire(2, 'session.start', { mode: 'live', config }));
    await opening; assert.equal(engine.snapshot().state, 'connecting');
    await rpc.receive(wire(3, 'session.stop')); await login;
    assert.equal(engine.snapshot().state, 'idle'); assert.ok(!JSON.stringify(output).includes('synthetic-secret-canary'));
    server.listen(port, '127.0.0.1'); await once(server, 'listening');
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rpc.receive(wire(4, 'session.start', { mode: 'demo' })); assert.equal(engine.snapshot().state, 'ready');
  } finally { await rpc.close(); server.close(); await rm(directory, { recursive: true, force: true }); }
});

test('stdio editor worker emits only JSON, supports fragmented requests and exits after shutdown', { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/editor-main.ts'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, WBX_CONFIG: '/tmp/opencode/wbx-test-unused-config' } });
  const output: any[] = []; let partial = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { stderr += text; });
  child.stdout.on('data', text => { partial += text; while (partial.includes('\n')) { const end = partial.indexOf('\n'); output.push(JSON.parse(partial.slice(0, end))); partial = partial.slice(end + 1); } });
  try {
    const exit = once(child, 'exit');
    const hello = wire(1, 'hello', { version: 1 }) + '\n';
    child.stdin.write(hello.slice(0, 13)); child.stdin.write(hello.slice(13));
    child.stdin.write(wire(2, 'shutdown') + '\n');
    const [code] = await exit; assert.equal(code, 0); assert.equal(stderr, ''); assert.equal(partial, '');
    assert.ok(output.some(v => v.id === 1 && v.result.version === 1)); assert.ok(output.some(v => v.id === 2 && v.result === null));
  } finally { child.kill('SIGTERM'); }
});
