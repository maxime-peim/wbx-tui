import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { MessageImages, imagePreview } from '../src/message-images.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { serializeEditorOutput } from '../src/editor-output.js';
import { detailedPNG } from './image-fixture.js';
import type { AttachmentResolveOptions } from '../src/attachment-policy.js';
import { readFile } from 'node:fs/promises';

const url = 'https://webexapis.com/v1/contents/TYPED-';
const original = detailedPNG(120, 80).png, signal = () => new AbortController().signal;
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const open = { action: 'open' as const, selectors: [] as { key: string; use: 'native' | 'original' }[] };
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(check(), 'bounded local operation reached its controlled native boundary');
}
async function fixture(options: { name?: string; mime?: string; bytes?: Buffer; status?: number; headers?: Record<string, string> } = {}) {
  const calls: string[] = [], rasters: Buffer[] = [], pixels: Buffer[] = [];
  const bytes = options.bytes ?? original;
  const fetcher: typeof fetch = async (target, init) => {
    assert.equal(init?.redirect, 'error'); assert.notEqual(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer PRIVATE-TOKEN');
    const path = new URL(String(target)).pathname; calls.push(path);
    if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room', title: 'Local', type: 'group' }] }));
    if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'message', roomId: 'room', files: Array.from({ length: 10 }, (_, i) => url + i) }] }));
    return new Response(new Uint8Array(bytes), { status: options.status ?? 200, headers: { 'content-type': options.mime ?? 'image/png',
      'content-disposition': `attachment; filename="${options.name ?? 'Picture.PNG'}"`, ...options.headers } });
  };
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', fetcher);
  // Same real image path; only the CPU converter is replaced to isolate byte/GET work.
  const images = (api as any).images as MessageImages;
  Object.assign(images, { raster: async (value: Buffer) => { rasters.push(value); return original; },
    pixels: async (value: Buffer) => { pixels.push(value); return Buffer.alloc(240 * 144 * 3); } });
  const store = new MessagingStore(api, 0); await store.loadRooms(); await store.select('room');
  return { api, store, calls, rasters, pixels, id: store.messages[0]!.attachments![9]!.id,
    resolve(id: string, options: AttachmentResolveOptions = open, parent = signal()) { return api.resolveAttachment(id, options, parent); } };
}

