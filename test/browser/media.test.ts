import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { MediaHost } from '../../src/host.js';
import type { Capture, Frame, WorkerEvent } from '../../src/protocol.js';

const browserPath = process.env.WBX_BROWSER || '/usr/bin/google-chrome';
const enabled = process.env.WBX_BROWSER_TEST === '1';

async function frame(host: MediaHost, request: Partial<Omit<Capture, 'type' | 'seq'>> = {}): Promise<Frame> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await host.capture({ width: 1280, height: 720, format: 'png', source: 'video', ...request });
    if (result) return result;
    await delay(30);
  }
  throw new Error('No frame within five seconds.');
}

test('real headless Chrome: synthetic frames, authentication, cancellation, and cleanup',
  { skip: !enabled, timeout: 45_000 }, async t => {
    process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
    const host = await MediaHost.open({ browserPath, headless: true });
    const faults: Error[] = [];
    host.on('fault', error => faults.push(error));
    const profile = host.profile;
    try {
      await host.page.evaluate(`navigator.mediaDevices.getUserMedia = () => {
        throw new Error('The synthetic demo must never capture local devices.');
      }`);
      await t.test('loopback assets and unauthorized WebSockets do not expose session control', async () => {
        assert.equal((await fetch(`${host.origin}/sdk.js`)).status, 404);
        assert.equal((await fetch(`${host.origin}/browser.js`)).status, 200);
        assert.equal((await fetch(host.origin, { method: 'POST' })).status, 403);
        const badHost = await new Promise<number | undefined>((resolve, reject) => {
          const req = request(host.origin, { headers: { Host: 'evil.test' } }, response => {
            response.resume(); resolve(response.statusCode);
          });
          req.on('error', reject); req.end();
        });
        assert.equal(badHost, 403);
        await new Promise<void>((resolve, reject) => {
          const peer = new WebSocket(host.origin.replace('http:', 'ws:') + '/media', ['wbx-proto', '0'.repeat(64)], {
            origin: 'https://evil.test', handshakeTimeout: 1000,
          });
          peer.on('open', () => { peer.close(); reject(new Error('Unauthorized WebSocket accepted.')); });
          peer.on('error', error => { assert.match(error.message, /403/); resolve(); });
        });
      });
      host.send({ type: 'start', mode: 'demo' });
      let first: Frame;
      await t.test('full-resolution PNG and changing source frames traverse the real binary transport', async () => {
        first = await frame(host);
        assert.equal(first.width, 1280); assert.equal(first.height, 720);
        assert.equal(first.format, 'png'); assert.ok(first.data.byteLength > 1000);
        await delay(100);
        const next = await frame(host);
        assert.ok(next.sourceFrame > first.sourceFrame);
        assert.notDeepEqual(next.data, first.data);
      });
      await t.test('text blocks request a separate, correctly sized RGBA sample from the same source', async () => {
        const pixels = await frame(host, { width: 80, height: 45, format: 'rgba' });
        assert.equal(pixels.width, 80); assert.equal(pixels.height, 45);
        assert.equal(pixels.data.byteLength, 80 * 45 * 4);
      });
      await t.test('one in-flight frame, cancellation and stale replies do not corrupt the next request', async () => {
        const pending = host.capture({ width: 640, height: 360, format: 'png', source: 'video' });
        await assert.rejects(host.capture({ width: 1, height: 1, format: 'png', source: 'video' }), /in flight/);
        await pending;
        const abort = new AbortController();
        const canceled = host.capture({ width: 640, height: 360, format: 'png', source: 'video' }, abort.signal);
        abort.abort(); await assert.rejects(canceled, /canceled/);
        assert.equal((await frame(host, { width: 320, height: 180 })).width, 320);
      });
      await t.test('unavailable sources report no frame instead of substituting the wrong feed', async () => {
        assert.equal(await host.capture({ width: 640, height: 360, format: 'png', source: 'share' }), null);
      });
      await t.test('synthetic 720p encoding/transport measurement (not a display benchmark)', async () => {
        const started = performance.now();
        const samples = 30;
        const distinct = new Set<number>();
        for (let i = 0; i < samples; i++) distinct.add((await frame(host)).sourceFrame);
        const elapsed = (performance.now() - started) / 1000;
        t.diagnostic(`${samples} PNG frames in ${elapsed.toFixed(2)}s; ${(samples / elapsed).toFixed(1)} transfers/s; ${distinct.size} distinct source frames. No TTY/display measured.`);
      });
      assert.deepEqual(faults, []);
    } finally { await host.close(); }
    await assert.rejects(stat(profile), { code: 'ENOENT' });
    await host.close();
  });

test('real headless Chrome with fake SDK: receive-only join and browser controls reuse one session',
  { skip: !enabled, timeout: 30_000 }, async () => {
    process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
    const host = await MediaHost.open({ browserPath, headless: true });
    const events: WorkerEvent[] = [];
    host.on('event', event => events.push(event));
    try {
      // Separate JS fixture: TSX's function-name helpers cannot be serialized into page.evaluate.
      await host.page.addScriptTag({ content: await readFile(new URL('fixture.js', import.meta.url), 'utf8') });
      host.send({ type: 'start', mode: 'live', token: 'synthetic-not-a-real-token', meeting: 'https://example.webex.com/meet/test' });
      assert.equal((await frame(host, { width: 640, height: 360 })).width, 640);
      host.send({ type: 'audio', enabled: true });
      await host.page.click('#audio');
      assert.equal((await frame(host, { format: 'rgba', width: 80, height: 45 })).width, 80);
      const state = await host.page.evaluate(() => ({ joins: (window as any).testJoins, captures: (window as any).testCaptureCalls }));
      assert.deepEqual(state, { joins: 1, captures: 0 });
      assert.ok(events.some(event => event.type === 'status' && event.state === 'connected'));
      await host.page.click('#leave');
      await host.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ended');
    } finally { await host.close(); }
  });

