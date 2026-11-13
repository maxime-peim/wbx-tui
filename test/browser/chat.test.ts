import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import type { WorkerEvent } from '../../src/protocol.js';
import type { ChatSnapshot } from '../../src/chat-protocol.js';

for (const real of [false, true]) test(`real Chrome + ${real ? 'actual pinned SDK messaging plugins (HTTP boundary stubbed)' : 'fake SDK'}: explicit space selection, receive/send, denied scope and leave`, {
  skip: process.env.WBX_BROWSER_TEST !== '1' || real && process.env.WBX_SDK_TEST !== '1', timeout: 25_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: true, live: real });
  const events: WorkerEvent[] = []; host.on('event', event => events.push(event));
  const latest = (): ChatSnapshot | undefined => events.filter((event): event is Extract<WorkerEvent, { type: 'chat-state' }> => event.type === 'chat-state').at(-1)?.chat;
  const until = async (check: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 400; i++) { if (await check()) return; await delay(10); }
    throw new Error('Chat event timed out.');
  };
  try {
    if (real) {
      // Even initialization of the actual SDK cannot contact real services in this test.
      await host.page.setRequestInterception(true);
      host.page.on('request', request => { void (request.url().startsWith(host.origin + '/') ? request.continue() : request.abort()); });
      await host.page.addScriptTag({ url: host.origin + '/sdk.js' });
      await host.page.evaluate('window.testActualFactory = window.Webex');
    }
    for (const file of ['fixture.js', 'chat-fixture.js']) await host.page.addScriptTag({ content: await readFile(new URL(file, import.meta.url), 'utf8') });
    if (real) await host.page.addScriptTag({ content: `
      const actual = window.testActualFactory.init({ credentials: { access_token: 'fake-not-a-real-token' }, config: {
        logger: { level: 'silent', bufferLogLevel: 'silent', historyLength: 0 }, meetings: { autoUploadLogs: false }
      } });
      actual.rooms.request = options => window.testChatRequest(options);
      actual.messages.request = options => window.testChatRequest(options);
      const original = window.Webex;
      window.Webex = { init(options) { const sdk = original.init(options); sdk.rooms = actual.rooms; sdk.messages = actual.messages; return sdk; } };
    ` });
    host.send({ type: 'start', mode: 'live', token: 'fake-not-a-real-token', meeting: 'https://example.webex.com/meet/test' });
    await until(() => events.some(event => event.type === 'status' && event.state === 'connected'));
    assert.equal(await host.page.evaluate('window.testChatCalls.length'), 0, 'joining never reads spaces automatically');
    host.send({ type: 'chat', action: 'rooms', requestId: 'rooms' });
    await until(() => latest()?.rooms.length === 2);
    assert.equal(latest()!.mode, 'space'); assert.equal(latest()!.room, undefined);
    assert.equal(await host.page.evaluate('window.testChatCalls.length'), 1);
    host.send({ type: 'chat', action: 'select', roomId: 'space-one', requestId: 'select' });
    await until(() => latest()?.room?.id === 'space-one' && latest()?.state === 'ready');
    assert.deepEqual(latest()!.messages.map(item => item.id), ['message-one']);
    assert.ok(!JSON.stringify(events).includes('OTHER SPACE SECRET'));
    host.send({ type: 'chat', action: 'send', roomId: 'space-one', text: 'Hello 世界 **plain**', requestId: 'send-1' });
    await until(() => events.some(event => event.type === 'chat-result' && event.requestId === 'send-1' && event.status === 'sent'));
    assert.deepEqual(await host.page.evaluate('window.testChatCalls.find(call => call.method === "POST").body'), { roomId: 'space-one', text: 'Hello 世界 **plain**' });
    host.send({ type: 'chat', action: 'send', roomId: 'space-one', text: 'Hello 世界 **plain**', requestId: 'send-1' });
    await delay(50); assert.equal(await host.page.evaluate('window.testChatCalls.filter(call => call.method === "POST").length'), 1);
    host.send({ type: 'chat', action: 'send', roomId: 'space-two', text: 'Wrong destination', requestId: 'stale-space' });
    await until(() => events.some(event => event.type === 'chat-result' && event.requestId === 'stale-space' && event.status === 'failed'));
    assert.equal(await host.page.evaluate('window.testChatCalls.filter(call => call.method === "POST").length'), 1);
    await host.page.evaluate('window.testChatMode = "denied"');
    host.send({ type: 'chat', action: 'refresh', roomId: 'space-one', requestId: 'refresh' });
    await until(() => latest()?.state === 'failed' && latest()?.problem === 'denied');
    assert.ok(!JSON.stringify(events).includes('private native'));
    assert.equal(await host.page.evaluate('window.testJoins'), 1);
    assert.equal(await host.page.evaluate('window.testCaptureCalls'), 0);
    host.send({ type: 'leave' }); await until(() => latest()?.state === 'closed');
    const count = await host.page.evaluate('window.testChatCalls.length'); await delay(100);
    assert.equal(await host.page.evaluate('window.testChatCalls.length'), count, 'leave stops message polling');
  } finally { await host.close(); }
});
