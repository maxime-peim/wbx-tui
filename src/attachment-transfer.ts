/** Single-owner, one-credit transport of an already selected representation. No I/O. */
import { createHash, randomBytes } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { ResolvedAttachment } from './attachment-policy.js';
import { transferInteger, transferIdentity, type AttachmentPull, type AttachmentComplete } from './attachment-transfer-contracts.js';
export { transferInteger, transferIdentity, type AttachmentPull, type AttachmentComplete } from './attachment-transfer-contracts.js';

export const ATTACHMENT_TRANSFER = Object.freeze({ chunkBytes: 49_152, recordBytes: 69_632, controlBytes: 8192,
  bytes: 6_000_000, lifetimeMs: 30_000, idleMs: 5000 });
export interface ChunkPayload {
  mode: 'chunks'; encoding: 'base64'; requestId: number; transferId: string;
  encodedBytes: number; chunkBytes: 49152; chunks: number; sha256: string;
}
export type ChunkedAttachment = Omit<ResolvedAttachment, 'body'> & {
  body: Omit<ResolvedAttachment['body'], 'payload'> & { payload: ChunkPayload };
};

export class AttachmentTransfer {
  private data: string;
  private seq = 0;
  private ready = false;
  private expectedSent: number | undefined = -1;
  private closed = false;
  private lifetime?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private constructor(readonly descriptor: ChunkedAttachment, data: string, private valid: () => boolean, private released: () => void) {
    this.data = data;
    this.lifetime = setTimeout(() => this.close(), ATTACHMENT_TRANSFER.lifetimeMs); this.lifetime.unref?.();
    this.progress();
  }
  static async create(requestId: number, value: ResolvedAttachment, valid: () => boolean, released: () => void): Promise<AttachmentTransfer> {
    const data = value.body.payload.data, bytes = value.body.decodedBytes, hash = createHash('sha256');
    if (!transferInteger(bytes, ATTACHMENT_TRANSFER.bytes) || data.length !== 4 * Math.ceil(bytes / 3)) throw new Error('Invalid transfer representation.');
    // Hash/canonical verification in bounded slices, yielding between them. Do
    // not allocate a second full decoded representation or serialize the blob.
    for (let at = 0; at < data.length; at += 65_536) {
      if (!valid()) throw new Error('Attachment transfer canceled.');
      const encoded = data.slice(at, at + 65_536), decoded = Buffer.from(encoded, 'base64');
      if (decoded.toString('base64') !== encoded || decoded.length !== Math.min(49_152, bytes - at / 4 * 3)) throw new Error('Invalid transfer encoding.');
      hash.update(decoded); await nextTurn();
    }
    if (!valid()) throw new Error('Attachment transfer canceled.');
    const { payload: _payload, ...body } = value.body;
    const inlineHeader = { jsonrpc: '2.0', id: 0x7fffffff, result: { meta: value.meta,
      body: { ...body, payload: { mode: 'inline', encoding: 'base64', data: '' } } } };
    if (Buffer.byteLength(JSON.stringify(inlineHeader)) + data.length > 8_388_608) throw new Error('Oversized equivalent inline result.');
    const descriptor: ChunkedAttachment = { meta: value.meta, body: { ...body, payload: {
      mode: 'chunks', encoding: 'base64', requestId, transferId: randomBytes(16).toString('hex'),
      encodedBytes: data.length, chunkBytes: 49_152, chunks: Math.ceil(bytes / 49_152), sha256: hash.digest('hex'),
    } } };
    if (Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 0x7fffffff, result: descriptor })) > 8192) throw new Error('Oversized transfer descriptor.');
    return new AttachmentTransfer(descriptor, data, valid, released);
  }
  matches(requestId: number, transferId: string): boolean {
    return this.descriptor.body.payload.requestId === requestId && this.descriptor.body.payload.transferId === transferId;
  }
  revalidate(): boolean { if (!this.closed && !this.valid()) this.close(); return !this.closed; }
  private check(): void { if (!this.revalidate()) throw new Error('Attachment transfer unavailable. Nothing was retried.'); }
  private reject(): never { this.close(); throw new Error('Attachment transfer out of order or invalid. Nothing was retried.'); }
  private progress(): void {
    clearTimeout(this.idle); this.idle = setTimeout(() => this.close(), ATTACHMENT_TRANSFER.idleMs); this.idle.unref?.();
  }
  sent(seq: number): void {
    if (!this.revalidate() || this.expectedSent !== seq) return;
    this.expectedSent = undefined;
    if (seq >= 0) this.seq++;
    this.ready = true; this.progress();
  }
  pull(p: AttachmentPull) {
    this.check();
    if (!this.ready || !transferInteger(p.seq) || p.seq !== this.seq || p.seq >= this.descriptor.body.payload.chunks
      || p.offset !== p.seq * 49_152) return this.reject();
    this.ready = false;
    this.expectedSent = p.seq;
    const decodedBytes = Math.min(49_152, this.descriptor.body.decodedBytes - p.offset);
    return { ...p, decodedBytes, data: this.data.slice(p.seq * 65_536, p.seq * 65_536 + 4 * Math.ceil(decodedBytes / 3)) };
  }
  complete(p: AttachmentComplete) {
    this.check();
    const expected = this.descriptor.body.payload;
    if (!this.ready || this.seq !== expected.chunks || p.chunks !== expected.chunks || p.decodedBytes !== this.descriptor.body.decodedBytes
      || p.encodedBytes !== expected.encodedBytes || p.sha256 !== expected.sha256) return this.reject();
    this.close(); return { requestId: p.requestId, transferId: p.transferId, complete: true as const };
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.data = ''; clearTimeout(this.lifetime); clearTimeout(this.idle); this.released();
  }
}
