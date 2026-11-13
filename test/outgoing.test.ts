import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { OutgoingMedia, type LocalStream } from '../src/browser/outgoing.js';

class Track extends EventTarget {
  readyState = 'live'; enabled = true;
  stop() { this.readyState = 'ended'; }
  ended() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}
function stream() {
  const track = new Track();
  const value = Object.assign(new EventEmitter(), { outputStream: { getTracks: () => [track] } as unknown as MediaStream, stop() { track.stop(); } });
  return { track, value: value as LocalStream & EventEmitter };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; }

test('outgoing capture/publishing requires explicit intent and default construction does nothing', async () => {
  const f = stream(); let captures = 0, published = 0, unpublished = 0;
  const states: string[] = [];
  const control = new OutgoingMedia({ acquire: async () => { captures++; return f.value; },
    publish: async value => { assert.equal(value, f.value); published++; }, unpublish: async () => { unpublished++; } }, state => states.push(state));
  assert.equal(captures, 0); assert.equal(published, 0);
  control.setEnabled(true); await tick(); assert.deepEqual(states, ['starting', 'on']); assert.equal(published, 1);
  control.setEnabled(true); assert.equal(captures, 1);
  control.setEnabled(false); assert.equal(f.track.readyState, 'ended'); assert.equal(f.track.enabled, false);
  await tick(); assert.equal(unpublished, 1); assert.equal(states.at(-1), 'off'); control.close();
});
test('cancel/shutdown during native permission capture stops late streams without publishing', async () => {
  for (const shutdown of [false, true]) {
    const f = stream(), pending = deferred<LocalStream>(); let published = 0;
    const control = new OutgoingMedia({ acquire: () => pending.promise, publish: async () => { published++; }, unpublish: async () => {} }, () => {});
    control.setEnabled(true); if (shutdown) control.close(); else control.setEnabled(false);
    pending.resolve(f.value); await tick(); assert.equal(published, 0); assert.equal(f.track.readyState, 'ended'); control.close();
  }
});
test('cancel during in-flight SDK publish immediately stops tracks and unpublishes a late success', async () => {
  const f = stream(), pending = deferred<void>(); let unpublished = 0;
  const states: string[] = [];
  const control = new OutgoingMedia({ acquire: async () => f.value, publish: () => pending.promise,
    unpublish: async () => { unpublished++; } }, state => states.push(state));
  control.setEnabled(true); await tick(); control.setEnabled(false);
  assert.equal(f.track.readyState, 'ended'); assert.equal(f.track.enabled, false); assert.equal(unpublished, 0);
  pending.resolve(); await tick(); assert.equal(unpublished, 1); assert.ok(!states.includes('on')); control.close();
});
test('device/display end and host mute stop local sending, never automatically unmute it', async () => {
  for (const hostMute of [false, true]) {
    const f = stream(), states: string[] = [];
    const control = new OutgoingMedia({ acquire: async () => f.value, publish: async () => {}, unpublish: async () => {} },
      (state, reason) => states.push(`${state}:${reason ?? ''}`));
    control.setEnabled(true); await tick();
    if (hostMute) f.value.emit('muted:byServer', true); else f.track.ended();
    assert.equal(states.at(-1), hostMute ? 'off:host-muted' : 'off:ended'); assert.equal(f.track.readyState, 'ended');
    f.value.emit('muted:byServer', false); assert.equal(f.track.readyState, 'ended'); control.close();
  }
});
test('capture/SDK failure is bounded and off/on during an old publish uses a fresh stream', async () => {
  const first = stream(), second = stream(), pending = deferred<void>(); let captures = 0;
  const states: string[] = [];
  const control = new OutgoingMedia({ acquire: async () => ++captures === 1 ? first.value : second.value,
    publish: value => value === first.value ? pending.promise : Promise.resolve(), unpublish: async () => {} }, state => states.push(state));
  control.setEnabled(true); await tick(); control.setEnabled(false); control.setEnabled(true);
  pending.resolve(); await tick(); await tick(); assert.equal(captures, 2); assert.equal(first.track.readyState, 'ended');
  assert.equal(second.track.readyState, 'live'); assert.equal(states.at(-1), 'on'); control.close();
  const errors: string[] = [];
  const denied = new OutgoingMedia({ acquire: async () => { throw Object.assign(new Error('private native device details'), { name: 'NotAllowedError' }); },
    publish: async () => {}, unpublish: async () => {} }, (state, reason) => errors.push(`${state}:${reason}`));
  denied.setEnabled(true); await tick(); assert.equal(errors.at(-1), 'off:denied'); assert.ok(!errors.join().includes('private')); denied.close();
});
