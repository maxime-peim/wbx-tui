import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { Command, SendKind, WorkerEvent } from '../../src/protocol.js';

const bundle = build({ entryPoints: ['src/browser/main.ts'], bundle: true, write: false, platform: 'browser', format: 'iife',
  plugins: [{ name: 'in-memory-session', setup(build) {
    build.onResolve({ filter: /^\.\/webex\.js$/ }, () => ({ path: 'webex', namespace: 'synthetic' }));
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `
      export class WebexSession {
        constructor(factory, sink) { this.sink = sink; }
        async start() { this.sink.status('connected'); }
        acquireLocal(kind) { return fixture.acquire(kind); }
        publishLocal(kind, stream) { return fixture.publish(kind, stream); }
        unpublishLocal(stream) { return Promise.resolve(); }
        stop() { return fixture.stop(); }
      }`, loader: 'js' }));
  } }], logLevel: 'silent' }).then(result => result.outputFiles[0]!.text);
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
class Stream {
  tracks = [{ readyState: 'live', enabled: true, stop() { this.readyState = 'ended'; }, addEventListener() {}, removeEventListener() {} }];
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
}
class Element {
  hidden = false; textContent = ''; srcObject: Stream | null = null; style = {}; onclick?: (event: { isTrusted: boolean }) => void;
  constructor(readonly id: string, private log: string[]) {}
  scrollIntoView() { this.log.push(`reveal:${this.id}`); }
  focus() { this.log.push(`focus:${this.id}`); }
  click() { this.log.push(`click:${this.id}`); this.onclick?.({ isTrusted: false }); }
  play() { return Promise.resolve(); }
  pause() {}
  remove() {}
  append() {}
  replaceChildren() {}
}
async function fixture() {
  const log: string[] = [], events: WorkerEvent[] = [], elements = new Map<string, Element>();
  const get = (id: string) => { let element = elements.get(id); if (!element) { element = new Element(id, log); elements.set(id, element); } return element; };
  let socket!: Socket;
  class Socket {
    static OPEN = 1; readyState = 1; onopen?: () => void; onmessage?: (event: { data: string }) => void;
    constructor() { socket = this; }
    send(text: string) { events.push(JSON.parse(text)); }
  }
  const streams: Stream[] = [], acquired: SendKind[] = [], published: SendKind[] = [];
  let permitPublish = () => {}, deviceCalls = 0, sessionStops = 0;
  const api = {
    acquire: async (kind: SendKind) => { acquired.push(kind); const outputStream = new Stream(); streams.push(outputStream); return { outputStream, stop() {} }; },
    publish: (kind: SendKind) => { published.push(kind); return new Promise<void>(resolve => { permitPublish = resolve; }); },
    stop: () => { sessionStops++; return new Promise<void>(() => {}); },
  };
  const window = { Webex: {}, __wbx: undefined as unknown as { connect(url: string, key: string): void }, addEventListener() {} };
  runInNewContext(await bundle, {
    fixture: api, window, document: { querySelector: (selector: string) => get(selector.slice(1)), createElement: (tag: string) => get(`created-${tag}`), body: get('body') },
    navigator: { mediaDevices: { getUserMedia() { deviceCalls++; throw new Error('No device capture in synthetic tests.'); } } },
    WebSocket: Socket, MediaStream: Stream, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, TextEncoder, TextDecoder, URL,
  });
  window.__wbx.connect('ws://in-memory.invalid/media', 'not-a-real-key'); socket.onopen!();
  const command = (command: Command) => socket.onmessage!({ data: JSON.stringify(command) });
  command({ type: 'start', mode: 'live', token: 'fake', meeting: 'https://example.webex.com/meet/offline' });
  await flush();
  assert.ok(events.some(event => event.type === 'status' && event.state === 'connected'), 'only the in-memory fake session starts');
  return { get, command, log, events, streams, acquired, published,
    permitPublish: () => permitPublish(), deviceCalls: () => deviceCalls, sessionStops: () => sessionStops,
    latestSources: () => events.filter(event => event.type === 'sources').at(-1)!.sources };
}

