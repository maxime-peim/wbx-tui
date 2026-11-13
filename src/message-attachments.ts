/** Explicit attachment reads. URLs and authorization never cross editor RPC. */
import { createHash } from 'node:crypto';
import { validToken } from './auth-protocol.js';
import { deadline } from './lifecycle.js';
import { webexAttachment, IMAGE_LIMITS, type OpenedImage } from './message-images.js';
import { ContentAdmission, type ContentLease } from './content-admission.js';
import { attachmentMime, attachmentOriginal, validAttachmentOptions, type AttachmentResolveOptions, type ResolvedAttachment } from './attachment-policy.js';

export interface MessageAttachment { id: string; name?: string; mime?: string }
export interface OpenedAttachment extends MessageAttachment { name: string; mime: string; size: number; text: boolean; data: string }
// Base64 plus metadata must fit a single bounded editor response. No disk/cache here.
export const ATTACHMENT_LIMITS = Object.freeze({ bytes: 6_000_000, textBytes: 1_048_576, textLines: 20_000, references: 1000, perMessage: 10, timeout: 30_000 });

export function attachmentName(disposition: string | null): string {
  const value = (disposition ?? '').slice(0, 4096);
  const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]*)/i.exec(value)?.[1];
  let name = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(value)?.slice(1).find(part => part !== undefined) ?? '';
  if (encoded) { try { name = decodeURIComponent(encoded.trim()); } catch { /* Use the plain filename, if any. */ } }
  // A remote filename is only a suggestion, never a path, option or Ex command.
  name = name.split(/[\\/]/).at(-1)!.normalize('NFKC').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[. -]+/, '').trim().slice(0, 120);
  return name || 'attachment';
}
export function attachmentText(bytes: Buffer): boolean {
  if (bytes.length > ATTACHMENT_LIMITS.textBytes) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text) && text.split('\n').length <= ATTACHMENT_LIMITS.textLines;
  } catch { return false; }
}

