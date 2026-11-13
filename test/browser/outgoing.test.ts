import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import type { Frame, SendKind, Source, WorkerEvent } from '../../src/protocol.js';

test('real Chrome + fake SDK: sending is opt-in/confirmed, preview is isolated, and mic/camera/share stop on cancel, denial and leave', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 25_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: true });
  host.page.setDefaultTimeout(4000);
  const events: WorkerEvent[] = [];
  host.on('event', event => events.push(event));
  const get = async (source: Source): Promise<Frame> => {
    for (let i = 0; i < 80; i++) {
      const frame = await host.capture({ source, width: 320, height: 180, format: 'rgba' });
      if (frame) return frame; await delay(20);
    }
    throw new Error(`No ${source} frame`);
  };
  const state = async (kind: SendKind, expected: string) => {
    await host.page.waitForFunction((kind, expected) => {
      const text = document.querySelector('#send-status')?.textContent ?? '';
      const prefix = kind === 'microphone' ? 'Meeting microphone' : kind === 'camera' ? 'Meeting camera' : 'Screen sharing';
      return text.includes(`${prefix}: ${expected}.`);
    }, {}, kind, expected);
  };
  const confirm = async (kind: SendKind, requestId: number) => {
    host.send({ type: 'send', kind, enabled: true, requestId }); await state(kind, 'awaiting');
    await host.page.click(`#send-${kind}`);
  };
  try {
    for (const file of ['fixture.js', 'outgoing-fixture.js', 'camera-fixture.js']) await host.page.addScriptTag({ content: await readFile(new URL(file, import.meta.url), 'utf8') });
    host.send({ type: 'start', mode: 'live', token: 'fake-not-a-real-token', meeting: 'https://example.webex.com/meet/test' });
    await host.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'connected');
    assert.equal(await host.page.evaluate('window.testLocalRequests.length'), 0);
    host.send({ type: 'camera', enabled: true, requestId: 1 }); await get('local');
    assert.equal(await host.page.evaluate('window.testPublished.length'), 0, 'preview is never published');
    host.send({ type: 'send', kind: 'microphone', enabled: true, requestId: 1 }); await state('microphone', 'awaiting');
    assert.equal(await host.page.evaluate('window.testLocalRequests.length'), 0, 'terminal arm alone cannot capture or send');
    await host.page.evaluate(() => document.querySelector<HTMLButtonElement>('#send-microphone')!.click());
    assert.equal(await host.page.evaluate('window.testLocalRequests.length'), 0, 'untrusted scripted clicks cannot enable sending');
    await host.page.click('#send-microphone'); await state('microphone', 'on');
    await confirm('camera', 1); await state('camera', 'on'); await get('self');
    await confirm('screen', 1); await state('screen', 'on'); await get('presenting');
    assert.deepEqual(await host.page.evaluate('window.testShareGestures'), [true]);
    assert.equal(await host.page.evaluate('window.testJoins'), 1);
    assert.deepEqual(await host.page.evaluate('window.testMediaUpdates'), [{ audioEnabled: true }, { videoEnabled: true }]);
    assert.ok(await host.page.evaluate('window.testPublished.every(options => Object.values(options).every(value => !window.previewStreams?.includes(value?.outputStream)))'));
    assert.ok(await host.page.evaluate(() => document.querySelector('#camera-status')!.textContent!.includes('sending: ON')));

    host.send({ type: 'send', kind: 'camera', enabled: false, requestId: 2 }); await state('camera', 'off');
    assert.equal(await host.capture({ source: 'self', width: 80, height: 45, format: 'rgba' }), null);
    assert.ok(await get('local'), 'turning off meeting camera does not turn off independent local preview');
    host.send({ type: 'send', kind: 'microphone', enabled: false, requestId: 2 }); await state('microphone', 'off');
    await host.page.evaluate('window.testSendMode = "denied"');
    await confirm('microphone', 3); await state('microphone', 'off');
    assert.ok(await host.page.evaluate(() => document.querySelector('#send-status')!.textContent!.includes('denied')));
    assert.ok(!await host.page.evaluate(() => document.body.textContent!.includes('private native')));

    await host.page.evaluate('window.testSendMode = "ok"; window.testPublishMode = "deferred"');
    await confirm('camera', 3);
    await host.page.waitForFunction('typeof window.testCompletePublish === "function"');
    host.send({ type: 'send', kind: 'camera', enabled: false, requestId: 4 }); await state('camera', 'off');
    assert.ok(await host.page.evaluate('window.testSendingStreams.at(-1).outputStream.getTracks().every(track => track.readyState === "ended" && !track.enabled)'));
    await host.page.evaluate('window.testCompletePublish(); window.testPublishMode = "ok"');
    await host.page.waitForFunction('window.testUnpublished.includes(window.testSendingStreams.at(-1))');
    assert.ok(!events.some(event => event.type === 'send-state' && event.kind === 'camera' && event.requestId === 4 && event.state === 'on'));
    await confirm('camera', 5); await state('camera', 'on');
    await get('video'); assert.equal(await host.page.evaluate('window.testJoins'), 1);
    host.send({ type: 'leave' });
    await host.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ended');
    assert.ok(await host.page.evaluate('window.testSendingStreams.every(value => value.outputStream.getTracks().every(track => track.readyState === "ended"))'));
    assert.ok(await host.page.evaluate('window.previewStreams.every(value => value.getTracks().every(track => track.readyState === "ended"))'));
  } finally { await host.close(); }
});