test('confirmation/stop controls precede every tall video and remain scrollable at small viewports', async () => {
  const html = await readFile(new URL('../../src/browser/index.html', import.meta.url), 'utf8');
  const controls = html.indexOf('<section id="controls"'), end = html.indexOf('</section>', controls), firstVideo = html.indexOf('<video');
  assert.ok(controls > 0 && end < firstVideo);
  for (const id of ['send-microphone', 'send-camera', 'send-screen', 'leave']) assert.ok(html.indexOf(`id="${id}"`) > controls && html.indexOf(`id="${id}"`) < end);
  assert.match(html, /#controls\s*\{[^}]*position:\s*sticky;[^}]*max-height:\s*60vh;[^}]*overflow:\s*auto/s);
});
test('arming reveals/focuses trusted controls without capture/activation; source labels distinguish pending from sending', async () => {
  const f = await fixture();
  f.command({ type: 'send', kind: 'camera', enabled: false, requestId: 1 });
  let sources = f.latestSources();
  assert.equal(sources.find(source => source.id === 'self')!.label, 'Your camera · off · NOT SENDING');
  assert.equal(sources.find(source => source.id === 'presenting')!.label, 'Your screen · off · NOT SENDING');
  for (const [index, kind] of (['microphone', 'camera', 'screen'] as const).entries()) {
    f.command({ type: 'send', kind, enabled: true, requestId: index + 2 });
    assert.deepEqual(f.log.slice(-2), [`reveal:send-${kind}`, `focus:send-${kind}`]);
    assert.equal(f.acquired.length, 0); assert.equal(f.published.length, 0);
    f.get(`send-${kind}`).click(); // scripted, untrusted DOM click
    assert.equal(f.acquired.length, 0);
  }
  assert.ok(!f.log.some(item => item.startsWith('click:') && !item.startsWith('click:send-')));
  sources = f.latestSources();
  assert.match(sources.find(source => source.id === 'self')!.label, /confirmation pending · NOT SENDING$/);
  assert.match(sources.find(source => source.id === 'presenting')!.label, /confirmation pending · NOT SENDING$/);
  f.get('send-camera').onclick!({ isTrusted: true }); await flush();
  assert.deepEqual(f.acquired, ['camera']); assert.deepEqual(f.published, ['camera']);
  assert.match(f.latestSources().find(source => source.id === 'self')!.label, /starting · NOT YET SENDING$/);
  f.permitPublish(); await flush();
  assert.equal(f.latestSources().find(source => source.id === 'self')!.label, 'Your camera · SENDING TO MEETING');
  // The stop click must stop local tracks immediately, without an owner round trip.
  f.get('send-camera').onclick!({ isTrusted: true });
  assert.equal(f.streams[0]!.tracks[0]!.readyState, 'ended');
  assert.equal(f.latestSources().find(source => source.id === 'self')!.available, false);
  assert.match(f.latestSources().find(source => source.id === 'self')!.label, /off · NOT SENDING$/);
  assert.ok(f.events.filter(event => event.type === 'sources').every(event => event.sources.every(source =>
    source.available || !/^(Your camera|Your screen) · (SENDING|SHARING) TO MEETING$/.test(source.label))), 'even intermediate cleanup snapshots must not label an inactive source as sending');
  assert.equal(f.deviceCalls(), 0);
});
test('browser stop closes all local streams before a stuck SDK stop and reports bounded completion', async t => {
  await bundle; t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture();
  f.command({ type: 'send', kind: 'screen', enabled: true, requestId: 1 });
  f.get('send-screen').onclick!({ isTrusted: true }); await flush(); f.permitPublish(); await flush();
  f.get('leave').onclick!({ isTrusted: true });
  assert.equal(f.streams[0]!.tracks[0]!.readyState, 'ended'); assert.equal(f.sessionStops(), 1);
  t.mock.timers.tick(2500); await flush();
  assert.ok(f.events.some(event => event.type === 'left'));
  f.get('send-screen').onclick!({ isTrusted: true }); await flush(); assert.equal(f.acquired.length, 1);
  assert.equal(f.deviceCalls(), 0);
});
