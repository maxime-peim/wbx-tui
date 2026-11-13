import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { stat } from 'node:fs/promises';
import { ViewerBroker, ViewerHost, serialCapture } from '../src/viewer.js';
import type { WorkerEvent } from '../src/protocol.js';
import type { GraphicsReply } from '../src/terminal-input.js';
import { emptyChat, type ChatRequest } from '../src/chat-protocol.js';

test('read-only viewers multiplex one worker, preserve sources, are bounded and clean up with owner', async () => {
  let active = 0, maxActive = 0, captures = 0;
  const capture = serialCapture(async request => {
    maxActive = Math.max(maxActive, ++active); captures++;
    await new Promise<void>(resolve => setImmediate(resolve)); active--;
    return { seq: captures, width: request.width, height: request.height, format: 'rgba',
      data: new Uint8Array(request.width * request.height * 4).fill(request.source === 'mock-2' ? 99 : 11), capturedAt: 1, sourceFrame: captures };
  });
  const broker = await ViewerBroker.open(capture);
  const path = broker.path;
  broker.publish({ type: 'sources', sources: [{ id: 'mock-2', label: 'Sam · MOCK', kind: 'mock', available: true }] });
  const a = await ViewerHost.open(path), b = await ViewerHost.open(path);
  try {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const events: WorkerEvent[] = []; a.on('event', event => events.push(event));
    a.send({ type: 'start', mode: 'demo' });
    const [first, second] = await Promise.all([a.capture({ source: 'video', width: 2, height: 2, format: 'rgba' }), b.capture({ source: 'mock-2', width: 2, height: 2, format: 'rgba' })]);
    assert.equal(first!.data[0], 11); assert.equal(second!.data[0], 99); assert.equal(maxActive, 1);
    assert.ok(events.some(event => event.type === 'sources'));
    assert.throws(() => a.send({ type: 'camera', enabled: true, requestId: 1 }), /read-only/);
    assert.throws(() => a.send({ type: 'audio', enabled: true }), /read-only/);
    await broker.close(); await new Promise<void>(resolve => setImmediate(resolve));
    await assert.rejects(stat(path));
    await assert.rejects(a.capture({ source: 'video', width: 2, height: 2, format: 'rgba' }));
  } finally { await a.close(); await b.close(); await broker.close(); }
});

