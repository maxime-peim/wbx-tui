import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import type { Frame } from '../../src/protocol.js';

test('generated local preview continues advancing with the owned Chrome minimized', {
  skip: process.env.WBX_KITTY_TEST !== '1', timeout: 20_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: false });
  const getFrame = async (): Promise<Frame> => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const value = await host.capture({ source: 'local', width: 320, height: 180, format: 'rgba' });
      if (value) return value;
      await delay(30);
    }
    throw new Error('Generated local preview did not produce a frame.');
  };
  try {
    // Replace the API before requesting preview: this never accesses hardware
    // and never grants a permission, even though this test uses headed Chrome.
    await host.page.addScriptTag({ content: await readFile(new URL('../browser/camera-fixture.js', import.meta.url), 'utf8') });
    host.send({ type: 'start', mode: 'demo' });
    host.send({ type: 'camera', enabled: true, requestId: 1 });
    const first = await getFrame();
    await host.visible(false); await delay(300);
    const next = await getFrame();
    assert.ok(next.sourceFrame > first.sourceFrame); assert.notDeepEqual(next.data, first.data);
    host.send({ type: 'camera', enabled: false, requestId: 2 });
    await host.page.waitForFunction('window.previewStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))');
    assert.equal(await host.capture({ source: 'local', width: 320, height: 180, format: 'rgba' }), null);
  } finally { await host.close(); }
});