test('typed explicit open reuses one original GET for unpreviewed attachment ten and unrelated handlers', async () => {
  const f = await fixture();
  try {
    for (const selectors of [[], [{ key: '.pdf', use: 'original' as const }]]) {
      const start = f.calls.length, value = await f.resolve(f.id, { ...open, selectors });
      assert.equal(f.calls.length - start, 1); assert.equal(value.body.kind, 'png');
      assert.deepEqual(f.rasters.at(-1), original); assert.equal(f.rasters.at(-1), f.pixels.at(-1));
      assert.equal(value.meta.sourceBytes, original.length); assert.equal(value.body.decodedBytes, original.length);
      assert.ok(!JSON.stringify(value).includes('PRIVATE') && !JSON.stringify(value).includes('https'));
    }
    assert.equal(f.store.messages[0]!.images!.length, 4);
  } finally { f.store.close(); }
});
test('typed selection preserves extension precedence and empty-extension suppression without converting originals', async () => {
  const f = await fixture();
  try {
    const result = await f.resolve(f.id, { ...open, selectors: [{ key: '.png', use: 'original' }, { key: 'image/png', use: 'native' }] });
    assert.equal(result.body.kind, 'original'); assert.equal(result.body.payload.data, original.toString('base64')); assert.equal(f.rasters.length, 0);
    const native = await f.resolve(f.id, { ...open, selectors: [{ key: '.png', use: 'native' }, { key: 'image/png', use: 'original' }] });
    assert.equal(native.body.kind, 'png'); assert.equal(f.rasters.length, 1);
    const download = await f.resolve(f.id, { action: 'download', selectors: [] });
    assert.equal(download.body.kind, 'original'); assert.equal(f.rasters.length, 1);
  } finally { f.store.close(); }
});
test('typed parser admits only a bounded selector policy and explicit identity/action, never paths, argv or credentials', () => {
  const params = { roomId: 'room', messageId: 'message', attachmentId: 'a'.repeat(64), ...open };
  const parse = (p: Record<string, unknown>, method = 'messages.attachmentResolve') => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params: p });
  assert.equal(parse(params).method, 'messages.attachmentResolve');
  for (const invalid of [{ ...params, url }, { ...params, argv: ['tool'] }, { ...params, path: '/private' }, { ...params, token: 'PRIVATE' },
    { ...params, action: 'preview' }, { ...params, attachmentId: url }, { ...params, selectors: [{ key: '.PNG', use: 'original' }] },
    { ...params, selectors: [{ key: '.png', use: 'original', argv: [] }] },
    { ...params, selectors: [{ key: '.png', use: 'native' }, { key: '.png', use: 'original' }] },
    { ...params, selectors: Array.from({ length: 129 }, (_, i) => ({ key: '.' + i, use: 'original' })) },
    { ...params, action: 'download', selectors: [{ key: '.png', use: 'original' }] }]) assert.throws(() => parse(invalid));
  assert.equal(parse({ requestId: 1 }, 'messages.attachmentCancel').method, 'messages.attachmentCancel');
  for (const requestId of [0, -1, 1.5, '1', 2147483648]) assert.throws(() => parse({ requestId }, 'messages.attachmentCancel'));
});
test('typed raster source retains 8 MiB while original-byte routes retain 6 MB; returned event remains bounded', async () => {
  for (const size of [5_999_999, 6_000_000, 6_000_001, 8_388_607, 8_388_608, 8_388_609]) {
    const bytes = Buffer.concat([original, Buffer.alloc(size - original.length)]);
    const f = await fixture({ bytes });
    try {
      if (size <= 8_388_608) assert.equal((await f.resolve(f.id)).body.kind, 'png'); else await assert.rejects(f.resolve(f.id));
      for (const options of [{ action: 'download' as const, selectors: [] }, { ...open, selectors: [{ key: '.png', use: 'original' as const }] }]) {
        if (size <= 6_000_000) assert.ok(serializeEditorOutput({ jsonrpc: '2.0', id: 1, result: await f.resolve(f.id, options) }));
        else await assert.rejects(f.resolve(f.id, options));
      }
    } finally { f.store.close(); }
  }
});
test('typed reads require exact HTTP 200, bounded lengths, matching raster signature and no arbitrary MIME decoding', async () => {
  for (const options of [{ status: 206 }, { status: 302 }, { status: 403 }, { headers: { 'content-length': '-1' } },
    { headers: { 'content-length': 'PRIVATE' } }, { headers: { 'content-length': '8388609' } }, { bytes: Buffer.from('Not PNG') }]) {
    const f = await fixture(options);
    try { await assert.rejects(f.resolve(f.id)); assert.equal(f.calls.length, 3); assert.equal(f.rasters.length, 0); } finally { f.store.close(); }
  }
  for (const mime of ['image/svg+xml', 'application/pdf', 'application/octet-stream']) {
    const f = await fixture({ mime });
    try { assert.equal((await f.resolve(f.id)).body.kind, 'original'); assert.equal(f.rasters.length, 0); } finally { f.store.close(); }
  }
});
test('typed RPC is capability-gated, one-shot and cancels the exact pending request without replay', async () => {
  const f = await fixture(), engine = new EditorEngine(), output: any[] = [];
  Object.assign(engine, { store: f.store, state: 'ready' });
  const rpc = new EditorRPC(engine, new EditorMeetings(), value => output.push(value));
  const wire = (id: number, method: string, params: object) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const params = { roomId: 'room', messageId: 'message', attachmentId: f.id, ...open };
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 })); assert.ok(output.at(-1).result.capabilities.includes('attachment-typed-open-v1'));
    await rpc.receive(wire(2, 'messages.attachmentResolve', params)); assert.equal(output.at(-1).result.body.kind, 'png');
    await rpc.receive(wire(2, 'messages.attachmentResolve', params)); assert.equal(output.at(-1).error.code, -32002); assert.equal(f.rasters.length, 1);
    assert.ok(!JSON.stringify([...(rpc as any).completed]).includes(original.toString('base64')));
    assert.ok(!JSON.stringify(engine.snapshot()).includes(original.toString('base64')));
    const gate = deferred<any>(); let aborted: AbortSignal | undefined;
    (f.api as any).resolveAttachment = async (_id: string, _options: unknown, parent: AbortSignal) => { aborted = parent; return gate.promise; };
    const pending = rpc.receive(wire(3, 'messages.attachmentResolve', params));
    await rpc.receive(wire(4, 'messages.attachmentCancel', { requestId: 3 })); assert.equal(aborted?.aborted, true);
    gate.resolve({ meta: { id: f.id } }); await pending;
    assert.ok(output.find(v => v.id === 3).error); assert.equal(f.rasters.length, 1);
  } finally { await rpc.close(); }
});

