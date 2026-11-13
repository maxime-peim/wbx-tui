import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { defaults } from '../src/config.js';
import { encodeFrame, MAX_FRAME_BYTES, type Capture, type WorkerEvent } from '../src/protocol.js';
import { ViewerPackets } from '../src/viewer-framing.js';
import { ViewerHost } from '../src/viewer.js';

function packet(body: Uint8Array): Buffer {
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
const metadata = (value: object) => packet(Buffer.from(JSON.stringify(value)));
const frame = (seq: number) => encodeFrame({ seq, width: 2, height: 2, format: 'rgba', capturedAt: 1,
  sourceFrame: seq, data: Uint8Array.from({ length: 16 }, (_, i) => i + seq) });

test('viewer packets preserve every split boundary, coalesced packets and empty replies', () => {
  const bodies = [Buffer.from('{"type":"notice","message":"世界 👩🏽‍💻"}'), Buffer.alloc(0), Buffer.from(frame(1)), Buffer.from('{"type":"redraw"}')];
  const wire = Buffer.concat(bodies.map(packet));
  for (let split = 0; split <= wire.length; split++) {
    const received: Buffer[] = [], packets = new ViewerPackets(body => { received.push(body); });
    packets.push(wire.subarray(0, split)); packets.push(Buffer.alloc(0)); packets.push(wire.subarray(split));
    assert.deepEqual(received, bodies, `split at byte ${split}`);
    packets.close();
  }
});

test('viewer packet assembly copies each byte once with one exact body allocation, independent of fragmentation', () => {
  for (const size of [0, 1, 262_161, MAX_FRAME_BYTES]) {
    const body = Buffer.alloc(size, 0x57), wire = packet(body);
    for (const chunkSize of size === MAX_FRAME_BYTES ? [65_536] : [1, 31, 65_536]) {
      const allocations: number[] = [], received: Buffer[] = [];
      const packets = new ViewerPackets(body => { received.push(body); }, size => {
        allocations.push(size); return Buffer.allocUnsafe(size);
      });
      let copiedBytes = 0;
      for (let offset = 0; offset < wire.length; offset += chunkSize) {
        const chunk = wire.subarray(offset, offset + chunkSize);
        chunk.copy = (target, targetStart = 0, sourceStart = 0, sourceEnd = chunk.length) => {
          const copied = Buffer.prototype.copy.call(chunk, target, targetStart, sourceStart, sourceEnd);
          copiedBytes += copied; return copied;
        };
        packets.push(chunk);
      }
      assert.deepEqual(allocations, [4, size], `body size ${size}, chunk size ${chunkSize}`);
      assert.equal(copiedBytes, wire.length, 'header and body bytes are each copied exactly once');
      assert.deepEqual(received, [body]);
      packets.push(packet(Buffer.from([1])));
      assert.deepEqual(received[0], body, 'a later packet cannot overwrite an emitted body');
      packets.close();
    }
  }
});

test('viewer packet lengths are checked before allocation and failure permanently closes the assembler', () => {
  for (const size of [MAX_FRAME_BYTES + 1, 0xffffffff]) {
    const allocations: number[] = [], received: Buffer[] = [];
    const packets = new ViewerPackets(body => { received.push(body); }, size => {
      allocations.push(size); return Buffer.allocUnsafe(size);
    });
    const header = Buffer.alloc(4); header.writeUInt32BE(size);
    packets.push(header.subarray(0, 3));
    assert.deepEqual(allocations, [4]);
    assert.throws(() => packets.push(header.subarray(3)), /Oversized viewer packet/);
    packets.push(packet(Buffer.from('ignored'))); packets.close();
    assert.deepEqual(allocations, [4]); assert.deepEqual(received, []);
  }
});

test('closing a partial viewer packet discards it and stops coalesced delivery on close or receiver failure', () => {
  const wire = packet(Buffer.from(frame(1)));
  for (const split of [1, 3, 4, 5, wire.length - 1]) {
    const received: Buffer[] = [], packets = new ViewerPackets(body => { received.push(body); });
    packets.push(wire.subarray(0, split)); packets.close(); packets.push(wire.subarray(split)); packets.close();
    assert.deepEqual(received, []);
  }
  const received: Buffer[] = [];
  const closing = new ViewerPackets(body => { received.push(body); closing.close(); });
  closing.push(Buffer.concat([wire, wire])); assert.equal(received.length, 1);
  let calls = 0;
  const failing = new ViewerPackets(() => { calls++; throw new Error('Synthetic receiver failure.'); });
  assert.throws(() => failing.push(Buffer.concat([wire, wire])), /Synthetic receiver failure/);
  failing.push(wire); assert.equal(calls, 1);
});

async function rawViewer() {
  const directory = await mkdtemp('/tmp/opencode/wbx-viewer-framing-'), path = join(directory, 'frames.sock');
  let connected!: (socket: Socket) => void;
  const peer = new Promise<Socket>(resolve => { connected = resolve; });
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); connected(socket);
  });
  let viewer: ViewerHost | undefined;
  const close = async () => {
    await viewer?.close();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    viewer = await ViewerHost.open(path);
    return { viewer, socket: await peer, close };
  } catch (error) { await close(); throw error; }
}
const captureRequest = { source: 'video', width: 2, height: 2, format: 'rgba' } as const;
async function requested(socket: Socket, capture: () => Promise<unknown>): Promise<Capture> {
  const data = once(socket, 'data');
  void capture();
  const [chunk] = await data;
  return JSON.parse(chunk.toString()) as Capture;
}

