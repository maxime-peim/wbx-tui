import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraPreview } from '../src/browser/camera.js';

class Track extends EventTarget {
  readyState = 'live'; stops = 0;
  stop(): void { this.stops++; this.readyState = 'ended'; }
  ended(): void { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}
function fakeStream() {
  const track = new Track();
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
test('camera is never captured automatically, requests video only, and stops when disabled', async () => {
  const f = fakeStream(); const states: string[] = [], streams: (MediaStream | null)[] = [];
  const requests: MediaStreamConstraints[] = [];
  const camera = new CameraPreview(async constraints => { requests.push(constraints); return f.stream; },
    value => streams.push(value), state => states.push(state));
  assert.equal(requests.length, 0);
  await camera.setEnabled(true);
  assert.deepEqual(requests, [{ audio: false, video: { width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 24 } } }]);
  assert.deepEqual(states, ['starting', 'on']); assert.equal(streams.at(-1), f.stream);
  await camera.setEnabled(true); assert.equal(requests.length, 1);
  await camera.setEnabled(false); assert.equal(f.track.stops, 1); assert.equal(streams.at(-1), null);
  camera.close(); assert.equal(f.track.stops, 1);
  await camera.setEnabled(true); assert.equal(requests.length, 1);
});
test('canceling a permission request stops a late stream without ever adopting it', async () => {
  const f = fakeStream(), pending = deferred<MediaStream>();
  const states: string[] = [], adopted: (MediaStream | null)[] = [];
  const camera = new CameraPreview(() => pending.promise, stream => adopted.push(stream), state => states.push(state));
  const enabling = camera.setEnabled(true);
  await camera.setEnabled(false);
  pending.resolve(f.stream); await enabling;
  assert.equal(f.track.stops, 1); assert.ok(!adopted.includes(f.stream));
  assert.deepEqual(states, ['starting', 'off']); camera.close();
});
test('shutdown during a pending permission request also cleans up late native capture', async () => {
  const f = fakeStream(), pending = deferred<MediaStream>();
  const adopted: (MediaStream | null)[] = [];
  const camera = new CameraPreview(() => pending.promise, stream => adopted.push(stream), () => {});
  const enabling = camera.setEnabled(true); camera.close();
  pending.resolve(f.stream); await enabling;
  assert.equal(f.track.stops, 1); assert.ok(!adopted.includes(f.stream));
});
test('rapid off/on coalesces native requests and respects the latest explicit intent', async () => {
  const f = fakeStream(), pending = deferred<MediaStream>();
  let requests = 0, adopted: MediaStream | null = null;
  const camera = new CameraPreview(() => { requests++; return pending.promise; }, value => { adopted = value; }, () => {});
  const first = camera.setEnabled(true); await camera.setEnabled(false);
  const latest = camera.setEnabled(true);
  assert.equal(requests, 1); pending.resolve(f.stream); await Promise.all([first, latest]);
  assert.equal(adopted, f.stream); assert.equal(f.track.stops, 0);
  camera.close(); assert.equal(f.track.stops, 1);
});
test('permission errors are bounded, leave the camera off, and permit an explicit retry', async () => {
  const f = fakeStream(); let calls = 0;
  const states: { state: string; reason?: string }[] = [];
  const camera = new CameraPreview(async () => {
    if (!calls++) throw Object.assign(new Error('sensitive native device details'), { name: 'NotAllowedError' });
    return f.stream;
  }, () => {}, (state, reason) => states.push({ state, ...(reason ? { reason } : {}) }));
  await camera.setEnabled(true);
  assert.deepEqual(states.at(-1), { state: 'off', reason: 'denied' });
  assert.ok(!JSON.stringify(states).includes('sensitive'));
  await camera.setEnabled(true); assert.equal(states.at(-1)?.state, 'on'); camera.close();
});
test('device revocation ends the preview and releases every owned track', async () => {
  const f = fakeStream(); const states: string[] = [];
  const camera = new CameraPreview(async () => f.stream, () => {}, (state, reason) => states.push(`${state}:${reason ?? ''}`));
  await camera.setEnabled(true); f.track.ended();
  assert.equal(states.at(-1), 'off:ended'); assert.equal(f.track.stops, 1); camera.close();
});
