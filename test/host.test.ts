import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizedUpgrade, MediaHost } from '../src/host.js';
import { Metrics, percentile } from '../src/metrics.js';
import { createConnection, type Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, stat } from 'node:fs/promises';
import { cleanupAll, deadline } from '../src/lifecycle.js';

const never = () => new Promise<never>(() => {});
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: Error) => reject(error) };
}

test('upgrade authentication checks secret, origin, host, and endpoint independently', () => {
  const origin = 'http://127.0.0.1:12345', secret = 'a'.repeat(64);
  const request = { url: '/media', headers: { host: '127.0.0.1:12345', origin,
    'sec-websocket-protocol': `wbx-proto, ${secret}` } };
  assert.ok(authorizedUpgrade(request, origin, secret));
  for (const change of [
    { ...request, url: '/other' },
    { ...request, headers: { ...request.headers, origin: 'https://evil.test' } },
    { ...request, headers: { ...request.headers, host: 'evil.test' } },
    { ...request, headers: { ...request.headers, 'sec-websocket-protocol': `wbx-proto, ${'b'.repeat(64)}` } },
    { ...request, headers: { ...request.headers, 'sec-websocket-protocol': 'wbx-proto' } },
  ]) assert.ok(!authorizedUpgrade(change, origin, secret));
});
test('aborted startup exits without launching a browser', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(MediaHost.open({ signal: abort.signal }), /abort/i);
});
test('every CDP visibility stage is bounded without launching a browser', async t => {
  for (const stage of ['create', 'get', 'bounds', 'front', 'detach']) await t.test(stage, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const host = new MediaHost(), calls: string[] = [];
    const client = {
      send: async (method: string) => { calls.push(method); if ((stage === 'get' && method.endsWith('getWindowForTarget')) || (stage === 'bounds' && method.endsWith('setWindowBounds'))) return never(); return { windowId: 1 }; },
      detach: () => { calls.push('detach'); return stage === 'detach' ? never() : Promise.resolve(); },
    };
    host.page = {
      createCDPSession: () => stage === 'create' ? never() : Promise.resolve(client),
      bringToFront: () => { calls.push('front'); return stage === 'front' ? never() : Promise.resolve(); },
    } as unknown as MediaHost['page'];
    let outcome: unknown;
    const visible = host.visible(true).then(() => { outcome = 'done'; }, error => { outcome = error; });
    await flush(); t.mock.timers.tick(3000); await flush(); await visible;
    if (stage === 'detach') assert.equal(outcome, 'done'); else assert.match(String(outcome), /timed out/);
    if (stage !== 'create') assert.ok(calls.includes('detach'));
    if (stage === 'get' || stage === 'bounds') assert.ok(!calls.includes('front'));
    await host.close();
  });
});
test('late CDP creation is detached, never raises a window, and cannot delay the owner hard stop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = new MediaHost(), creation = deferred<{ send(): Promise<unknown>; detach(): Promise<void> }>();
  let killed = 0, detached = 0, commands = 0, closeCalls = 0;
  host.page = { createCDPSession: () => creation.promise, bringToFront: () => { commands++; return Promise.resolve(); } } as unknown as MediaHost['page'];
  host.browser = { close: () => { closeCalls++; return never(); }, process: () => ({ kill: () => { killed++; } }) } as unknown as MediaHost['browser'];
  // A graceful leave that never responds shares, but cannot extend, the 4s budget.
  Object.assign(host, { peer: { readyState: 1, send() {}, terminate() {} } });
  const visibility = host.visible(true).catch(error => error);
  await flush();
  const close = host.close(); assert.equal(host.close(), close);
  assert.match(String(await visibility), /canceled/);
  t.mock.timers.tick(3000); await flush(); assert.equal(closeCalls, 1); assert.equal(killed, 0);
  t.mock.timers.tick(1000); await flush(); await close; assert.equal(killed, 1);
  creation.resolve({ send: async () => { commands++; }, detach: async () => { detached++; } });
  await flush(); assert.equal(detached, 1); assert.equal(commands, 0);
  await assert.rejects(host.visible(true), /canceled/);
});
test('rejected raw upgrades and incomplete HTTP connections are destroyed on bounded close', { timeout: 3000 }, async () => {
  const host = new MediaHost();
  const internals = host as unknown as { listen(assets: Map<string, [string, Buffer]>): Promise<void>; rawSockets: Set<Socket> };
  const clients: Socket[] = [];
  try {
    await internals.listen(new Map());
    const url = new URL(host.origin);
    const connect = async () => {
      const socket = createConnection({ host: url.hostname, port: Number(url.port), allowHalfOpen: true });
      clients.push(socket); socket.on('error', () => {}); await once(socket, 'connect'); return socket;
    };
    const rejected = await connect(), ended = once(rejected, 'end');
    let refusal = ''; rejected.on('data', bytes => { refusal += bytes.toString(); });
    rejected.write(`GET /media HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nOrigin: https://invalid.test\r\nSec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    await deadline(() => ended, 1000);
    assert.match(refusal, /403/);
    // Client deliberately never sends FIN; the owner must not retain its half.
    assert.ok([...internals.rawSockets].every(socket => socket.destroyed));
    const partial = await connect(); partial.write('GET /media HTTP/1.1\r\n');
    assert.ok(internals.rawSockets.size > 0);
    await deadline(() => host.close(), 1000);
    assert.ok([...internals.rawSockets].every(socket => socket.destroyed));
  } finally { for (const client of clients) client.destroy(); await host.close(); }
});
test('cleanup failures, rejected browser close, and a stuck server callback cannot skip profile cleanup', { timeout: 3000 }, async t => {
  const host = new MediaHost(); host.profile = await mkdtemp('/tmp/opencode/wbx-host-cleanup-');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let killed = 0, rawDestroyed = 0, serverClosed = 0;
  host.browser = { close() { throw new Error('close failed'); }, process: () => ({ kill() { killed++; throw new Error('already exited'); } }) } as unknown as MediaHost['browser'];
  Object.assign(host, {
    peer: { readyState: 1, send() { throw new Error('send failed'); }, terminate() { throw new Error('terminate failed'); } },
    sockets: { close() { throw new Error('sockets failed'); } },
    rawSockets: new Set([{ destroy() { throw new Error('destroy failed'); } }, { destroy() { rawDestroyed++; } }]),
    server: { listening: true, closeAllConnections() { throw new Error('connections failed'); }, close() { serverClosed++; } },
  });
  host.on('fault', () => {});
  const close = host.close(); await flush();
  assert.equal(killed, 1); assert.equal(serverClosed, 1); assert.equal(rawDestroyed, 1);
  t.mock.timers.tick(1000); await close;
  assert.equal(host.listenerCount('fault'), 0);
  await assert.rejects(stat(host.profile), { code: 'ENOENT' });
});
test('independent cleanup starts every branch and bounds late rejecting/stalled work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred<void>(), calls: string[] = [];
  const cleanup = cleanupAll([
    () => { calls.push('throw'); throw new Error('failed'); },
    () => { calls.push('late'); return late.promise; },
    () => { calls.push('stuck'); return never(); },
    () => { calls.push('restore'); },
  ], 1000);
  assert.deepEqual(calls, ['throw', 'late', 'stuck', 'restore']);
  t.mock.timers.tick(1000); await cleanup; late.reject(new Error('late failure is observed')); await flush();
});
test('metrics distinguish duplicate frames and missing measurements', () => {
  const metrics = new Metrics();
  assert.equal(metrics.summary().captureToTTYWriteP95Ms, null);
  const frame = { seq: 1, sourceFrame: 10, width: 1, height: 1, format: 'rgba' as const,
    capturedAt: Date.now(), data: new Uint8Array(4) };
  metrics.frame(frame); metrics.frame(frame); metrics.frame({ ...frame, sourceFrame: 13 });
  assert.equal(metrics.uniqueFrames, 2); assert.equal(metrics.sourceFramesSkipped, 2);
  assert.equal(percentile([3, 1, 2], .5), 2); metrics.stop();
});
test('diagnostics separate capture/bridge, preparation, writes and acknowledgment waits', () => {
  const metrics = new Metrics();
  metrics.frame({ seq: 1, sourceFrame: 1, width: 1, height: 1, format: 'rgba', capturedAt: 1000,
    data: new Uint8Array(4) }, 1090, 1100, 128, { requestStartedAt: 900, receivedAt: 1050, writeStartedAt: 1070 });
  const report = metrics.summary();
  assert.equal(report.captureRequestP95Ms, 150);
  assert.equal(report.captureAndBridgeP95Ms, 50);
  assert.equal(report.framePreparationP95Ms, 20);
  assert.equal(report.terminalWriteP95Ms, 20);
  assert.equal(report.terminalAckWaitP95Ms, 10);
  assert.equal(report.captureToTerminalAckP95Ms, 100);
  metrics.stop();
});
test('multi-feed metrics do not confuse equal counters or jumps from different sources', () => {
  const metrics = new Metrics();
  const frame = { seq: 1, sourceFrame: 10, width: 1, height: 1, format: 'rgba' as const, capturedAt: 1000, data: new Uint8Array(4) };
  const stages = { requestStartedAt: 1000, receivedAt: 1000, writeStartedAt: 1000 };
  metrics.frame(frame, 1000, undefined, 0, { ...stages, source: 'video' });
  metrics.frame(frame, 1000, undefined, 0, { ...stages, source: 'mock-2' });
  metrics.frame({ ...frame, sourceFrame: 12 }, 1000, undefined, 0, { ...stages, source: 'video' });
  const report = metrics.summary();
  assert.equal(report.uniqueFrames, 3); assert.equal(report.sourceFramesSkipped, 1);
  assert.equal(report.perSource['mock-2']!.uniqueFrames, 1); assert.equal(report.perSource.video!.uniqueFrames, 2);
  metrics.stop();
});