test('viewer socket preserves mixed metadata, fragmented frames, empty replies and capture admission', { timeout: 5000 }, async () => {
  const { viewer, socket, close } = await rawViewer();
  const order: string[] = [];
  viewer.on('notice', value => order.push(`notice:${value}`));
  viewer.on('event', (value: WorkerEvent) => order.push(value.type));
  viewer.on('graphics-reply', () => order.push('graphics-reply'));
  viewer.on('cell-size', () => order.push('cell-size'));
  viewer.on('config', () => order.push('config'));
  viewer.on('redraw', () => order.push('redraw'));
  try {
    let pending!: ReturnType<ViewerHost['capture']>;
    const first = await requested(socket, () => pending = viewer.capture(captureRequest));
    await assert.rejects(viewer.capture(captureRequest), /unavailable/);
    const wire = Buffer.concat([
      metadata({ type: 'notice', message: '世界 👩🏽‍💻' }), metadata({ type: 'status', state: 'connected' }),
      metadata({ type: 'graphics-reply', id: 42, result: 'OK' }), metadata({ type: 'cell-size', width: 8, height: 16 }),
      metadata({ type: 'config', config: defaults() }), packet(frame(first.seq)), metadata({ type: 'redraw' }),
    ]);
    for (const part of [wire.subarray(0, 1), wire.subarray(1, 3), wire.subarray(3, 17), wire.subarray(17, wire.length - 5), wire.subarray(wire.length - 5)]) {
      await new Promise<void>((resolve, reject) => socket.write(part, error => error ? reject(error) : resolve()));
    }
    const pixels = await pending;
    assert.deepEqual(pixels?.data, Buffer.from(frame(first.seq).subarray(32)));
    // The redraw may be delivered in a later socket callback than the frame.
    if (!order.includes('redraw')) await once(viewer, 'redraw');
    assert.deepEqual(order, ['notice:世界 👩🏽‍💻', 'status', 'graphics-reply', 'cell-size', 'config', 'redraw']);
    await requested(socket, () => pending = viewer.capture(captureRequest));
    socket.write(packet(Buffer.alloc(0))); assert.equal(await pending, null);
    const third = await requested(socket, () => pending = viewer.capture(captureRequest));
    socket.write(packet(frame(third.seq))); assert.equal((await pending)?.seq, third.seq);
    assert.deepEqual(pixels?.data, Buffer.from(frame(first.seq).subarray(32)), 'old frame data survives later captures');
  } finally { await close(); }
});

test('viewer socket rejects oversized packets, invalid frame bodies and wrong capture sequences', { timeout: 5000 }, async () => {
  const oversized = (size: number) => { const header = Buffer.alloc(4); header.writeUInt32BE(size); return header; };
  for (const wire of [oversized(MAX_FRAME_BYTES + 1), oversized(0xffffffff), packet(Buffer.from([0x57])), packet(frame(2))]) {
    const { viewer, socket, close } = await rawViewer();
    try {
      let rejected!: Promise<void>;
      await requested(socket, () => rejected = assert.rejects(viewer.capture(captureRequest), /disconnected/));
      const disconnected = once(viewer, 'disconnect');
      socket.write(wire.subarray(0, 3)); socket.write(wire.subarray(3));
      await rejected; await disconnected;
      assert.equal(viewer.disconnected, true, 'invalid pixels revoke transport, not media ownership');
      await assert.rejects(viewer.capture(captureRequest), /unavailable/);
    } finally { await close(); }
  }
});

test('viewer socket close mid-header or mid-frame rejects capture without delivering partial pixels', { timeout: 5000 }, async () => {
  const wire = packet(frame(1));
  for (const split of [1, 3, 4, 5, wire.length - 1]) {
    const { viewer, socket, close } = await rawViewer();
    try {
      let rejected!: Promise<void>;
      await requested(socket, () => rejected = assert.rejects(viewer.capture(captureRequest), /disconnected/));
      const disconnected = once(viewer, 'disconnect');
      socket.end(wire.subarray(0, split));
      await rejected; await disconnected;
      assert.equal(viewer.disconnected, true);
      await assert.rejects(viewer.capture(captureRequest), /unavailable/);
    } finally { await close(); }
  }
});

test('viewer cancellation and explicit close clean up partial captures and refuse later requests', { timeout: 5000 }, async () => {
  for (const cancel of [true, false]) {
    const { viewer, socket, close } = await rawViewer();
    const abort = new AbortController(), events: WorkerEvent[] = [];
    viewer.on('event', event => events.push(event));
    try {
      let rejected!: Promise<void>;
      await requested(socket, () => rejected = assert.rejects(viewer.capture(captureRequest, abort.signal), cancel ? /canceled/ : /disconnected/));
      const received = once(viewer, 'notice');
      socket.write(Buffer.concat([metadata({ type: 'notice', message: 'partial capture follows' }), packet(frame(1)).subarray(0, 9)]));
      await received;
      const closed = once(socket, 'close');
      const disconnected = cancel ? once(viewer, 'disconnect') : undefined;
      if (cancel) abort.abort(); else await viewer.close();
      await rejected; await closed; await disconnected;
      await assert.rejects(viewer.capture(captureRequest), /unavailable/);
      assert.deepEqual(events, [], 'partial/canceled captures never fabricate ended media');
    } finally { await close(); }
  }
});
