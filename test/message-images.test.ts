import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { MessageImages, IMAGE_LIMITS, imagePixels, imagePreview, webexAttachment } from '../src/message-images.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import type { ChatMessage } from '../src/chat-protocol.js';

const url = 'https://webexapis.com/v1/contents/LOCAL-ONLY';
const id = 'a'.repeat(64), rgb = Buffer.alloc(240 * 144 * 3, 255);
rgb.fill(0, 0, rgb.length / 2);
const preview = imagePreview(id, rgb), png = Buffer.from(preview.png!, 'base64');
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
test('attachment URLs admit only exact authenticated Webex content endpoints, never Markdown/external URLs', () => {
  assert.equal(webexAttachment(url), url);
  for (const value of [null, 'https://example.com/p.png', 'https://webexapis.com.evil/v1/contents/id', 'http://webexapis.com/v1/contents/id',
    'https://token@webexapis.com/v1/contents/id', url + '?token=x', url + '#fragment', url + '/extra', url + '\n', 'file:///etc/passwd',
    'https://webexapis.com/v1/contents/%2e%2e', 'https://webexapis.com/v1/people/me']) assert.equal(webexAttachment(value), undefined);
});
test('Unicode previews are actual braille pixels and PNGs are normalized memory-only rasters', () => {
  assert.equal(preview.lines!.length, 12); assert.ok(preview.lines!.every(line => [...line].length === 40));
  assert.equal(preview.lines![0], '⣿'.repeat(40)); assert.equal(preview.lines!.at(-1), '⠀'.repeat(40));
  assert.equal(png.readUInt32BE(16), 240); assert.equal(png.readUInt32BE(20), 144);
  assert.ok(png.length < 112_500); assert.ok(!JSON.stringify(preview).includes(url));
});
test('image metadata is inert; explicit bounded GET uses private auth, caches results and never follows redirects', async () => {
  let fetches = 0, conversions = 0;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async (target, options) => {
    fetches++; assert.equal(target, url); assert.equal(options!.redirect, 'error');
    assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer PRIVATE-TOKEN');
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  }, async (_bytes, format) => { conversions++; assert.equal(format, 'png'); return rgb; });
  try {
    const refs = images.register([url, url, 'https://evil/image.png']); assert.equal(refs.length, 1); assert.equal(fetches, 0);
    assert.equal(refs[0]!.state, 'pending'); assert.ok(!JSON.stringify(refs).includes('https'));
    const result = await images.load(refs.map(ref => ref.id), new AbortController().signal);
    assert.equal(result[0]!.state, 'ready'); assert.equal(fetches, 1); assert.equal(conversions, 1);
    assert.deepEqual(images.register([url]), result);
    await images.load(refs.map(ref => ref.id), new AbortController().signal); assert.equal(fetches, 1);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  } finally { images.close(); }
});
test('unsupported media, redirects, bad raster signatures and oversized downloads fail closed without conversion or provider text', async () => {
  for (const [body, status, headers] of [
    ['PRIVATE SVG', 200, { 'content-type': 'image/svg+xml' }], [png, 302, { location: 'https://evil/PRIVATE' }],
    ['PRIVATE not a PNG', 200, { 'content-type': 'image/png' }], [png, 200, { 'content-type': 'image/png', 'content-length': String(IMAGE_LIMITS.bytes + 1) }],
  ] as const) {
    const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => new Response(body, { status, headers }), async () => assert.fail('No conversion permitted.'));
    try {
      const refs = images.register([url]), result = await images.load(refs.map(ref => ref.id), new AbortController().signal);
      assert.notEqual(result[0]!.state, 'ready'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    } finally { images.close(); }
  }
});
test('ignored transport deadline releases the caller but retains native admission; late data cannot publish', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred<Response>(); let fetches = 0;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => { fetches++; return gate.promise; }, async () => assert.fail('Expired conversion.'));
  const refs = images.register([url]), keys = refs.map(ref => ref.id), signal = new AbortController().signal;
  const pending = images.load(keys, signal); const rejected = assert.rejects(pending);
  t.mock.timers.tick(10_000); await rejected;
  await assert.rejects(images.load(keys, signal)); assert.equal(fetches, 1);
  gate.resolve(new Response(png, { headers: { 'content-type': 'image/png' } }));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.notEqual(images.register([url])[0]!.state, 'ready'); images.close();
});
test('public API projects image references only from valid room-bound messages and never downloads during history', async () => {
  let fetches = 0;
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async () => { fetches++; return new Response(JSON.stringify({ items: [
    { id: 'm', roomId: 'room', text: 'Original', files: [url] }, { id: 'foreign', roomId: 'elsewhere', files: [url] },
    { id: 'external', roomId: 'room', files: ['https://evil/image.png'] },
  ] })); });
  try {
    const page = await api.history('room'); assert.equal(fetches, 1); assert.equal(page.items.length, 2);
    assert.equal(page.items[0]!.images![0]!.state, 'pending'); assert.equal(page.items[1]!.images, undefined);
    assert.ok(!JSON.stringify(page).includes(url));
  } finally { api.close(); }
});
test('same-space re-entry preserves loaded anchors, pagination and pending requests; only explicit reload resets history', async () => {
  let reads = 0, aborted = false;
  const gate = deferred<{ items: ChatMessage[]; next: string }>();
  const store = new MessagingStore({ rooms: async () => ({ items: [{ id: 'room', title: 'Room', type: 'group', lastActivity: '' }] }),
    history: async (_room, _cursor, signal) => { reads++; signal?.addEventListener('abort', () => { aborted = true; }); return gate.promise; },
    send: async () => assert.fail('No posts.'), close() {} }, 0);
  try {
    await store.loadRooms(); const pending = store.select('room'); await store.select('room');
    assert.equal(reads, 1); assert.equal(aborted, false); assert.equal(store.loading, true);
    gate.resolve({ items: [{ id: 'message', author: 'Local', created: '', text: 'Kept' }], next: 'older' }); await pending;
    const retained = store.messages; await store.select('room'); assert.equal(store.messages, retained); assert.equal(reads, 1); assert.equal(store.moreHistory, true);
    await store.select('room', true); assert.equal(reads, 2);
  } finally { store.close(); }
});
test('image results are bound to loaded selected messages and cannot change a later destination or send receipts/posts', async () => {
  const gate = deferred<ReturnType<typeof imagePreview>[]>(); let requests = 0;
  const store = new MessagingStore({ rooms: async () => ({ items: ['a', 'b'].map(id => ({ id, title: id, type: 'group', lastActivity: '' })) }),
    history: async () => ({ items: [{ id: 'message', author: 'Local', created: '', text: 'Body', images: [{ id, state: 'pending' }] }] }),
    previews: async () => { requests++; return gate.promise; }, send: async () => assert.fail('No posts.'), close() {} }, 0);
  try {
    await store.loadRooms(); await store.select('a'); await store.loadImages('b', 'message'); await store.loadImages('a', 'unknown'); assert.equal(requests, 0);
    const pending = store.loadImages('a', 'message'); await store.loadImages('a', 'message'); assert.equal(requests, 1);
    await store.select('b'); gate.resolve([preview]); await pending;
    assert.equal(store.messages[0]!.images![0]!.state, 'pending');
  } finally { store.close(); }
});
test('installed raster converter produces a bounded first-frame raster using local PNG stdin only', async t => {
  if (spawnSync('convert', ['-version'], { stdio: 'ignore' }).status !== 0 && spawnSync('magick', ['-version'], { stdio: 'ignore' }).status !== 0) { t.skip('No optional raster converter installed.'); return; }
  const result = await imagePixels(png, 'png', new AbortController().signal);
  assert.equal(result.length, rgb.length); assert.ok(result.equals(rgb));
  await assert.rejects(imagePixels(png, 'svg', new AbortController().signal));
});

