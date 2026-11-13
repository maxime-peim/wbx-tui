import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, unlink } from 'node:fs/promises';
import { SharedFrames, singleGraphicsReader } from '../src/shared-memory.js';

test('RAM frame leases are private, exclusive, bounded, and cleaned up', {
  skip: !await SharedFrames.supported(),
}, async () => {
  const frames = new SharedFrames();
  try {
    const first = await frames.create(Uint8Array.from([1, 2, 3, 255]));
    assert.match(first.name, /^\/wbx-pixel-[0-9a-f]{32}$/);
    const path = '/dev/shm' + first.name;
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await readFile(path), Buffer.from([1, 2, 3, 255]));
    await assert.rejects(frames.create(new Uint8Array(4)), /in flight/);
    await first.release(); await first.release();
    await assert.rejects(stat(path), { code: 'ENOENT' });
    const second = await frames.create(new Uint8Array(4));
    // Real Kitty unlinks POSIX SHM itself after reading.
    await unlink('/dev/shm' + second.name);
    await second.release();
    await assert.rejects(frames.create(new Uint8Array(0)), /size/);
    await assert.rejects(frames.create(new Uint8Array(9_000_000)), /size/);
    const last = await frames.create(new Uint8Array(4));
    await frames.close();
    await assert.rejects(stat('/dev/shm' + last.name), { code: 'ENOENT' });
  } finally { await frames.close(); }
});
test('unknown tmux targeting disables single-reader shared-memory transport', async () => {
  assert.equal(await singleGraphicsReader({}), true);
  assert.equal(await singleGraphicsReader({ TMUX: 'present' }), false);
  assert.equal(await singleGraphicsReader({ TMUX: 'present', TMUX_PANE: 'not-a-pane' }), false);
});
