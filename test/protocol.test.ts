import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, decodeFrame, parseCommand, parseEvent, validMeeting, type Frame } from '../src/protocol.js';

const rgba: Frame = { seq: 1, width: 2, height: 1, format: 'rgba', capturedAt: 123, sourceFrame: 42,
  data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]) };
test('binary frames round-trip, including nonzero byte offsets', () => {
  const packet = encodeFrame(rgba);
  const padded = Buffer.concat([Buffer.from('padding'), packet]);
  assert.deepEqual(decodeFrame(padded.subarray(7)), { ...rgba, data: Buffer.from(rgba.data) });
});
test('reject truncated, oversized, incorrectly sized and nonfinite frames', () => {
  assert.throws(() => decodeFrame(new Uint8Array(12)));
  assert.throws(() => decodeFrame(new Uint8Array(9_000_000)));
  for (const change of [
    (v: DataView) => v.setUint32(0, 0), (v: DataView) => v.setUint16(8, 0),
    (v: DataView) => v.setUint8(12, 3), (v: DataView) => v.setFloat64(16, NaN),
    (v: DataView) => v.setUint32(24, 0), (v: DataView) => v.setUint16(10, 2),
  ]) {
    const packet = encodeFrame(rgba); change(new DataView(packet.buffer));
    assert.throws(() => decodeFrame(packet));
  }
});
test('PNG header dimensions must match the frame envelope', () => {
  const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
  assert.equal(decodeFrame(encodeFrame({ ...rgba, width: 1, format: 'png', data })).format, 'png');
  assert.throws(() => decodeFrame(encodeFrame({ ...rgba, format: 'png', data })));
});
test('commands and events validate untrusted boundaries', () => {
  assert.equal(parseCommand(JSON.stringify({ type: 'capture', seq: 1, width: 640, height: 360, format: 'png', source: 'video' })).type, 'capture');
  assert.equal(parseCommand('{"type":"start","mode":"demo"}').type, 'start');
  assert.equal(parseEvent('{"type":"status","state":"lobby"}').type, 'status');
  assert.equal(parseEvent('{"type":"audio-state","enabled":false}').type, 'audio-state');
  for (const value of ['null', '{}', '{"type":"start","mode":"live"}', '{"type":"capture","seq":-1}', 'x'.repeat(17_000)]) {
    assert.throws(() => parseCommand(value));
  }
  for (const value of ['null', '{}', '{"type":"status","state":"secret"}', '{"type":"error","stage":"user-controlled"}']) {
    assert.throws(() => parseEvent(value));
  }
});
test('local camera commands require explicit intent and state never claims video is sent', () => {
  assert.equal(parseCommand('{"type":"camera","enabled":true,"requestId":1}').type, 'camera');
  assert.equal(parseCommand('{"type":"capture","seq":1,"width":80,"height":45,"format":"rgba","source":"local"}').type, 'capture');
  assert.equal(parseEvent('{"type":"camera-state","requestId":1,"state":"on","sending":false}').type, 'camera-state');
  assert.equal(parseEvent('{"type":"camera-request","enabled":true}').type, 'camera-request');
  assert.throws(() => parseCommand('{"type":"camera","enabled":true}'));
  assert.throws(() => parseCommand('{"type":"camera","enabled":"true","requestId":1}'));
  assert.throws(() => parseEvent('{"type":"camera-state","requestId":1,"state":"on","sending":true}'));
  assert.throws(() => parseEvent('{"type":"camera-state","requestId":1,"state":"off","sending":false,"reason":"raw device name"}'));
});
test('mock source registry is bounded and unavailable ids cannot alias remote video', () => {
  assert.equal(parseCommand('{"type":"capture","seq":1,"width":80,"height":45,"format":"rgba","source":"mock-12"}').type, 'capture');
  assert.throws(() => parseCommand('{"type":"capture","seq":1,"width":80,"height":45,"format":"rgba","source":"mock-13"}'));
  assert.throws(() => parseCommand('{"type":"start","mode":"demo","participants":13}'));
  assert.equal(parseEvent('{"type":"sources","sources":[{"id":"mock-2","label":"Sam","kind":"mock","available":true}]}').type, 'sources');
  assert.throws(() => parseEvent('{"type":"sources","sources":[{"id":"mock-2","label":"Sam","kind":"mock","available":"yes"}]}'));
});
test('outgoing media boundaries require kind, explicit boolean intent and a bounded request id', () => {
  assert.equal(parseCommand('{"type":"send","kind":"microphone","enabled":true,"requestId":1}').type, 'send');
  assert.equal(parseEvent('{"type":"send-state","kind":"screen","requestId":1,"state":"awaiting"}').type, 'send-state');
  assert.throws(() => parseCommand('{"type":"send","kind":"all","enabled":true,"requestId":1}'));
  assert.throws(() => parseCommand('{"type":"send","kind":"camera","enabled":"true","requestId":1}'));
  assert.throws(() => parseCommand('{"type":"send","kind":"camera","enabled":true}'));
  assert.throws(() => parseEvent('{"type":"send-state","kind":"camera","requestId":1,"state":"on","reason":"private device label"}'));
});
test('only Webex HTTPS meeting links are accepted', () => {
  assert.ok(validMeeting('https://example.webex.com/meet/test'));
  for (const url of ['http://example.webex.com', 'https://webex.com.evil.test', 'https://webex.com@evil.test',
    'https://user:password@example.webex.com', 'file:///etc/passwd', 'https://notwebex.com']) assert.ok(!validMeeting(url));
});