test('pinned real Webex UMD bundle loads in Chrome without initializing an account', {
  skip: !enabled || process.env.WBX_SDK_TEST !== '1', timeout: 30_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath, headless: true, live: true });
  try {
    await host.page.setRequestInterception(true);
    host.page.on('request', request => { void (request.url().startsWith(host.origin + '/') ? request.continue() : request.abort()); });
    await host.page.addScriptTag({ url: host.origin + '/sdk.js' });
    assert.equal(await host.page.evaluate(() => typeof window.Webex?.init), 'function');
  } finally { await host.close(); }
});

test('local preview: explicit video-only capture, private frames, cancellation, denial and shutdown', {
  skip: !enabled, timeout: 30_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath, headless: true });
  const faults: Error[] = [], events: WorkerEvent[] = [];
  host.page.setDefaultTimeout(4000);
  let cameraRequest = 0;
  host.on('fault', error => faults.push(error));
  host.on('event', (event: WorkerEvent) => {
    events.push(event);
    if (event.type === 'camera-request') host.send({ type: 'camera', enabled: event.enabled, requestId: ++cameraRequest });
  });
  try {
    await host.page.addScriptTag({ content: await readFile(new URL('fixture.js', import.meta.url), 'utf8') });
    await host.page.addScriptTag({ content: await readFile(new URL('camera-fixture.js', import.meta.url), 'utf8') });
    host.send({ type: 'start', mode: 'live', token: 'synthetic-not-a-real-token', meeting: 'https://example.webex.com/meet/test' });
    await frame(host);
    assert.equal(await host.page.evaluate(() => (window as any).previewRequests.length), 0);
    assert.equal(await host.capture({ width: 80, height: 45, format: 'rgba', source: 'local' }), null);

    await host.page.click('#camera'); // explicit browser action; fake camera only
    await host.page.waitForFunction(() => document.querySelector('#camera-status')?.textContent?.includes('Camera preview: on'));
    const local = await frame(host, { source: 'local', width: 320, height: 180, format: 'rgba' });
    assert.equal(local.width, 320);
    assert.ok(Math.abs(local.data[0]! - 207) <= 2 && Math.abs(local.data[1]! - 50) <= 2);
    await delay(150);
    const nextLocal = await frame(host, { source: 'local', width: 320, height: 180, format: 'rgba' });
    assert.ok(nextLocal.sourceFrame > local.sourceFrame); assert.notDeepEqual(nextLocal.data, local.data);
    assert.ok(await host.page.evaluate(() => document.querySelector('#camera-status')?.textContent?.includes('sending: OFF')));
    assert.ok(events.some(event => event.type === 'camera-state' && event.state === 'on' && event.sending === false));

    await host.page.click('#camera');
    await host.page.waitForFunction(() => document.querySelector('#camera-status')?.textContent?.includes('Camera preview: off'));
    assert.ok(await host.page.evaluate('window.previewStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))'));
    assert.equal(await host.capture({ width: 80, height: 45, format: 'rgba', source: 'local' }), null);
    assert.equal((await frame(host, { width: 320, height: 180 })).width, 320); // remote feed survives

    await host.page.evaluate('window.previewMode = "deferred"');
    await host.page.click('#camera');
    await host.page.waitForFunction('typeof window.resolvePreview === "function"');
    await host.page.click('#camera'); // cancel while native permission/capture is pending
    // The click travels browser -> controller -> browser. CDP evaluation can
    // otherwise resolve capture before the controller's cancellation arrives.
    await host.page.waitForFunction(() => document.querySelector('#camera-status')?.textContent?.includes('Camera preview: off'));
    await host.page.evaluate('window.resolvePreview()');
    await host.page.waitForFunction('window.previewStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))');
    assert.equal(await host.capture({ width: 80, height: 45, format: 'rgba', source: 'local' }), null);

    await host.page.evaluate('window.previewMode = "denied"');
    await host.page.click('#camera');
    await host.page.waitForFunction(() => document.querySelector('#camera-status')?.textContent?.includes('(denied)'));
    assert.equal((await frame(host, { width: 320, height: 180 })).width, 320);
    await host.page.evaluate('window.previewMode = "ok"');
    await host.page.click('#camera');
    await frame(host, { source: 'local', width: 320, height: 180, format: 'rgba' });
    assert.equal(await host.page.evaluate(() => (window as any).testJoins), 1);
    assert.ok(await host.page.evaluate('window.previewRequests.every(request => request.audio === false)'));
    await host.page.click('#leave');
    await host.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ended');
    assert.ok(await host.page.evaluate('window.previewStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))'));
    assert.deepEqual(faults, []);
  } finally { await host.close(); }
});
