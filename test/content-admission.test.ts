import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContentAdmission } from '../src/content-admission.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { detailedPNG } from './image-fixture.js';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise<void>(r => setImmediate(r));
test('one typed waiter gets priority over new previews only after actual settlement', async () => {
  const a = new ContentAdmission(), gate = deferred(); let work = 0;
  const preview = a.run(false, true, () => gate.promise);
  const waiting = a.reserveTyped(new AbortController().signal, () => true);
  await assert.rejects(a.reserveTyped(new AbortController().signal, () => true));
  await tick(); assert.equal(work, 0);
  gate.resolve(); await preview;
  await assert.rejects(a.run(false, true, async () => {}), 'reserved atomically before waking caller');
  const lease = await waiting;
  await a.run(true, true, async () => { work++; }, lease);
  lease.release();
  assert.equal(work, 1);
  await a.run(false, true, async () => {});
});
for (const reason of ['cancel', 'invalid', 'expiry'] as const) test(`waiting ${reason} never admits work or frees a physical preview`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = new ContentAdmission(), gate = deferred(), abort = new AbortController(); let valid = true;
  const preview = a.run(false, true, () => gate.promise);
  const waiting = a.reserveTyped(abort.signal, () => valid), rejected = assert.rejects(waiting);
  if (reason === 'cancel') abort.abort();
  if (reason === 'invalid') valid = false;
  if (reason === 'expiry') t.mock.timers.tick(10000);
  if (reason === 'invalid') gate.resolve();
  await rejected;
  if (reason !== 'invalid') await assert.rejects(a.run(true, true, async () => {}));
  gate.resolve(); await preview;
});
test('revoked caller lease retains a noncooperative physical owner until real settlement', async () => {
  const a = new ContentAdmission(), gate = deferred(), lease = await a.reserveTyped(new AbortController().signal, () => true);
  const work = a.run(true, true, () => gate.promise, lease);
  lease.release();
  await assert.rejects(a.reserveTyped(new AbortController().signal, () => true), 'explicit work is not preview queue eligibility');
  await assert.rejects(a.run(false, true, async () => {}));
  gate.resolve(); await work;
  const next = await a.reserveTyped(new AbortController().signal, () => true); next.release();
});
for (const action of ['settle', 'cancel', 'reload', 'remove', 'stop'] as const) test(`actual typed engine waiter ${action}: zero or one GET, no retry`, async () => {
  const gate = deferred(), entered = deferred(), png = detailedPNG(120, 80).png; let gets = 0;
  const api = new WebexMessagingAPI(() => 'SYNTHETIC', async url => {
    const path = new URL(String(url)).pathname;
    if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room', title: 'Local', type: 'group' }] }));
    if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'message', roomId: 'room',
      files: ['https://webexapis.com/v1/contents/WAIT'] }] }));
    gets++; return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
  });
  Object.assign((api as any).images, { pixels: async () => { entered.resolve(); await gate.promise; return Buffer.alloc(240 * 144 * 3); }, raster: async () => png });
  const store = new MessagingStore(api, 0), engine = new EditorEngine();
  await store.loadRooms(); await store.select('room');
  Object.assign(engine, { store, state: 'ready', mode: 'demo' });
  const id = store.messages[0]!.attachments![0]!.id, preview = api.previews([id], new AbortController().signal).catch(() => {});
  try {
    await entered.promise;
    const pending = engine.resolveAttachment(1, 'room', 'message', id, { action: 'open', selectors: [] });
    let outcome = 'pending';
    void pending.then(() => { outcome = 'ready'; }, () => { outcome = 'failed'; });
    const observed = action === 'settle' ? pending : assert.rejects(pending);
    await tick(); assert.equal(gets, 1, 'only the independent preview GET while waiting');
    assert.equal(outcome, 'pending', 'intent remains queued, not a rejected request to retry');
    await assert.rejects(engine.resolveAttachment(2, 'room', 'message', id, { action: 'open', selectors: [] }));
    if (action === 'cancel') engine.cancelAttachment(1);
    if (action === 'reload') await store.select('room', true);
    if (action === 'remove') store.messages = [];
    if (action === 'stop') engine.stop();
    gate.resolve(); await preview; await observed;
    assert.equal(gets, action === 'settle' ? 2 : 1);
  } finally { gate.resolve(); await preview; engine.stop(); }
});