test('broker refuses control commands and oversized input without invoking capture', async () => {
  let calls = 0;
  const broker = await ViewerBroker.open(async () => { calls++; return null; });
  try {
    for (const input of ['{"type":"camera","enabled":true,"requestId":1}\n', '{"type":"oauth-token","requestId":1,"credentials":{"token":"never-install-from-viewer","expiresAt":9999999999999,"scope":""}}\n', '{"type":"chat-control","pane":"%42","request":{"type":"chat","action":"rooms","requestId":"blocked"}}\n', 'x'.repeat(3000)]) {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection(broker.path, () => socket.write(input));
        socket.on('error', reject); socket.on('close', () => resolve());
      });
    }
    assert.equal(calls, 0);
  } finally { await broker.close(); }
});
test('managed views receive bounded auth status, never OAuth refresh requests or access credentials', async () => {
  const broker = await ViewerBroker.open(async () => null), viewer = await ViewerHost.open(broker.path);
  try {
    const events: WorkerEvent[] = []; viewer.on('event', event => events.push(event));
    broker.publish({ type: 'oauth-refresh', requestId: 1 });
    broker.publish({ type: 'auth-state', method: 'oauth', state: 'ready', expiresAt: Date.now() + 10000 });
    for (let i = 0; !events.length && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(events.map(event => event.type), ['auth-state']);
    assert.throws(() => viewer.send({ type: 'oauth-token', requestId: 1, credentials: { token: 'no', expiresAt: Date.now() + 10000, scope: '' } }), /read-only/);
  } finally { await viewer.close(); await broker.close(); }
});
test('busy chat relay is bounded but retains an explicit close while ownership validation is pending', async () => {
  const broker = await ViewerBroker.open(async () => null), viewer = await ViewerHost.open(broker.path);
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const actions: string[] = [];
  broker.onChat = async request => { actions.push(request.action); if (actions.length === 1) await pending; };
  try {
    viewer.chat({ type: 'chat', action: 'rooms', requestId: 'rooms' }, '%42');
    viewer.chat({ type: 'chat', action: 'close', requestId: 'close' }, '%42');
    for (let i = 0; !actions.length && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(actions, ['rooms']); release();
    for (let i = 0; actions.length < 2 && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(actions, ['rooms', 'close']);
  } finally { release(); await viewer.close(); await broker.close(); }
});

test('terminal replies relay across panes during capture, preserve probe fields, and reject control injection', async () => {
  let settle!: () => void;
  const broker = await ViewerBroker.open(async () => { await new Promise<void>(resolve => { settle = resolve; }); return null; });
  const viewer = await ViewerHost.open(broker.path);
  try {
    const received: GraphicsReply[] = [], remote: GraphicsReply[] = [];
    broker.onReply = reply => received.push(reply);
    viewer.on('graphics-reply', reply => remote.push(reply));
    const pending = viewer.capture({ width: 1, height: 1, format: 'rgba', source: 'video' });
    while (!settle) await new Promise<void>(resolve => setImmediate(resolve));
    viewer.forwardReply({ id: 1234, result: 'OK', controls: 'i=1234,U=1' });
    for (let attempt = 0; !remote.length && attempt < 20; attempt++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(received.length, 1); assert.equal(remote.length, 1); assert.equal(remote[0]!.controls, 'i=1234,U=1');
    viewer.forwardReply({ id: 1234, result: '\x1b[2J' });
    broker.forwardReply({ id: 1234, result: 'OK', controls: 'i=3' });
    settle(); assert.equal(await pending, null);
    assert.equal(received.length, 1); assert.equal(remote.length, 1);
  } finally { settle?.(); await viewer.close(); await broker.close(); }
});
test('call viewers relay validated actions and shared geometry, but only when owner explicitly enables controls', async () => {
  const broker = await ViewerBroker.open(async () => null), viewer = await ViewerHost.open(broker.path);
  try {
    const actions: string[] = [], cells: number[] = [];
    broker.onAction = async (action, pane) => { actions.push(`${pane}:${action}`); };
    viewer.on('cell-size', size => cells.push(size.width));
    viewer.action('focus.next', '%42'); viewer.forwardCell({ width: 9, height: 18 });
    for (let i = 0; (actions.length < 1 || cells.length < 1) && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(actions, ['%42:focus.next']); assert.deepEqual(cells, [9]);
    assert.throws(() => viewer.action('exec arbitrary-shell', '%42'));
  } finally { await viewer.close(); await broker.close(); }
});
test('space messaging relays only explicitly enabled controls, replays bounded history, preserves Unicode and refuses invalid payloads', async () => {
  const broker = await ViewerBroker.open(async () => null);
  const snapshot = { ...emptyChat(), state: 'ready' as const, room: { id: 'space-one', title: 'Test' },
    messages: Array.from({ length: 50 }, (_, i) => ({ id: `message-${i}`, author: 'Sam', created: '', text: '世'.repeat(1000) })) };
  broker.publish({ type: 'chat-state', chat: snapshot });
  const viewer = await ViewerHost.open(broker.path);
  try {
    const events: WorkerEvent[] = []; viewer.on('event', event => events.push(event)); viewer.send({ type: 'start', mode: 'demo' });
    const requests: ChatRequest[] = []; broker.onChat = async (request, pane) => { assert.equal(pane, '%42'); requests.push(request); };
    viewer.chat({ type: 'chat', action: 'send', roomId: 'space-one', text: '世'.repeat(1000), requestId: 'send-one' }, '%42');
    for (let i = 0; !requests.length && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1); assert.equal(requests[0]!.action, 'send');
    assert.ok(events.some(event => event.type === 'chat-state' && event.chat.messages.length === 50));
    assert.throws(() => viewer.chat({ type: 'chat', action: 'send', roomId: 'space-one', text: '\x1b[2J', requestId: 'bad' }, '%42'));
    assert.throws(() => viewer.send({ type: 'chat', action: 'rooms', requestId: 'read-only' }), /read-only/);
    broker.publish({ type: 'chat-result', requestId: 'send-one', roomId: 'space-one', status: 'sent' });
    for (let i = 0; !events.some(event => event.type === 'chat-result') && i < 100; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(events.some(event => event.type === 'chat-result'));
  } finally { await viewer.close(); await broker.close(); }
});
