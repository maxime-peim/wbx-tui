/** Selected-message attachment previews. No remote URLs/credentials in editor data. */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { validToken } from './auth-protocol.js';
import { deadline } from './lifecycle.js';
import { ContentAdmission } from './content-admission.js';

export interface MessageImage {
  id: string; state: 'pending' | 'ready' | 'unsupported' | 'unavailable';
  png?: string; lines?: string[];
}
export interface OpenedImage extends MessageImage { state: 'ready'; png: string; lines: string[]; width: number; height: number }
export const OPEN_IMAGE_LIMITS = Object.freeze({ width: 1600, height: 1200, bytes: 6_000_000 });
export const IMAGE_LIMITS = Object.freeze({ bytes: 8_388_608, references: 1000, previews: 16, perMessage: 4, width: 240, height: 144, columns: 40, rows: 12 });
const unavailable = (id: string, state: MessageImage['state'] = 'unavailable'): MessageImage => ({ id, state });
export function webexAttachment(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1024 || /[\x00-\x20\x7f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.origin === 'https://webexapis.com' && !url.username && !url.password && !url.hash && !url.search
      && /^\/v1\/contents\/[A-Za-z0-9_+=-]{1,768}$/.test(url.pathname)) return url.href;
  } catch { /* Untrusted URLs remain inert. Never fetch arbitrary Markdown images. */ }
}
export function rasterType(bytes: Buffer, mime: string): string | undefined {
  if (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (mime === 'image/gif' && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'gif';
  if (mime === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
}
/** Explicit raster coder + stdin only: never shell commands, URLs, SVG/PDF or delegates. */
export async function imagePixels(bytes: Buffer, format: string, signal: AbortSignal): Promise<Buffer> {
  if (!['png', 'jpeg', 'gif', 'webp'].includes(format) || bytes.length > IMAGE_LIMITS.bytes || signal.aborted) throw new Error('Unsupported raster.');
  const run = (program: string): Promise<Buffer> => new Promise((resolve, reject) => {
    const child = spawn(program, ['-limit', 'memory', '32MiB', '-limit', 'map', '32MiB', '-limit', 'disk', '0',
      '-limit', 'width', '8192', '-limit', 'height', '8192', '-limit', 'time', '4', `${format}:-[0]`,
      '-thumbnail', '240x144', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
      '-gravity', 'center', '-extent', '240x144', '-depth', '8', 'rgb:-'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let size = 0;
    const cancel = () => child.kill('SIGKILL');
    const timer = setTimeout(cancel, 5000); signal.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > 240 * 144 * 3) cancel(); else chunks.push(data); });
    child.stdin.on('error', () => {});
    child.once('error', error => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (code === 0 && !signal.aborted && size === 240 * 144 * 3) resolve(Buffer.concat(chunks));
      else reject(new Error('Image conversion unavailable.'));
    });
    if (signal.aborted) cancel(); else child.stdin.end(bytes);
  });
  try { return await run('magick'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || signal.aborted) throw error; return run('convert'); }
}
/** Read original pixels, not a resized preview. Preserve aspect ratio; never upscale. */
export async function imageRaster(bytes: Buffer, format: string, signal: AbortSignal): Promise<Buffer> {
  if (!['png', 'jpeg', 'gif', 'webp'].includes(format) || bytes.length > IMAGE_LIMITS.bytes || signal.aborted) throw new Error('Image unavailable.');
  const run = (program: string): Promise<Buffer> => new Promise((resolve, reject) => {
    const child = spawn(program, ['-limit', 'memory', '128MiB', '-limit', 'map', '0', '-limit', 'disk', '0',
      '-limit', 'width', '8192', '-limit', 'height', '8192', '-limit', 'time', '4', `${format}:-[0]`,
      '-auto-orient', '-thumbnail', '1600x1200>', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
      '-strip', '-depth', '8', 'png24:-'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let size = 0;
    const cancel = () => child.kill('SIGKILL');
    const timer = setTimeout(cancel, 5000); signal.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > OPEN_IMAGE_LIMITS.bytes) cancel(); else chunks.push(data); });
    child.stdin.on('error', () => {});
    child.once('error', error => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (code === 0 && !signal.aborted && size <= OPEN_IMAGE_LIMITS.bytes) resolve(Buffer.concat(chunks));
      else reject(new Error('Image unavailable.'));
    });
    if (signal.aborted) cancel(); else child.stdin.end(bytes);
  });
  let png: Buffer;
  try { png = await run('magick'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || signal.aborted) throw error; png = await run('convert'); }
  if (png.length < 45 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || png.readUInt32BE(16) < 1 || png.readUInt32BE(16) > OPEN_IMAGE_LIMITS.width
    || png.readUInt32BE(20) < 1 || png.readUInt32BE(20) > OPEN_IMAGE_LIMITS.height) throw new Error('Image unavailable.');
  return png;
}
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, bytes: Buffer): Buffer {
  const data = Buffer.concat([Buffer.from(name), bytes]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(data)); return Buffer.concat([head, data, tail]);
}
export function imagePreview(id: string, rgb: Buffer): MessageImage {
  const { width, height, columns, rows } = IMAGE_LIMITS;
  if (rgb.length !== width * height * 3) throw new Error('Invalid raster.');
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raster = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raster, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
  const dots = [[0, 3], [1, 4], [2, 5], [6, 7]], lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < columns; x++) {
      let mask = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        // Box-average a 3x3 pixel tile; do not confuse blank padding with black.
        let gray = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const p = (((y * 4 + dy) * 3 + sy) * width + (x * 2 + dx) * 3 + sx) * 3;
          gray += rgb[p]! * .2126 + rgb[p + 1]! * .7152 + rgb[p + 2]! * .0722;
        }
        if (gray / 9 < 160) mask |= 1 << dots[dy]![dx]!;
      }
      line += String.fromCodePoint(0x2800 + mask);
    }
    lines.push(line);
  }
  return { id, state: 'ready', png, lines };
}

