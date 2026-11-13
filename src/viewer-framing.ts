import { MAX_FRAME_BYTES } from './protocol.js';

/** One fixed header and one bounded body; every incoming byte is copied once.
 * Completed bodies belong to the receiver and are never reused for later packets. */
export class ViewerPackets {
  private readonly header: Buffer;
  private headerBytes = 0;
  private body?: Buffer;
  private bodyBytes = 0;
  private closed = false;
  constructor(private receive: (body: Buffer) => void, private allocate: (size: number) => Buffer = Buffer.allocUnsafe) {
    this.header = allocate(4);
  }
  push(chunk: Buffer): void {
    if (this.closed) return;
    let offset = 0;
    try {
      while (offset < chunk.length && !this.closed) {
        if (!this.body) {
          const length = Math.min(4 - this.headerBytes, chunk.length - offset);
          chunk.copy(this.header, this.headerBytes, offset, offset + length);
          this.headerBytes += length; offset += length;
          if (this.headerBytes < 4) continue;
          const size = this.header.readUInt32BE();
          if (size > MAX_FRAME_BYTES) throw new Error('Oversized viewer packet.');
          this.headerBytes = 0;
          this.body = this.allocate(size); this.bodyBytes = 0;
        }
        const length = Math.min(this.body.length - this.bodyBytes, chunk.length - offset);
        chunk.copy(this.body, this.bodyBytes, offset, offset + length);
        this.bodyBytes += length; offset += length;
        if (this.bodyBytes === this.body.length) {
          const body = this.body;
          this.body = undefined; this.bodyBytes = 0;
          this.receive(body);
        }
      }
    } catch (error) { this.close(); throw error; }
  }
  close(): void {
    this.closed = true; this.body = undefined; this.bodyBytes = this.headerBytes = 0;
  }
}
