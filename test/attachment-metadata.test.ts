import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageAttachments, type MessageAttachment } from '../src/message-attachments.js';
import { ContentAdmission } from '../src/content-admission.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';

const url = 'https://webexapis.com/v1/contents/local-file';
const signal = () => new AbortController().signal;
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const headers = { 'content-disposition': 'attachment; filename="../report.pdf"', 'content-type': 'Application/PDF; charset=binary' };

test('attachment labels use cached, sanitized HEAD headers only, never bodies or URLs in DTOs', async () => {
  const calls: RequestInit[] = [];
  let canceled = 0, pulled = 0;
  const files = new MessageAttachments(() => 'local-only-token', (async (target, options) => {
    assert.equal(target, url); calls.push(options!);
    assert.equal(options!.method, 'HEAD'); assert.equal(options!.redirect, 'error');
    return new Response(new ReadableStream({ pull() { pulled++; }, cancel() { canceled++; } }, { highWaterMark: 0 }), { headers });
  }) as typeof fetch);
  try {
    const [ref] = files.register([url]);
    const expected = [{ id: ref!.id, name: 'report.pdf', mime: 'application/pdf' }];
    assert.deepEqual(await files.describe([ref!.id], signal()), expected);
    assert.equal(pulled, 0); assert.equal(canceled, 1);
    const result = await files.describe([ref!.id], signal());
    result[0]!.name = 'caller-mutation';
    assert.deepEqual(files.register([url]), expected, 'returned labels are detached');
    assert.deepEqual(await files.describe([ref!.id], signal()), expected);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(expected), /https:|Bearer|local-only-token/);
    await assert.rejects(files.describe(['f'.repeat(64)], signal()));
    await assert.rejects(files.describe([ref!.id, ref!.id], signal()));
    await assert.rejects(files.describe(Array(11).fill(ref!.id), signal()));
  } finally { files.close(); }
});

test('HEAD refusal does not fall back to GET, follow a redirect, or continue a refused batch', async () => {
  for (const status of [302, 403, 405, 429, 500]) {
    let calls = 0;
    const files = new MessageAttachments(() => 'local-only-token', (async (_url, options) => {
      calls++; assert.equal(options!.method, 'HEAD'); assert.equal(options!.redirect, 'error');
      return new Response(null, { status });
    }) as typeof fetch);
    try {
      const refs = files.register([url, url + '-2']);
      assert.deepEqual(await files.describe(refs.map(file => file.id), signal()), refs);
      assert.equal(calls, 1);
    } finally { files.close(); }
  }
});