export class MessageImages {
  private entries = new Map<string, { url: string; value: MessageImage }>();
  private lifetime = new AbortController();
  private busy = false;
  private cached: string[] = [];
  constructor(private token: () => string, private fetcher: typeof fetch = fetch,
    private pixels = imagePixels, private raster = imageRaster, private admission = new ContentAdmission()) {}
  register(files: unknown): MessageImage[] {
    if (!Array.isArray(files)) return [];
    return [...new Set(files.slice(0, IMAGE_LIMITS.perMessage).flatMap(file => webexAttachment(file) ?? []))].map(url => {
      const id = createHash('sha256').update(url).digest('hex');
      let entry = this.entries.get(id);
      if (!entry) {
        entry = { url, value: unavailable(id, 'pending') }; this.entries.set(id, entry);
        if (this.entries.size > IMAGE_LIMITS.references) this.entries.delete(this.entries.keys().next().value!);
      }
      return entry.value;
    });
  }
  async load(ids: string[], parent: AbortSignal): Promise<MessageImage[]> {
    if (this.busy || this.lifetime.signal.aborted) throw new Error('Image preview unavailable.');
    this.busy = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal, this.lifetime.signal]);
    // A timed-out, noncooperative transport retains native admission until it
    // really settles. The caller is released, but replacements cannot overlap.
    const pending = this.admission.run(false, true, () => this.loadNative(ids, signal)).finally(() => { this.busy = false; });
    try { return await deadline(() => pending, 10_000, 'Image preview unavailable.', signal); }
    finally { abort.abort(); }
  }
  async open(id: string, parent: AbortSignal): Promise<OpenedImage> {
    const entry = this.entries.get(id);
    if (!entry || this.busy || parent.aborted || this.lifetime.signal.aborted) throw new Error('Image unavailable.');
    this.busy = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal, this.lifetime.signal]);
    const pending = this.admission.run(true, true, () => this.openNative(id, entry, signal)).finally(() => { this.busy = false; });
    try { return await deadline(() => pending, 10_000, 'Image unavailable.', signal); }
    finally { abort.abort(); }
  }
  private async openNative(id: string, entry: { url: string; value: MessageImage }, signal: AbortSignal): Promise<OpenedImage> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const token = this.token(); if (!validToken(token) || signal.aborted) throw new Error();
      const response = await this.fetcher(entry.url, { redirect: 'error', signal, headers: { Authorization: `Bearer ${token}`, Accept: 'image/png,image/jpeg,image/gif,image/webp' } });
      const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (signal.aborted || !response.ok || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)
        || Number(response.headers.get('content-length')) > IMAGE_LIMITS.bytes) { await response.body?.cancel(); throw new Error(); }
      reader = response.body?.getReader(); if (!reader) throw new Error();
      const cancel = () => { void reader?.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      let bytes: Buffer;
      try {
        const parts: Buffer[] = []; let size = 0, chunks = 0;
        while (true) {
          const item = await reader.read(); if (signal.aborted) throw new Error(); if (item.done) break;
          size += item.value.byteLength;
          if (size > IMAGE_LIMITS.bytes || ++chunks > 8192) throw new Error(); parts.push(Buffer.from(item.value));
        }
        bytes = Buffer.concat(parts);
      } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); reader = undefined; }
      return await this.fromBytes(id, bytes, mime, signal);
    } catch { throw new Error('Image unavailable. Check supported format, attachment limits and decoder.'); }
    finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  }
  /** Node-private conversion within a caller-held image admission; never fetches. */
  async fromBytes(id: string, bytes: Buffer, mime: string, signal: AbortSignal): Promise<OpenedImage> {
    const format = rasterType(bytes, mime);
    if (!format || bytes.length > IMAGE_LIMITS.bytes || signal.aborted || this.lifetime.signal.aborted) throw new Error('Image unavailable.');
    const png = await this.raster(bytes, format, signal);
    if (signal.aborted || png.length < 45 || png.length > OPEN_IMAGE_LIMITS.bytes
      || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || png.readUInt32BE(16) < 1 || png.readUInt32BE(16) > OPEN_IMAGE_LIMITS.width
      || png.readUInt32BE(20) < 1 || png.readUInt32BE(20) > OPEN_IMAGE_LIMITS.height) throw new Error('Image unavailable.');
    const preview = this.entries.get(id)?.value;
    const lines = preview?.state === 'ready' ? preview.lines! : imagePreview(id, await this.pixels(bytes, format, signal)).lines!;
    if (signal.aborted || this.lifetime.signal.aborted) throw new Error('Image unavailable.');
    return { id, state: 'ready', png: png.toString('base64'), width: png.readUInt32BE(16), height: png.readUInt32BE(20), lines: [...lines] };
  }
  private async loadNative(ids: string[], parent: AbortSignal): Promise<MessageImage[]> {
      const result: MessageImage[] = [];
      for (const id of ids.slice(0, IMAGE_LIMITS.perMessage)) {
        const entry = this.entries.get(id);
        if (!entry) { result.push(unavailable(id)); continue; }
        if (entry.value.state === 'pending') {
          entry.value = unavailable(id);
          if (!parent.aborted) {
            const timeout = AbortSignal.timeout(10_000), signal = AbortSignal.any([parent, timeout, this.lifetime.signal]);
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            try {
              const token = this.token(); if (!validToken(token)) throw new Error();
              const response = await this.fetcher(entry.url, { redirect: 'error', signal, headers: { Authorization: `Bearer ${token}`, Accept: 'image/png,image/jpeg,image/gif,image/webp' } });
              const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
              if (signal.aborted || !response.ok || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)
                || Number(response.headers.get('content-length')) > IMAGE_LIMITS.bytes) { await response.body?.cancel(); entry.value = unavailable(id, 'unsupported'); throw new Error(); }
              reader = response.body?.getReader(); if (!reader) throw new Error();
              const cancel = () => { void reader?.cancel().catch(() => {}); };
              signal.addEventListener('abort', cancel, { once: true });
              let bytes: Buffer;
              try {
                const parts: Buffer[] = []; let size = 0, chunks = 0;
                while (true) {
                  const item = await reader.read(); if (signal.aborted) throw new Error(); if (item.done) break;
                  size += item.value.byteLength;
                  if (size > IMAGE_LIMITS.bytes || ++chunks > 8192) throw new Error(); parts.push(Buffer.from(item.value));
                }
                bytes = Buffer.concat(parts);
              } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); reader = undefined; }
              const format = rasterType(bytes, mime); if (!format) { entry.value = unavailable(id, 'unsupported'); throw new Error(); }
              const rgb = await this.pixels(bytes, format, signal);
              if (!signal.aborted) {
                entry.value = imagePreview(id, rgb); this.cached.push(id);
                while (this.cached.length > IMAGE_LIMITS.previews) {
                  const old = this.cached.shift()!, previous = this.entries.get(old);
                  if (previous) previous.value = unavailable(old, 'pending');
                }
              }
            } catch { /* Sanitized placeholder only; never provider text, headers or token. */ }
            finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
          }
        }
        result.push(entry.value);
      }
      return result;
  }
  close(): void { this.lifetime.abort(); this.entries.clear(); this.cached = []; this.token = () => ''; }
}
