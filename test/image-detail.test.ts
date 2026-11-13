import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { MessageImages, imageRaster, imagePreview, OPEN_IMAGE_LIMITS, IMAGE_LIMITS, type OpenedImage } from '../src/message-images.js';
import { detailedPNG } from './image-fixture.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { serializeEditorOutput } from '../src/editor-output.js';

const source = detailedPNG(), url = 'https://webexapis.com/v1/contents/LOCAL-DETAIL';
const thumbnail = imagePreview('a'.repeat(64), Buffer.alloc(240 * 144 * 3, 128));
const opened = { ...thumbnail, png: source.png.toString('base64'), width: 960, height: 600 } as OpenedImage;
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
test('real converter retains original high-frequency pixels, fits large images and never upscales small ones', async t => {
  const program = ['magick', 'convert'].find(name => spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0);
  if (!program) { t.skip('No optional raster converter installed.'); return; }
  for (const [width, height, expectedWidth, expectedHeight] of [[960, 600, 960, 600], [120, 80, 120, 80], [3200, 1800, 1600, 900]]) {
    const original = detailedPNG(width, height), png = await imageRaster(original.png, 'png', new AbortController().signal);
    assert.equal(png.readUInt32BE(16), expectedWidth); assert.equal(png.readUInt32BE(20), expectedHeight);
    assert.ok(png.length <= OPEN_IMAGE_LIMITS.bytes);
    if (width === expectedWidth) {
      const decoded: ReturnType<typeof spawnSync> = spawnSync(program, ['png:-', '-depth', '8', 'rgb:-'], { input: png, maxBuffer: 8_000_000 });
      assert.equal(decoded.status, 0); assert.deepEqual(decoded.stdout, original.rgb, 'single-pixel detail must survive, not be reconstructed from the thumbnail');
    }
  }
  await assert.rejects(imageRaster(source.png, 'svg', new AbortController().signal));
});
test('explicit opening authenticates the original registered attachment independently of the inline cache', async () => {
  let reads = 0, rasters = 0;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async (target, options) => {
    reads++; assert.equal(target, url); assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer PRIVATE-TOKEN');
    return new Response(new Uint8Array(source.png), { headers: { 'content-type': 'image/png' } });
  }, async () => Buffer.alloc(240 * 144 * 3, 128), async bytes => { rasters++; assert.deepEqual(bytes, source.png); return bytes; });
  try {
    const [reference] = images.register([url]);
    await assert.rejects(images.open('https://evil/image', new AbortController().signal)); assert.equal(reads, 0);
    await images.load([reference!.id], new AbortController().signal);
    const previews = images.register([url]), image = await images.open(reference!.id, new AbortController().signal);
    assert.equal(image.width, 960); assert.equal(image.height, 600); assert.equal(image.png, source.png.toString('base64'));
    assert.equal(reads, 2); assert.equal(rasters, 1); assert.deepEqual(images.register([url]), previews, 'large images never enter inline state/cache');
    assert.ok(!JSON.stringify(image).includes('PRIVATE') && !JSON.stringify(image).includes('https://'));
  } finally { images.close(); }
});
test('explicit original reads reject redirects, unsupported media, forged signatures and oversize bodies before decoding', async () => {
  for (const response of [
    () => new Response('PRIVATE', { status: 302, headers: { location: 'https://evil/private' } }),
    () => new Response('PRIVATE', { headers: { 'content-type': 'image/svg+xml' } }),
    () => new Response('PRIVATE', { headers: { 'content-type': 'image/png' } }),
    () => new Response(new Uint8Array(source.png), { headers: { 'content-type': 'image/png', 'content-length': String(IMAGE_LIMITS.bytes + 1) } }),
    () => new Response(new Uint8Array(IMAGE_LIMITS.bytes + 1), { headers: { 'content-type': 'image/png', 'content-length': '1' } }),
  ]) {
    const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => response(), async () => assert.fail('No preview decoder'), async () => assert.fail('No full decoder'));
    try {
      const [ref] = images.register([url]);
      await assert.rejects(images.open(ref!.id, new AbortController().signal), error => !String(error).includes('PRIVATE'));
    } finally { images.close(); }
  }
});
test('a timed-out original read retains shared native admission and cannot publish late', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred<Response>(); let reads = 0;
  const images = new MessageImages(() => 'PRIVATE-TOKEN', async () => { reads++; return gate.promise; }, async () => assert.fail('Late preview decode'), async () => assert.fail('Late full decode'));
  const id = images.register([url])[0]!.id, signal = new AbortController().signal;
  const pending = images.open(id, signal), rejected = assert.rejects(pending);
  t.mock.timers.tick(10_000); await rejected;
  await assert.rejects(images.open(id, signal)); await assert.rejects(images.load([id], signal)); assert.equal(reads, 1);
  gate.resolve(new Response(new Uint8Array(source.png), { headers: { 'content-type': 'image/png' } }));
  await new Promise<void>(done => setImmediate(done)); images.close();
});
test('selected identity/epoch guards cancel late originals without changing history or posting', async () => {
  const gate = deferred<OpenedImage>(); let reads = 0, signal: AbortSignal | undefined;
  const store = new MessagingStore({ rooms: async () => ({ items: ['a', 'b'].map(id => ({ id, title: id, type: 'group' as const, lastActivity: '' })) }),
    history: async () => ({ items: [{ id: 'm', author: 'Local', created: '', text: 'Body', images: [thumbnail] }] }),
    openImage: async (_id, abort) => { reads++; signal = abort; return gate.promise; }, send: async () => assert.fail('No posts.'), close() {} }, 0);
  try {
    await store.loadRooms(); await store.select('a');
    for (const args of [['b', 'm', thumbnail.id], ['a', 'foreign', thumbnail.id], ['a', 'm', 'b'.repeat(64)]]) await assert.rejects(store.openImage(...args as [string, string, string]));
    assert.equal(reads, 0);
    const pending = store.openImage('a', 'm', thumbnail.id), rejected = assert.rejects(pending);
    await assert.rejects(store.openImage('a', 'm', thumbnail.id)); assert.equal(reads, 1);
    await store.select('b'); assert.equal(signal?.aborted, true);
    const history = store.messages; gate.resolve(opened); await rejected; assert.equal(store.messages, history);
  } finally { store.close(); }
});
test('image RPC admits identities only, is explicit and retains no large replay payload', async t => {
  const params = { roomId: 'room', messageId: 'm', imageId: thumbnail.id };
  for (const invalid of [{ ...params, url }, { ...params, token: 'PRIVATE' }, { ...params, imageId: url }, { ...params, roomId: '' }]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.imageOpen', params: invalid }));
  }
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [];
  let reads = 0;
  t.mock.method(engine, 'openImage', async () => { reads++; return opened; });
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  const wire = (id: number, method: string, params: object) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 })); assert.ok(output.at(-1).result.capabilities.includes('image-opening'));
    const request = wire(2, 'messages.imageOpen', params);
    await rpc.receive(request); assert.equal(output.at(-1).result, opened);
    await rpc.receive(request); assert.equal(output.at(-1).error.code, -32002); assert.equal(reads, 1);
    const completed = (rpc as unknown as { completed: Map<number, unknown> }).completed.get(2);
    assert.ok(JSON.stringify(completed).length < 1024); assert.ok(!JSON.stringify(completed).includes(opened.png));
  } finally { await rpc.close(); }
});
test('native image opening accepts a loaded generic attachment beyond the four inline previews, never arbitrary identities', async t => {
  if (!['magick', 'convert'].some(name => spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0)) { t.skip('No optional raster converter installed.'); return; }
  const files = Array.from({ length: 7 }, (_, i) => url + '-' + i), reads: string[] = [];
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async (target, options) => {
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer PRIVATE-TOKEN');
    const path = new URL(String(target)).pathname; reads.push(path);
    if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room', title: 'Room', type: 'group' }] }));
    if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'm', roomId: 'room', text: '', files }] }));
    assert.equal(String(target), files[6]);
    return new Response(new Uint8Array(source.png), { headers: { 'content-type': 'image/png' } });
  });
  const store = new MessagingStore(api, 0);
  try {
    await store.loadRooms(); await store.select('room');
    const message = store.messages[0]!, id = message.attachments![6]!.id;
    assert.equal(message.images!.length, 4); assert.equal(message.attachments!.length, 7);
    assert.ok(!message.images!.some(image => image.id === id));
    await assert.rejects(store.openImage('foreign', 'm', id));
    await assert.rejects(store.openImage('room', 'm', 'f'.repeat(64))); assert.equal(reads.length, 2);
    const opened = await store.openImage('room', 'm', id);
    assert.equal(opened.id, id); assert.equal(opened.width, 960); assert.equal(opened.height, 600);
    assert.equal(reads.length, 3); assert.ok(!JSON.stringify(opened).includes('PRIVATE'));
    assert.equal(message.images!.length, 4, 'explicit originals do not expand the inline projection or its budget');
  } finally { store.close(); }
});
test('worst-case normalized RGB result fits the existing 8 MiB event envelope', () => {
  const png = randomBytes(1600 * 1200 * 3 + 1000).toString('base64');
  const line = serializeEditorOutput({ jsonrpc: '2.0', id: 1, result: { ...opened, width: 1600, height: 1200, png } });
  assert.ok(line); assert.ok(Buffer.byteLength(line) < 8_388_608);
});