test('extension keys match shared native cases rather than Node path.extname assumptions', async () => {
  const { attachmentExtension, attachmentSelectorKey } = await import('../src/attachment-policy.js');
  const cases = JSON.parse(await readFile(new URL('./attachment-policy-cases.json', import.meta.url), 'utf8'));
  for (const { name, key } of cases) { assert.equal(attachmentExtension(name), key); assert.ok(attachmentSelectorKey(key)); }
});
test('preview contention rejects typed open before GET but permits an original-only download', async () => {
  const f = await fixture(), gate = deferred<Buffer>(); let entered = false;
  Object.assign((f.api as any).images, { pixels: async () => { entered = true; return gate.promise; } });
  try {
    const preview = f.api.previews([f.store.messages[0]!.images![0]!.id], signal());
    await until(() => entered); const before = f.calls.length;
    await assert.rejects(f.resolve(f.id)); assert.equal(f.calls.length, before, 'no generic probe to discover known contention');
    assert.equal((await f.resolve(f.id, { action: 'download', selectors: [] })).body.kind, 'original');
    assert.equal(f.calls.length, before + 1);
    gate.resolve(Buffer.alloc(240 * 144 * 3)); await preview;
  } finally { gate.resolve(Buffer.alloc(240 * 144 * 3)); f.store.close(); }
});
test('timeout and account/API replacement retain worker-native admission until ignored fetch settles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred<Response>(); let reads = 0;
  const first = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async () => { reads++; return gate.promise; });
  const id = (first as any).attachments.register([url + 'a'])[0].id;
  const admission = (first as any).attachments.admission;
  const second = new WebexMessagingAPI(() => 'OTHER-TOKEN', async () => { reads++; return new Response('hello'); }, 12_000, admission);
  (second as any).attachments.register([url + 'a']);
  try {
    const pending = first.resolveAttachment(id, open, signal()), rejected = assert.rejects(pending);
    t.mock.timers.tick(30_000); await rejected; first.close();
    await assert.rejects(second.resolveAttachment(id, open, signal()));
    await assert.rejects(second.openAttachment(id, signal())); assert.equal(reads, 1);
    gate.resolve(new Response('late PRIVATE')); await until(() => !(first as any).attachments.busy);
    assert.equal((await second.resolveAttachment(id, { action: 'download', selectors: [] }, signal())).body.kind, 'original');
    assert.equal(reads, 2);
  } finally { gate.resolve(new Response('late')); first.close(); second.close(); }
});
test('native image deadline is measured from GET, not metadata arrival; cleanup still owns admission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0, entered = false; t.mock.method(performance, 'now', () => clock);
  const gate = deferred<Buffer>(), f = await fixture();
  Object.assign((f.api as any).images, { raster: async () => { entered = true; return gate.promise; } });
  // The registered content fetch spends 9 seconds obtaining metadata.
  const originalFetcher = (f.api as any).attachments.fetcher;
  (f.api as any).attachments.fetcher = async (...args: unknown[]) => { clock = 9000; t.mock.timers.tick(9000); return originalFetcher(...args); };
  try {
    const pending = f.resolve(f.id), rejected = assert.rejects(pending);
    await until(() => entered); clock = 10_000; t.mock.timers.tick(1000); await rejected;
    const before = f.calls.length; await assert.rejects(f.resolve(f.id)); assert.equal(f.calls.length, before);
    gate.resolve(original); await until(() => !(f.api as any).attachments.busy);
  } finally { gate.resolve(original); f.store.close(); }
});
test('late raster headers already outside the native budget never reach a converter', async t => {
  let clock = 0; t.mock.method(performance, 'now', () => clock);
  const f = await fixture(), fetcher = (f.api as any).attachments.fetcher;
  (f.api as any).attachments.fetcher = async (...args: unknown[]) => { clock = 10_001; return fetcher(...args); };
  try { await assert.rejects(f.resolve(f.id)); assert.equal(f.rasters.length, 0); } finally { f.store.close(); }
});
test('typed stream cap/chunk cap and stalled cancellation remain bounded without decoder or replacement admission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cleanup = deferred<void>(); let reads = 0, canceled = 0;
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async () => {
    reads++; return new Response(new ReadableStream({ cancel() { canceled++; return cleanup.promise; } }), { headers: { 'content-type': 'image/png' } });
  });
  const id = (api as any).attachments.register([url + 'stall'])[0].id;
  try {
    const pending = api.resolveAttachment(id, open, signal()), rejected = assert.rejects(pending);
    await until(() => reads === 1); await new Promise<void>(resolve => setImmediate(resolve));
    t.mock.timers.tick(10_000); await rejected;
    await assert.rejects(api.openAttachment(id, signal())); assert.equal(reads, 1); assert.equal(canceled, 1);
    cleanup.resolve(); await until(() => !(api as any).attachments.busy);
  } finally { cleanup.resolve(); api.close(); }
  for (const overflow of ['bytes', 'chunks']) {
    let chunks = 0;
    const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async () => new Response(new ReadableStream({
      pull(controller) {
        if (overflow === 'bytes') { controller.enqueue(new Uint8Array(6_000_001)); controller.close(); }
        else if (chunks++ < 8193) controller.enqueue(new Uint8Array(1)); else controller.close();
      },
    }), { headers: { 'content-length': '1' } }));
    const id = (api as any).attachments.register([url + overflow])[0].id;
    try { await assert.rejects(api.resolveAttachment(id, { action: 'download', selectors: [] }, signal())); } finally { api.close(); }
  }
});
test('normalized output bounds and signature are independent of input limits', async () => {
  for (const invalid of [Buffer.alloc(44), Buffer.alloc(6_000_001), Buffer.from('not a PNG'.repeat(10))]) {
    const f = await fixture(); Object.assign((f.api as any).images, { raster: async () => invalid });
    try { await assert.rejects(f.resolve(f.id)); assert.equal(f.calls.length, 3); } finally { f.store.close(); }
  }
});
test('typed HTTP 200 tightening does not silently change legacy image response.ok behavior', async () => {
  const f = await fixture({ status: 206 });
  try {
    await assert.rejects(f.resolve(f.id));
    assert.equal((await f.api.openImage(f.id, signal())).id, f.id);
    assert.equal(f.calls.length, 4);
  } finally { f.store.close(); }
});
for (const action of ['reload', 'stop', 'remove', 'parent-cancel'] as const) test(`typed destination ${action} cannot publish ignored late results`, async () => {
  const f = await fixture(), gate = deferred<any>(), parent = new AbortController(); let abort: AbortSignal | undefined;
  const value = await f.resolve(f.id);
  f.api.resolveAttachment = async (_id, _options, signal) => { abort = signal; return gate.promise; };
  try {
    const pending = f.store.resolveAttachment('room', 'message', f.id, open, parent.signal), rejected = assert.rejects(pending);
    if (action === 'reload') await f.store.select('room', true);
    if (action === 'stop') f.store.close();
    if (action === 'remove') f.store.messages = [];
    if (action === 'parent-cancel') parent.abort();
    if (action !== 'remove') assert.equal(abort?.aborted, true);
    gate.resolve(value); await rejected;
  } finally { gate.resolve(value); f.store.close(); }
});
test('typed grant loss aborts pending work and blocks new content admission without SDK/identity/reconnect', async () => {
  const f = await fixture(), engine = new EditorEngine(), gate = deferred<any>();
  const value = await f.resolve(f.id); let abort: AbortSignal | undefined;
  f.api.resolveAttachment = async (_id, _options, parent) => { abort = parent; return gate.promise; };
  Object.assign(engine, { store: f.store, state: 'ready', mode: 'live', grantedScope: 'spark:messages_read',
    oauth: { async refresh() { return { token: 'NEW-TOKEN', scope: 'spark:rooms_read', expiresAt: Date.now() + 3600_000 }; }, watch() {}, close() {} } });
  try {
    const pending = engine.resolveAttachment(3, 'room', 'message', f.id, open), rejected = assert.rejects(pending);
    await engine.refreshAuth(); assert.equal(abort?.aborted, true);
    gate.resolve(value); await rejected;
    await assert.rejects(engine.resolveAttachment(4, 'room', 'message', f.id, open));
  } finally { gate.resolve(value); engine.stop(); }
});