test('metadata cancellation retains shared physical admission through late transport cleanup', async () => {
  const admission = new ContentAdmission(), response = deferred<Response>(), cleanup = deferred<void>();
  let calls = 0, canceled = false;
  const files = new MessageAttachments(() => 'local-only-token', (async () => { calls++; return response.promise; }) as typeof fetch, admission);
  const [ref] = files.register([url]), abort = new AbortController();
  try {
    const read = files.describe([ref!.id], abort.signal);
    abort.abort();
    await assert.rejects(read);
    await assert.rejects(files.open(ref!.id, signal()));
    await assert.rejects(admission.run(true, true, async () => {}));
    response.resolve(new Response(new ReadableStream({ cancel() { canceled = true; return cleanup.promise; } }), { headers }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(canceled, true);
    await assert.rejects(admission.run(true, true, async () => {}));
    cleanup.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(files.register([url]), [ref], 'aborted late headers cannot become cached labels');
    await admission.run(true, true, async () => {});
    assert.equal(calls, 1);
  } finally { cleanup.resolve(); files.close(); }
});

for (const action of ['open', 'download'] as const) for (const boundary of ['complete', 'cancel', 'reload'])
test(`typed ${action} waits for metadata cleanup without retries (${boundary})`, async () => {
  const response = deferred<Response>(), cleanup = deferred<void>();
  let heads = 0, gets = 0, cleaning = false;
  const api = new WebexMessagingAPI(() => 'local-only-token', async (target, options) => {
    if (String(target) === url) {
      if (options?.method === 'HEAD') { heads++; return response.promise; }
      gets++;
      return new Response('hello', { headers });
    }
    return Response.json({ items: String(target).includes('/rooms')
      ? [{ id: 'room', title: 'Local', type: 'group' }]
      : [{ id: 'message', roomId: 'room', files: [url] }] });
  });
  const store = new MessagingStore(api, 0, 'demo'), engine = new EditorEngine();
  Object.assign(engine, { store, state: 'ready', mode: 'demo' });
  try {
    await store.loadRooms(); await store.select('room');
    const labels = engine.attachmentMetadata('room', 'message');
    const id = store.messages[0]!.attachments![0]!.id, options = { action, selectors: [] };
    const opening = boundary === 'reload' ? store.resolveAttachment('room', 'message', id, options, signal())
      : engine.resolveAttachment(1, 'room', 'message', id, options);
    const finished = boundary === 'complete' ? opening : assert.rejects(opening);
    if (boundary === 'cancel') engine.cancelAttachment(1);
    if (boundary === 'reload') await store.select('room', true);
    response.resolve(new Response(new ReadableStream({ cancel() { cleaning = true; return cleanup.promise; } }), { headers }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cleaning, true); assert.equal(heads, 1); assert.equal(gets, 0, 'cleanup still owns physical admission');
    cleanup.resolve();
    await labels;
    await finished;
    assert.equal(gets, boundary === 'complete' ? 1 : 0, 'canceled/reloaded work is zero-fetch; a live explicit intent fetches exactly once');
  } finally { cleanup.resolve(); store.close(); }
});

test('message API exposes no metadata to legacy reads until explicitly requested', async () => {
  const calls: string[] = [];
  const api = new WebexMessagingAPI(() => 'local-only-token', (async (_url, options) => {
    calls.push(options!.method!);
    return options!.method === 'HEAD' ? new Response(null, { headers }) : Response.json({
      items: [{ id: 'message', roomId: 'room', files: [url] }] });
  }) as typeof fetch);
  try {
    const page = await api.history('room');
    const ref = page.items[0]!.attachments![0]!;
    assert.deepEqual(Object.keys(ref), ['id']);
    assert.deepEqual(calls, ['GET']);
    const labels = await api.attachmentMetadata([ref.id], signal());
    assert.equal(labels[0]!.name, 'report.pdf');
    assert.deepEqual((await api.history('room')).items[0]!.attachments, labels);
    assert.deepEqual(calls, ['GET', 'HEAD', 'GET']);
  } finally { api.close(); }
});

test('waiting for metadata cannot rebind an explicit read after a same-room reload', async () => {
  const labels = deferred<MessageAttachment[]>(), ref = { id: 'a'.repeat(64) };
  let gets = 0;
  const store = new MessagingStore({
    rooms: async () => ({ items: [{ id: 'room', title: 'Room', type: 'group', lastActivity: '' }] }),
    history: async () => ({ items: [{ id: 'message', author: 'A', text: '', created: '', attachments: [ref] }] }),
    attachmentMetadata: () => labels.promise,
    resolveAttachment: async () => { gets++; throw new Error('No rebound content read allowed'); },
    send: async () => { throw new Error(); }, close() {},
  }, 0);
  try {
    await store.loadRooms(); await store.select('room');
    const metadata = store.loadAttachmentMetadata('room', 'message');
    const opening = assert.rejects(store.resolveAttachment('room', 'message', ref.id, { action: 'open', selectors: [] }, signal()));
    await store.select('room', true);
    labels.resolve([ref]); await metadata; await opening;
    assert.equal(gets, 0);
  } finally { labels.resolve([ref]); store.close(); }
});

test('store binds labels to exact selected message references, preserves them over polls, and caps attempts', async () => {
  let reads = 0;
  const refs = Array.from({ length: 70 }, (_, i) => ({ id: i.toString(16).padStart(64, '0') }));
  const store = new MessagingStore({
    rooms: async () => ({ items: [{ id: 'room', title: 'Room', type: 'group', lastActivity: '' }] }),
    history: async () => ({ items: refs.map((ref, i) => ({ id: `m${i}`, author: 'Author', text: '', created: '', attachments: [ref] })) }),
    attachmentMetadata: async ids => { reads++; return ids.map(id => ({ id, name: 'report.pdf', mime: 'application/pdf' })); },
    send: async () => { throw new Error(); }, close() {},
  }, 1_000_000);
  try {
    await store.loadRooms(); await store.select('room');
    await store.loadAttachmentMetadata('wrong-room', 'm0'); await store.loadAttachmentMetadata('room', 'missing');
    assert.equal(reads, 0);
    await store.loadAttachmentMetadata('room', 'm0');
    await store.refresh();
    assert.equal(store.messages.find(m => m.id === 'm0')!.attachments![0]!.name, 'report.pdf');
    await store.loadAttachmentMetadata('room', 'm0'); assert.equal(reads, 1);
    for (let i = 1; i < refs.length; i++) await store.loadAttachmentMetadata('room', `m${i}`);
    assert.equal(reads, 64);
    assert.equal(store.messages.find(m => m.id === 'm64')!.attachments![0]!.name, undefined);
  } finally { store.close(); }
});

test('store suppresses labels after A→B→A and does not retry failed passive labels', async () => {
  const late = deferred<MessageAttachment[]>();
  let calls = 0, oldSignal: AbortSignal | undefined;
  const ref = { id: 'a'.repeat(64) };
  const store = new MessagingStore({
    rooms: async () => ({ items: ['a', 'b'].map(id => ({ id, title: id, type: 'group', lastActivity: '' })) }),
    history: async () => ({ items: [{ id: 'm', author: 'A', text: '', created: '', attachments: [ref] }] }),
    attachmentMetadata: async (_ids, signal) => { oldSignal = signal; calls++; if (calls === 1) return late.promise; throw new Error('private detail'); },
    send: async () => { throw new Error(); }, close() {},
  }, 1_000_000);
  try {
    await store.loadRooms(); await store.select('a');
    const pending = store.loadAttachmentMetadata('a', 'm');
    await store.select('b'); await store.select('a');
    assert.equal(oldSignal!.aborted, true);
    late.resolve([{ ...ref, name: 'stale.pdf', mime: 'application/pdf' }]); await pending;
    assert.deepEqual(store.messages[0]!.attachments, [ref]);
    await store.loadAttachmentMetadata('a', 'm'); await store.loadAttachmentMetadata('a', 'm');
    assert.equal(calls, 2); assert.equal(store.notice, '');
  } finally { store.close(); }
});

test('metadata RPC accepts exact loaded identifiers, not URLs or extra body/options', () => {
  const params = { roomId: 'room', messageId: 'message' };
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.attachmentMetadata', params }), { method: 'messages.attachmentMetadata', params });
  for (const patch of [{ roomId: '' }, { url }, { body: true }, { messageId: 'bad\nid' }])
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.attachmentMetadata', params: { ...params, ...patch } }));
});