export class MessageAttachments {
  private entries = new Map<string, string>();
  private metadata = new Map<string, MessageAttachment>();
  private lifetime = new AbortController();
  private busy = false;
  constructor(private token: () => string, private fetcher: typeof fetch = fetch, private admission = new ContentAdmission()) {}
  register(files: unknown): MessageAttachment[] {
    if (!Array.isArray(files) || this.lifetime.signal.aborted) return [];
    return [...new Set(files.slice(0, ATTACHMENT_LIMITS.perMessage).flatMap(file => webexAttachment(file) ?? []))].map(url => {
      const id = createHash('sha256').update(url).digest('hex');
      this.entries.set(id, url);
      if (this.entries.size > ATTACHMENT_LIMITS.references) {
        const oldest = this.entries.keys().next().value!;
        this.entries.delete(oldest); this.metadata.delete(oldest);
      }
      return { ...(this.metadata.get(id) ?? { id }) };
    });
  }
  async describe(ids: string[], parent: AbortSignal): Promise<MessageAttachment[]> {
    if (this.busy || parent.aborted || this.lifetime.signal.aborted || ids.length > ATTACHMENT_LIMITS.perMessage
      || new Set(ids).size !== ids.length || ids.some(id => !this.entries.has(id))) throw new Error('Attachment metadata unavailable.');
    ids = [...ids];
    this.busy = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal, this.lifetime.signal]);
    const pending = this.admission.run(false, true, async () => {
      for (const id of ids) {
        if (signal.aborted) break;
        if (this.metadata.has(id)) continue;
        const url = this.entries.get(id), token = this.token();
        if (!url || !validToken(token)) break;
        const response = await this.fetcher(url, { method: 'HEAD', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
        try {
          if (signal.aborted || response.status !== 200) break;
          const value = { id, name: attachmentName(response.headers.get('content-disposition')),
            mime: attachmentMime(response.headers.get('content-type') ?? '') };
          if (this.entries.get(id) === url) this.metadata.set(id, value);
        } finally { await response.body?.cancel(); }
      }
      return ids.map(id => ({ ...(this.metadata.get(id) ?? { id }) }));
    }).finally(() => { this.busy = false; });
    // The physical reader, including cleanup, retains admission after timeout.
    try { return await deadline(() => pending, 10_000, 'Attachment metadata unavailable.', signal); }
    finally { abort.abort(); }
  }
  async open(id: string, parent: AbortSignal): Promise<OpenedAttachment> {
    const url = this.entries.get(id);
    if (!url || this.busy || parent.aborted || this.lifetime.signal.aborted) throw new Error('Attachment unavailable or another attachment read is active.');
    this.busy = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal, this.lifetime.signal]);
    // Keep admission until a noncooperative transport/cleanup actually settles.
    const pending = this.admission.run(true, false, () => this.read(id, url, signal)).finally(() => { this.busy = false; });
    try { return await deadline(() => pending, ATTACHMENT_LIMITS.timeout, 'Attachment read timed out. Retry explicitly.', signal); }
    finally { abort.abort(); }
  }
  /** Node-private reference reuse for explicit native image rendering only. */
  reference(id: string): string | undefined { return this.entries.get(id); }
  async resolve(id: string, options: AttachmentResolveOptions, parent: AbortSignal,
    render: (id: string, bytes: Buffer, mime: string, signal: AbortSignal) => Promise<OpenedImage>, lease?: ContentLease): Promise<ResolvedAttachment> {
    const url = this.entries.get(id);
    if (!url || this.busy || parent.aborted || this.lifetime.signal.aborted || !validAttachmentOptions(options)) throw new Error('Attachment unavailable or busy.');
    // Detach policy before the first await; caller mutation cannot change routing.
    options = { action: options.action, selectors: options.selectors.map(item => ({ ...item })) };
    this.busy = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal, this.lifetime.signal]);
    const pending = this.admission.run(true, options.action === 'open', () => this.resolveNative(id, url, options, signal, abort, render), lease)
      .finally(() => { this.busy = false; });
    try { return await deadline(() => pending, ATTACHMENT_LIMITS.timeout, 'Attachment read timed out. Retry explicitly.', signal); }
    finally { abort.abort(); }
  }
  private async resolveNative(id: string, url: string, options: AttachmentResolveOptions, signal: AbortSignal, abort: AbortController,
    render: (id: string, bytes: Buffer, mime: string, signal: AbortSignal) => Promise<OpenedImage>): Promise<ResolvedAttachment> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, imageTimer: ReturnType<typeof setTimeout> | undefined, imageDeadline = Infinity;
    try {
      const token = this.token(); if (!validToken(token) || signal.aborted) throw new Error();
      const started = performance.now();
      const response = await this.fetcher(url, { method: 'GET', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
      if (signal.aborted || response.status !== 200) { await response.body?.cancel(); throw new Error(); }
      const name = attachmentName(response.headers.get('content-disposition')), mime = attachmentMime(response.headers.get('content-type') ?? '');
      const original = attachmentOriginal(name, mime, options), limit = original ? ATTACHMENT_LIMITS.bytes : IMAGE_LIMITS.bytes;
      if (!original) {
        imageDeadline = started + 10_000;
        const remaining = imageDeadline - performance.now();
        if (remaining <= 0) abort.abort();
        else imageTimer = setTimeout(() => abort.abort(), remaining);
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit)) {
        await response.body?.cancel(); throw new Error();
      }
      reader = response.body?.getReader(); if (!reader) throw new Error();
      const cancel = () => { void reader?.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      let bytes: Buffer;
      try {
        const parts: Buffer[] = []; let size = 0, chunks = 0;
        while (true) {
          if (signal.aborted) throw new Error();
          const item = await reader.read(); if (signal.aborted) throw new Error(); if (item.done) break;
          size += item.value.byteLength;
          if (size > limit || ++chunks > 8192) throw new Error();
          parts.push(Buffer.from(item.value));
        }
        bytes = Buffer.concat(parts, size);
      } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); reader = undefined; }
      if (performance.now() >= imageDeadline) abort.abort();
      if (signal.aborted) throw new Error();
      const meta = { id, name, mime, sourceBytes: bytes.length };
      if (original) return { meta, body: { kind: 'original', decodedBytes: bytes.length, text: attachmentText(bytes),
        payload: { mode: 'inline', encoding: 'base64', data: bytes.toString('base64') } } };
      const image = await render(id, bytes, mime, signal);
      if (performance.now() >= imageDeadline) abort.abort();
      if (signal.aborted || image.id !== id) throw new Error();
      return { meta, body: { kind: 'png', decodedBytes: Buffer.byteLength(image.png, 'base64'), width: image.width, height: image.height,
        lines: image.lines, payload: { mode: 'inline', encoding: 'base64', data: image.png } } };
    } catch { throw new Error('Attachment unavailable. Check format, access and the original/image limits. Nothing was retried.'); }
    finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); clearTimeout(imageTimer); }
  }
  private async read(id: string, url: string, signal: AbortSignal): Promise<OpenedAttachment> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const token = this.token(); if (!validToken(token) || signal.aborted) throw new Error();
      const response = await this.fetcher(url, { method: 'GET', redirect: 'error', signal, headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
      if (signal.aborted || response.status !== 200 || Number(response.headers.get('content-length')) > ATTACHMENT_LIMITS.bytes) {
        await response.body?.cancel(); throw new Error();
      }
      const name = attachmentName(response.headers.get('content-disposition'));
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      const mime = /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(type) ? type : 'application/octet-stream';
      reader = response.body?.getReader(); if (!reader) throw new Error();
      const cancel = () => { void reader?.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      const parts: Buffer[] = []; let size = 0, chunks = 0;
      try {
        while (true) {
          const item = await reader.read(); if (signal.aborted) throw new Error(); if (item.done) break;
          size += item.value.byteLength;
          if (size > ATTACHMENT_LIMITS.bytes || ++chunks > 8192) throw new Error();
          parts.push(Buffer.from(item.value));
        }
      } finally { signal.removeEventListener('abort', cancel); }
      const bytes = Buffer.concat(parts);
      if (signal.aborted) throw new Error();
      return { id, name, mime, size, text: attachmentText(bytes), data: bytes.toString('base64') };
    } catch { throw new Error('Attachment unavailable. Check access and the 6 MB attachment limit. Nothing was retried.'); }
    finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  }
  close(): void { this.lifetime.abort(); this.entries.clear(); this.metadata.clear(); this.token = () => ''; }
}
