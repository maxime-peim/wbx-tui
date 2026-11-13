import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { StringDecoder } from 'node:string_decoder';
import { EditorLines, MAX_EDITOR_REQUEST, parseEditorRequest } from '../src/editor-protocol.js';

/** Count actual primitive scan/join inputs, not a framer-maintained diagnostic. */
function measured(t: TestContext, feed: () => void) {
  let active = false, scanned = 0, joined = 0, decoded = 0;
  const includes = String.prototype.includes, stringIndex = String.prototype.indexOf;
  const index = Buffer.prototype.indexOf, byteLength = Buffer.byteLength, join = Array.prototype.join, write = StringDecoder.prototype.write;
  const span = (length: number, from: number, found: number) => Math.max(0, (found < 0 ? length : found + 1) - from);
  t.mock.method(String.prototype, 'includes', function(this: string, value: string, from = 0) {
    if (active && value === '\n') scanned += span(this.length, from, stringIndex.call(this, value, from));
    return includes.call(this, value, from);
  });
  t.mock.method(String.prototype, 'indexOf', function(this: string, value: string, from = 0) {
    const found = stringIndex.call(this, value, from);
    if (active && value === '\n') scanned += span(this.length, from, found);
    return found;
  });
  t.mock.method(Buffer.prototype, 'indexOf', function(this: Buffer, value: any, from: any = 0, encoding?: any) {
    const found = index.call(this, value, from, encoding);
    if (active && (value === 10 || value === '\n')) scanned += span(this.length, typeof from === 'number' ? from : 0, found);
    return found;
  });
  t.mock.method(Buffer, 'byteLength', function(value: any, encoding?: any) {
    if (active && typeof value === 'string') scanned += value.length;
    return byteLength(value, encoding);
  });
  // Node's MockTracker deliberately rejects array targets. Replace this one
  // descriptor only for the synchronous measurement and restore it in finally.
  const joinDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'join')!;
  Object.defineProperty(Array.prototype, 'join', { ...joinDescriptor, value(this: any[], separator?: string) {
    const value = join.call(this, separator);
    if (active) joined += value.length;
    return value;
  } });
  t.mock.method(StringDecoder.prototype, 'write', function(this: StringDecoder, value: Buffer) {
    if (active) decoded += value.length;
    return write.call(this, value);
  });
  active = true;
  try { feed(); } finally { active = false; Object.defineProperty(Array.prototype, 'join', joinDescriptor); }
  return { scanned, joined, decoded };
}
test('one-byte base64 fragmentation has linear executed scan and materialization work', t => {
  const value = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'state.get', params: { data: 'a'.repeat(30_000) } });
  const bytes = Buffer.from(value + '\n'), received: string[] = [], lines = new EditorLines(line => received.push(line));
  const work = measured(t, () => { for (const byte of bytes) lines.push(Buffer.from([byte])); });
  assert.deepEqual(received, [value]);
  assert.ok(work.scanned <= bytes.length * 4, `primitive scan work must be linear: ${JSON.stringify(work)}`);
  assert.ok(work.joined <= bytes.length * 3, `joined bytes must be linear: ${JSON.stringify(work)}`);
  assert.equal(work.decoded, bytes.length - 1, 'decode each admitted non-delimiter byte once');
  t.diagnostic(JSON.stringify({ bytes: bytes.length, ...work }));
});
test('multi-record callbacks scan only their remaining input, not repeatedly copy a shrinking callback suffix', t => {
  const values = Array.from({ length: 2500 }, (_, i) => `{"id":${i},"data":"世界"}`);
  const bytes = Buffer.from(values.join('\n') + '\n'), received: string[] = [];
  const lines = new EditorLines(line => received.push(line));
  const work = measured(t, () => lines.push(bytes));
  assert.deepEqual(received, values);
  assert.ok(work.scanned <= bytes.length * 4); assert.ok(work.joined <= bytes.length * 3);
});
test('every UTF-8 byte boundary, empty callback and delimiter split preserves exact Unicode JSON', () => {
  const values = ['{"text":"世界 👩🏽‍💻"}', '{"text":"é é 💬"}', '{"text":"\\n—not a delimiter"}'];
  const bytes = Buffer.from('\n \r\n' + values.join('\n\n') + '\n');
  for (let split = 0; split <= bytes.length; split++) {
    const received: string[] = [], lines = new EditorLines(line => received.push(line));
    lines.push(bytes.subarray(0, split)); lines.push(Buffer.alloc(0)); lines.push(bytes.subarray(split));
    assert.deepEqual(received, values);
  }
  const received: string[] = [], lines = new EditorLines(line => received.push(line));
  for (const byte of bytes) lines.push(Buffer.from([byte]));
  assert.deepEqual(received, values);
});
test('exact byte ceiling excludes newline and remains independent of UTF-8 code units and callback aggregate size', () => {
  const prefix = '{"jsonrpc":"2.0","id":1,"method":"state.get","params":{"data":"', suffix = '"}}';
  const padding = MAX_EDITOR_REQUEST - Buffer.byteLength(prefix + suffix);
  const unicode = '界'.repeat(Math.floor(padding / 3)) + 'x'.repeat(padding % 3);
  const record = prefix + unicode + suffix, bytes = Buffer.from(record + '\n');
  assert.equal(Buffer.byteLength(record), MAX_EDITOR_REQUEST);
  const received: string[] = [], lines = new EditorLines(line => received.push(line));
  for (let i = 0; i < bytes.length; i += 7) lines.push(bytes.subarray(i, i + 7));
  assert.deepEqual(received, [record]); assert.equal(parseEditorRequest(received[0]!).id, 1);
  const many: string[] = []; new EditorLines(line => many.push(line)).push(Buffer.concat(Array(4).fill(bytes)));
  assert.equal(many.length, 4);
  for (const suffix of ['', '\n']) assert.throws(() => new EditorLines(() => {}).push(Buffer.from(record + 'x' + suffix)), /Oversized/);
});
test('oversized input is rejected before feeding an unbounded segment to UTF-8 decoding', t => {
  const work = measured(t, () => {
    assert.throws(() => new EditorLines(() => assert.fail('No record')).push(Buffer.alloc(MAX_EDITOR_REQUEST * 3, 97)), /Oversized/);
  });
  assert.equal(work.decoded, 0);
});
test('StringDecoder malformed-byte replacement and its re-encoded byte ceiling are preserved', () => {
  for (const invalid of [Buffer.from([255]), Buffer.from([0xe2, 0x82]), Buffer.from([0xc0, 0xaf])]) {
    const received: string[] = [], lines = new EditorLines(line => received.push(line));
    const input = Buffer.concat([Buffer.from('{"data":"'), invalid, Buffer.from('"}\n')]);
    for (const byte of input) lines.push(Buffer.from([byte]));
    assert.deepEqual(received, [input.subarray(0, -1).toString('utf8')]);
  }
  // Raw bytes are below the ceiling, but replacement characters re-encode larger.
  assert.throws(() => new EditorLines(() => {}).push(Buffer.alloc(Math.floor(MAX_EDITOR_REQUEST / 3) + 1, 255)), /Oversized/);
});
test('framing failure is terminal: no later record or follow-up push can cross that boundary', () => {
  const received: string[] = [], lines = new EditorLines(line => received.push(line));
  assert.throws(() => lines.push(Buffer.from('{}\n' + 'x'.repeat(MAX_EDITOR_REQUEST + 1) + '\n{"later":true}\n')), /Oversized/);
  assert.deepEqual(received, ['{}']);
  assert.throws(() => lines.push(Buffer.from('{"later":true}\n')));
  assert.deepEqual(received, ['{}']);
});
test('a callback throw releases framing data and does not admit a later record', () => {
  let calls = 0;
  const lines = new EditorLines(() => { calls++; throw new Error('Synthetic consumer failure'); });
  assert.throws(() => lines.push(Buffer.from('{}\n{}\n')), /Synthetic/);
  assert.throws(() => lines.push(Buffer.from('{}\n')));
  assert.equal(calls, 1);
});