test('raster/reference caches stay bounded while evictions remain explicitly pending, never guessed pixels', async () => {
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => new Response(png, { headers: { 'content-type': 'image/png' } }), async () => rgb);
  try {
    const first = images.register([url])[0]!;
    for (let i = 0; i < 20; i++) {
      const refs = images.register([url + '-' + i]); await images.load(refs.map(image => image.id), new AbortController().signal);
    }
    const internal = images as unknown as { entries: Map<string, { value: { state: string } }> };
    assert.equal([...internal.entries.values()].filter(entry => entry.value.state === 'ready').length, 16);
    assert.equal(images.register([url])[0]!.state, first.state);
    for (let i = 0; i < 1100; i++) images.register([url + '-bound-' + i]);
    assert.equal(internal.entries.size, IMAGE_LIMITS.references);
    await assert.rejects(images.load([id], AbortSignal.abort()));
  } finally { images.close(); }
});

test('selected-history image budget cannot grow on polling or repeated image RPCs', async () => {
  let reads = 0;
  const messages: ChatMessage[] = Array.from({ length: 17 }, (_, i) => ({ id: 'message-' + i, author: 'Local', created: '', text: 'Body',
    images: [{ id: i.toString(16).padStart(64, '0'), state: 'pending' }] }));
  const store = new MessagingStore({ rooms: async () => ({ items: [{ id: 'room', title: 'Room', type: 'group', lastActivity: '' }] }),
    history: async () => ({ items: messages }), previews: async ids => { reads++; return ids.map(id => ({ ...preview, id })); },
    send: async () => assert.fail('No posts.'), close() {} }, 0);
  try {
    await store.loadRooms(); await store.select('room');
    for (const message of messages) await store.loadImages('room', message.id);
    assert.equal(reads, 16); assert.equal(store.messages.find(message => message.id === 'message-16')!.images![0]!.state, 'unavailable');
    await store.refresh();
    for (const message of messages) await store.loadImages('room', message.id);
    assert.equal(reads, 16, 'polling cannot reset attempts, normalized previews or the admission budget');
    assert.equal(store.messages.filter(message => message.images![0]!.state === 'ready').length, 16);
  } finally { store.close(); }
});

test('forged short lengths cannot bypass streamed byte bounds or reach the decoder', async () => {
  let canceled = false;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(IMAGE_LIMITS.bytes + 1)); }, cancel() { canceled = true; },
  }), { headers: { 'content-type': 'image/png', 'content-length': '1' } }), async () => assert.fail('Oversized image decoder admission.'));
  try {
    const refs = images.register([url]); const result = await images.load(refs.map(image => image.id), new AbortController().signal);
    assert.equal(result[0]!.state, 'unavailable'); assert.equal(canceled, true);
  } finally { images.close(); }
});

test('stalled body cleanup retains admission after the caller deadline and cannot start replacements', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cleanup = deferred<void>(); let reads = 0;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => {
    reads++; return new Response(new ReadableStream({ cancel() { return cleanup.promise; } }), { headers: { 'content-type': 'image/png' } });
  }, async () => assert.fail('No complete raster.'));
  const ids = images.register([url]).map(image => image.id), signal = new AbortController().signal;
  const pending = images.load(ids, signal), rejected = assert.rejects(pending);
  await new Promise<void>(resolve => setImmediate(resolve));
  t.mock.timers.tick(10_000); await rejected;
  await assert.rejects(images.load(ids, signal)); assert.equal(reads, 1);
  cleanup.resolve(); images.close();
});
