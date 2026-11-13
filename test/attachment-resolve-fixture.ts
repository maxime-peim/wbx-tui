/** Native integration fixture: real RPC/store/API, synthetic account/content only. */
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { detailedPNG } from './image-fixture.js';
import { editorOutput } from '../src/editor-output.js';
const chunks = process.argv.includes('--chunks');
const large = chunks || process.argv.includes('--large');
const sample = detailedPNG(120, 80).png;
let releasePreview!: () => void;
const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
// Synthetic normalized PNG trailing bytes exercise segmentation independently of
// converter CPU; existing converter tests remain unchanged.
const png = large ? Buffer.concat([sample, Buffer.alloc(Math.max(0, 147_457 - sample.length))]) : sample;
const audit = (value: object) => appendFileSync(process.env.WBX_EDITOR_AUDIT!, JSON.stringify(value) + '\n');
globalThis.fetch = async () => { throw new Error('Live network forbidden'); };
const api = new WebexMessagingAPI(() => 'SYNTHETIC-ONLY', async (target, options) => {
  const path = new URL(String(target)).pathname;
  audit({ path, method: options?.method ?? 'GET' });
  if (options?.method === 'POST') throw new Error('Posts forbidden');
  if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room',
    title: 'Typed attachment fixture' + (process.env.WBX_ATTACHMENT_GENERATION ? ' #' + process.env.WBX_ATTACHMENT_GENERATION : ''), type: 'group' }] }));
  if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'message', roomId: 'room', text: 'Ten synthetic attachments',
    files: Array.from({ length: 10 }, (_, i) => `https://webexapis.com/v1/contents/TYPED-${i}`) }] }));
  if (!/^\/v1\/contents\/TYPED-[0-9]$/.test(path)) throw new Error('Unexpected endpoint');
  // Deliberately noncooperative headers exercise actual abort/epoch checks.
  await delay(80);
  if (process.argv.includes('--resolve-fail')) return new Response(options?.method === 'HEAD' ? null : 'Synthetic denial', { status: 403 });
  if (path.endsWith('-1')) return new Response(options?.method === 'HEAD' ? null : 'print("hello")\n# vim: set textwidth=7:\n', {
    headers: { 'content-type': 'text/x-python', 'content-disposition': 'attachment; filename=example.py' } });
  if (large && path.endsWith('-2')) return new Response(options?.method === 'HEAD' ? null : new Uint8Array(Buffer.alloc(6_000_000, 255)), {
    headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=original.bin' } });
  return new Response(options?.method === 'HEAD' ? null : new Uint8Array(png), { headers: { 'content-type': 'image/png', 'content-disposition': 'attachment; filename=Picture.PNG' } });
});
// Only raster CPU is deterministic here; existing image-detail tests execute the
// installed converter independently. Conversion still receives fetched bytes.
Object.assign((api as any).images, {
  raster: async (bytes: Buffer) => { audit({ conversion: 'raster', exact: bytes.equals(png) }); return png; },
  pixels: async (bytes: Buffer) => {
    audit({ conversion: 'braille', exact: bytes.equals(png) });
    if (process.argv.includes('--preview-wait')) { audit({ previewEntered: true }); await previewGate; }
    return Buffer.alloc(240 * 144 * 3);
  },
});
const store = new MessagingStore(api, 0, 'demo'), engine = new EditorEngine();
Object.assign(engine, { store, state: 'ready', mode: 'demo' });
engine.start = async () => { await store.loadRooms(); (engine as any).publish(); };
store.onChange = () => (engine as any).publish();
const output = editorOutput(process.stdout, () => { void rpc.close(); });
function prepareOutput(value: any) {
  // Default fixture stays an A1 typed-only peer to preserve its inline adversarial
  // validation checks. --chunks exercises the newly advertised production path.
  if (!chunks && value.result?.capabilities) value.result.capabilities = value.result.capabilities.filter((cap: string) => cap !== 'attachment-chunks-v1');
  if (process.argv.some(arg => arg.startsWith('--bad-'))) value = structuredClone(value);
  if (process.argv.includes('--bad-digest') && value.result?.body?.payload?.mode === 'chunks') value.result.body.payload.sha256 = '0'.repeat(64);
  if (process.argv.includes('--bad-seq') && typeof value.result?.seq === 'number') value.result.seq++;
  if (process.argv.includes('--bad-complete') && value.result?.complete === true) value.result.complete = false;
  return value;
}
const write = Object.assign((value: object) => output(prepareOutput(value)), {
  record: (value: any, options: Parameters<typeof output.record>[1]) => {
    if (process.argv.includes('--slow-chunks') && typeof value.result?.seq === 'number') setTimeout(() => output.record(prepareOutput(value), options), 30);
    else output.record(prepareOutput(value), options);
  },
});
const rpc = new EditorRPC(engine, new EditorMeetings(), write);
rpc.once('closed', () => process.exit(0));
let selected: Promise<void> = Promise.resolve();
let metadata: Promise<void> = Promise.resolve();
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line); audit({ rpc: request.method, params: request.params });
  if (request.method === 'test.selectionBarrier') {
    void selected.then(() => {
      audit({ selectionSettled: true });
      write({ jsonrpc: '2.0', id: request.id, result: null });
    });
    return;
  }
  if (request.method === 'test.preview') {
    void metadata.then(() => api.previews([store.messages[0]!.attachments![0]!.id], new AbortController().signal)).catch(() => {});
    write({ jsonrpc: '2.0', id: request.id, result: null }); return;
  }
  if (request.method === 'test.release') { releasePreview(); write({ jsonrpc: '2.0', id: request.id, result: null }); return; }
  const received = rpc.receive(line);
  if (request.method === 'rooms.select') selected = received;
  if (request.method === 'messages.attachmentMetadata') metadata = received;
}).on('close', () => { void rpc.close(); });
