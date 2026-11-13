import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { editorOutput } from '../src/editor-output.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';

const choice = { action: 'download' as const, selectors: [] };
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(bytes = Buffer.from('hello 世界')) {
  let gets = 0;
  const api = new WebexMessagingAPI(() => 'SYNTHETIC-ONLY', async target => {
    const path = new URL(String(target)).pathname;
    if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room', title: 'Local', type: 'group' }] }));
    if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'message', roomId: 'room',
      files: ['https://webexapis.com/v1/contents/TRANSFER'] }] }));
    gets++; return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/octet-stream' } });
  });
  const store = new MessagingStore(api, 0), engine = new EditorEngine();
  await store.loadRooms(); await store.select('room');
  Object.assign(engine, { store, state: 'ready', mode: 'demo' });
  const id = store.messages[0]!.attachments![0]!.id;
  return { engine, store, id, gets: () => gets,
    async resolve(request = 2) {
      const value = await (engine.resolveAttachment as any)(request, 'room', 'message', id, choice, 'chunks-v1');
      assert.equal(value.body.payload.mode, 'chunks', 'new feature, not a missing-method exception');
      return value;
    } };
}
test('chunk opt-in and controls have strict admission separate from attachment policy', () => {
  const parse = (method: string, params: object) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params: params as any });
  const params = { roomId: 'room', messageId: 'message', attachmentId: 'a'.repeat(64), ...choice, transfer: 'chunks-v1' };
  assert.equal(parse('messages.attachmentResolve', params).method, 'messages.attachmentResolve');
  for (const transfer of [true, 'inline', 'chunks-v2', null]) assert.throws(() => parse('messages.attachmentResolve', { ...params, transfer }));
  const pull = { requestId: 2, transferId: 'b'.repeat(32), seq: 0, offset: 0 };
  assert.equal(parse('messages.attachmentChunk', pull).method, 'messages.attachmentChunk');
  for (const invalid of [{ ...pull, offset: -1 }, { ...pull, seq: 0.5 }, { ...pull, requestId: '2' },
    { ...pull, transferId: 'B'.repeat(32) }, { ...pull, data: 'AAAA' }]) assert.throws(() => parse('messages.attachmentChunk', invalid));
});
test('one selected representation is pulled once, hashed, completed and never refetched', async () => {
  const bytes = Buffer.alloc(100_001, 255), f = await fixture(bytes);
  try {
    const value = await f.resolve(), p = value.body.payload;
    assert.equal(p.mode, 'chunks'); assert.equal(p.chunkBytes, 49152); assert.equal(p.chunks, 3);
    assert.equal(p.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal('data' in p, false); assert.equal(f.gets(), 1);
    (f.engine as any).attachmentSent(2, p.transferId, -1);
    const parts: Buffer[] = [];
    for (let seq = 0; seq < p.chunks; seq++) {
      const chunk = (f.engine as any).attachmentChunk({ requestId: 2, transferId: p.transferId, seq, offset: seq * 49152 });
      parts.push(Buffer.from(chunk.data, 'base64'));
      (f.engine as any).attachmentSent(2, p.transferId, seq);
    }
    assert.deepEqual(Buffer.concat(parts), bytes);
    const result = (f.engine as any).completeAttachment({ requestId: 2, transferId: p.transferId, chunks: p.chunks,
      decodedBytes: bytes.length, encodedBytes: p.encodedBytes, sha256: p.sha256 });
    assert.equal(result.complete, true);
    assert.throws(() => (f.engine as any).attachmentChunk({ requestId: 2, transferId: p.transferId, seq: 0, offset: 0 }));
    assert.equal(f.gets(), 1);
  } finally { f.engine.stop(); }
});
test('descriptor lifetime blocks competing legacy and typed explicit reads before GET', async () => {
  const f = await fixture();
  try {
    await f.resolve();
    await assert.rejects(f.engine.openAttachment('room', 'message', f.id));
    await assert.rejects(f.engine.openImage('room', 'message', f.id));
    await assert.rejects(f.engine.resolveAttachment(3, 'room', 'message', f.id, choice));
    assert.equal(f.gets(), 1);
    f.engine.cancelAttachment(2);
    assert.equal((await f.engine.resolveAttachment(4, 'room', 'message', f.id, choice)).body.kind, 'original');
    assert.equal(f.gets(), 2);
  } finally { f.engine.stop(); }
});
for (const cause of ['cancel', 'reload', 'remove', 'stop'] as const) test(`post-descriptor ${cause} revokes bytes without a new GET`, async () => {
  const f = await fixture();
  try {
    const p = (await f.resolve()).body.payload;
    if (cause === 'cancel') f.engine.cancelAttachment(2);
    if (cause === 'reload') await f.store.select('room', true);
    if (cause === 'remove') f.store.messages = [];
    if (cause === 'stop') f.engine.stop();
    assert.throws(() => (f.engine as any).attachmentChunk({ requestId: 2, transferId: p.transferId, seq: 0, offset: 0 }));
    assert.equal(f.gets(), 1);
  } finally { f.engine.stop(); }
});
test('per-record transport acknowledgement waits for callback AND drain, independently of following output', async () => {
  const sink = Object.assign(new EventEmitter(), { writableLength: 0, lines: [] as string[], callbacks: [] as (() => void)[],
    write(line: string, done: () => void) { this.lines.push(line); this.callbacks.push(done); return false; } });
  const output = editorOutput(sink, () => assert.fail('Unexpected failure'));
  let sent = 0;
  (output as any).record({ jsonrpc: '2.0', id: 2, result: null }, { maxBytes: 8192, completed: () => sent++ });
  output({ jsonrpc: '2.0', id: 3, result: null });
  sink.callbacks.shift()!(); assert.equal(sent, 0);
  sink.emit('drain'); assert.equal(sent, 1); assert.equal(sink.lines.length, 2);
  output.close(); assert.equal(sent, 1);
});
test('RPC success replay retains neither descriptor nor chunks and cannot advance a transfer', async () => {
  const f = await fixture(), packets: any[] = [], rpc = new EditorRPC(f.engine, new EditorMeetings(), value => { packets.push(value); });
  const call = async (id: number, method: string, params: object) => { await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return packets.at(-1); };
  try {
    await call(1, 'hello', { version: 1 });
    const resolve = { roomId: 'room', messageId: 'message', attachmentId: f.id, ...choice, transfer: 'chunks-v1' };
    const p = (await call(2, 'messages.attachmentResolve', resolve)).result.body.payload;
    assert.equal(p.mode, 'chunks');
    assert.ok((await call(2, 'messages.attachmentResolve', resolve)).error);
    const pull = { requestId: 2, transferId: p.transferId, seq: 0, offset: 0 };
    assert.equal(typeof (await call(3, 'messages.attachmentChunk', pull)).result.data, 'string');
    assert.ok((await call(3, 'messages.attachmentChunk', pull)).error);
    assert.equal(f.gets(), 1);
  } finally { await rpc.close(); }
  await turn();
});
for (const size of [0, 1, 2, 3, 49151, 49152, 49153, 5_999_999, 6_000_000]) test(`transfer exact totals/canonical encoding at ${size} bytes`, async () => {
  const f = await fixture(Buffer.alloc(size, 255));
  try {
    const value = await f.resolve(), p = value.body.payload;
    assert.equal(p.chunks, Math.ceil(size / 49152)); assert.equal(p.encodedBytes, 4 * Math.ceil(size / 3));
    f.engine.attachmentSent(2, p.transferId, -1);
    let total = 0, encoded = 0;
    for (let seq = 0; seq < p.chunks; seq++) {
      const part = f.engine.attachmentChunk({ requestId: 2, transferId: p.transferId, seq, offset: seq * 49152 });
      const decoded = Buffer.from(part.data, 'base64');
      assert.equal(decoded.length, part.decodedBytes); assert.equal(decoded.toString('base64'), part.data);
      assert.ok(Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 2147483647, result: part })) <= 69632);
      total += decoded.length; encoded += part.data.length;
      f.engine.attachmentSent(2, p.transferId, seq);
    }
    assert.equal(total, size); assert.equal(encoded, p.encodedBytes);
    assert.equal(f.engine.completeAttachment({ requestId: 2, transferId: p.transferId, chunks: p.chunks,
      decodedBytes: total, encodedBytes: encoded, sha256: p.sha256 }).complete, true);
  } finally { f.engine.stop(); }
});
for (const invalid of ['pending-descriptor', 'gap', 'offset', 'repeat', 'concurrent', 'early-complete', 'digest', 'foreign'] as const) test(`transfer rejects ${invalid} without leaking credit or bytes`, async () => {
  const f = await fixture(Buffer.alloc(49153, 255));
  try {
    const p = (await f.resolve()).body.payload, pull = { requestId: 2, transferId: p.transferId, seq: 0, offset: 0 };
    if (invalid !== 'pending-descriptor') f.engine.attachmentSent(2, p.transferId, -1);
    if (invalid === 'gap') pull.seq = 1;
    if (invalid === 'offset') pull.offset = 1;
    if (invalid === 'foreign') {
      assert.throws(() => f.engine.attachmentChunk({ ...pull, transferId: 'f'.repeat(32) }));
      assert.equal(f.engine.attachmentChunk(pull).seq, 0, 'foreign request cannot clear rightful owner');
      return;
    }
    if (['repeat', 'concurrent', 'digest'].includes(invalid)) {
      f.engine.attachmentChunk(pull);
      if (invalid !== 'concurrent') f.engine.attachmentSent(2, p.transferId, 0);
    }
    if (invalid === 'digest') {
      f.engine.attachmentChunk({ ...pull, seq: 1, offset: 49152 }); f.engine.attachmentSent(2, p.transferId, 1);
    }
    if (invalid === 'early-complete' || invalid === 'digest') {
      assert.throws(() => f.engine.completeAttachment({ requestId: 2, transferId: p.transferId,
        chunks: p.chunks, decodedBytes: 49153, encodedBytes: p.encodedBytes, sha256: '0'.repeat(64) }));
    } else assert.throws(() => f.engine.attachmentChunk(pull));
    assert.throws(() => f.engine.attachmentChunk({ requestId: 2, transferId: p.transferId, seq: 0, offset: 0 }), 'matching invalid access terminates transfer');
    assert.equal(f.gets(), 1);
  } finally { f.engine.stop(); }
});
test('idle expiry and fixed lifetime are not extended by new credits', async t => {
  const f = await fixture(Buffer.alloc(6_000_000, 255));
  try {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let p = (await f.resolve()).body.payload;
    t.mock.timers.tick(5000);
    assert.throws(() => f.engine.attachmentChunk({ requestId: 2, transferId: p.transferId, seq: 0, offset: 0 }));
    p = (await f.resolve(3)).body.payload;
    f.engine.attachmentSent(3, p.transferId, -1);
    for (let seq = 0; seq < 7; seq++) {
      t.mock.timers.tick(4000);
      f.engine.attachmentChunk({ requestId: 3, transferId: p.transferId, seq, offset: seq * 49152 });
      f.engine.attachmentSent(3, p.transferId, seq);
    }
    t.mock.timers.tick(2000);
    assert.throws(() => f.engine.attachmentChunk({ requestId: 3, transferId: p.transferId, seq: 7, offset: 7 * 49152 }));
  } finally { f.engine.stop(); }
});
test('queued descriptor/chunk cannot be advanced before output callback/drain', async () => {
  const f = await fixture(), sink = Object.assign(new EventEmitter(), { writableLength: 0,
    lines: [] as string[], callbacks: [] as (() => void)[],
    write(line: string, done: () => void) { this.lines.push(line); this.callbacks.push(done); return false; } });
  const output = editorOutput(sink, () => assert.fail('Unexpected pressure failure')), rpc = new EditorRPC(f.engine, new EditorMeetings(), output);
  const call = (id: number, method: string, params: object) => rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  try {
    await call(1, 'hello', { version: 1 }); sink.callbacks.shift()!(); sink.emit('drain');
    await call(2, 'messages.attachmentResolve', { roomId: 'room', messageId: 'message', attachmentId: f.id, ...choice, transfer: 'chunks-v1' });
    const p = JSON.parse(sink.lines.at(-1)!).result.body.payload;
    sink.callbacks.shift()!();
    await call(3, 'messages.attachmentChunk', { requestId: 2, transferId: p.transferId, seq: 0, offset: 0 });
    sink.emit('drain');
    assert.ok(JSON.parse(sink.lines.at(-1)!).error, 'no bytes bypass descriptor drain');
    assert.equal(f.gets(), 1);
  } finally { output.close(); await rpc.close(); }
});
test('expired descriptor/chunk replay and malformed matching controls never refetch', async () => {
  const f = await fixture(Buffer.alloc(49153, 255)), packets: any[] = [];
  const rpc = new EditorRPC(f.engine, new EditorMeetings(), value => { packets.push(value); });
  const call = async (id: number, method: string, params: object) => {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return packets.at(-1);
  };
  try {
    await call(1, 'hello', { version: 1 });
    const params = { roomId: 'room', messageId: 'message', attachmentId: f.id, ...choice, transfer: 'chunks-v1' };
    const p = (await call(2, 'messages.attachmentResolve', params)).result.body.payload;
    const pull = { requestId: 2, transferId: p.transferId, seq: 0, offset: 0 };
    await call(3, 'messages.attachmentChunk', pull);
    for (let id = 4; id <= 70; id++) await call(id, 'state.get', {});
    assert.ok((await call(2, 'messages.attachmentResolve', params)).error);
    assert.ok((await call(3, 'messages.attachmentChunk', pull)).error);
    assert.equal((await call(71, 'messages.attachmentChunk', { ...pull, seq: 1, offset: 49152 })).result.seq, 1);
    assert.ok((await call(72, 'messages.attachmentComplete', { requestId: 2, transferId: p.transferId,
      chunks: p.chunks, decodedBytes: 49153, encodedBytes: p.encodedBytes, sha256: p.sha256, extra: true })).error);
    assert.ok((await call(73, 'messages.attachmentComplete', { requestId: 2, transferId: p.transferId,
      chunks: p.chunks, decodedBytes: 49153, encodedBytes: p.encodedBytes, sha256: p.sha256 })).error);
    assert.equal(f.gets(), 1);
    assert.ok(!JSON.stringify(f.engine.snapshot()).includes(p.transferId), 'no transfer enters projection/cache');
  } finally { await rpc.close(); }
});
test('post-descriptor grant loss revokes the same owner without refreshing or replaying content', async () => {
  const f = await fixture();
  try {
    Object.assign(f.engine, { mode: 'live', grantedScope: 'spark:messages_read', oauth: {
      async refresh() { return { token: 'SYNTHETIC-NEW', scope: 'spark:rooms_read', expiresAt: Date.now() + 3600_000 }; },
      watch() {}, close() {},
    } });
    const p = (await f.resolve()).body.payload;
    await f.engine.refreshAuth();
    assert.throws(() => f.engine.attachmentChunk({ requestId: 2, transferId: p.transferId, seq: 0, offset: 0 }));
    assert.equal(f.gets(), 1);
    await assert.rejects(f.resolve(3)); assert.equal(f.gets(), 1);
  } finally { f.engine.stop(); }
});
