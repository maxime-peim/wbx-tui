import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import type { Frame, Source, WorkerEvent } from '../../src/protocol.js';

test('real Chrome with pinned SDK API fixture: distinct member feeds, CSI identity checks, muted presence and primary promotion', {
  skip: process.env.WBX_BROWSER_TEST !== '1', timeout: 15_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: true });
  host.page.setDefaultTimeout(4000);
  const events: WorkerEvent[] = [];
  host.on('event', event => events.push(event));
  const info = (id: Source) => events.filter((event): event is Extract<WorkerEvent, { type: 'sources' }> => event.type === 'sources').at(-1)?.sources.find(source => source.id === id);
  const get = async (source: Source): Promise<Frame> => {
    for (let i = 0; i < 80; i++) {
      const frame = await host.capture({ source, width: 320, height: 180, format: 'rgba' });
      if (frame) return frame; await delay(20);
    }
    throw new Error(`No frame for ${source}`);
  };
  const missing = (source: Source) => host.capture({ source, width: 80, height: 45, format: 'rgba' });
  try {
    for (const file of ['fixture.js', 'participants-fixture.js']) await host.page.addScriptTag({ content: await readFile(new URL(file, import.meta.url), 'utf8') });
    host.send({ type: 'start', mode: 'live', token: 'fake-not-a-real-token', meeting: 'https://example.webex.com/meet/test' });
    await host.page.waitForFunction('window.testCsiRequests.length === 12');
    assert.equal(await missing('video'), null); assert.equal(await missing('remote-2'), null, 'old CSI slot cannot impersonate the selected member');
    assert.ok(events.some(event => event.type === 'sources' && event.sources.some(source => source.id === 'remote-2' && source.present && !source.available && source.label.includes('Sam Rivera'))));
    await host.page.evaluate('window.testApplyPinned()');
    const alex = await get('video'), sam = await get('remote-2');
    const samGeneration = info('remote-2')!.generation, alexGeneration = info('video')!.generation;
    assert.ok(Math.abs(alex.data[0]! - 192) < 3); assert.ok(Math.abs(sam.data[0]! - 44) < 3); assert.notDeepEqual(alex.data, sam.data);
    await host.page.evaluate('window.testRoster.b.isVideoMuted = true; window.testRosterChanged()');
    await host.page.waitForFunction(() => document.querySelector('#remote-gallery video')?.getAttribute('aria-label')?.includes('camera off'));
    assert.equal(await missing('remote-2'), null);
    assert.equal(info('remote-2')!.generation, samGeneration, 'camera changes do not create a new identity or reopen dismissed panes');
    assert.ok(events.some(event => event.type === 'sources' && event.sources.some(source => source.id === 'remote-2' && source.present && !source.available)));
    await host.page.evaluate('window.testRoster.b.isVideoMuted = false; delete window.testRoster.a; window.testRosterChanged()');
    await host.page.waitForFunction('window.testCsiRequests.some(request => request.csi === 202) && document.querySelectorAll("#remote-gallery video").length === 0');
    assert.equal(await missing('video'), null, 'new primary cannot display the previous person while re-pinning');
    await host.page.evaluate('window.testApplyPinned()');
    const promoted = await get('video'); assert.ok(Math.abs(promoted.data[0]! - 44) < 3);
    assert.notEqual(info('video')!.generation, alexGeneration, 'primary replacement invalidates the old terminal image');
    assert.equal(await missing('remote-2'), null);
    assert.equal(await host.page.evaluate('window.testJoins'), 1); assert.equal(await host.page.evaluate('window.testCaptureCalls'), 0);
    host.send({ type: 'leave' });
    await host.page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ended');
  } finally { await host.close(); }
});
