/** Synthetic high-frequency RGB PNG: no network, photos, ImageMagick or fixtures on disk. */
import { deflateSync } from 'node:zlib';
export function detailedPNG(width = 960, height = 600): { png: Buffer; rgb: Buffer } {
  const rgb = Buffer.alloc(width * height * 3), raster = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 3;
    rgb[p] = x % 2 ? 255 : 0; rgb[p + 1] = y % 2 ? 255 : 0; rgb[p + 2] = (x + y) % 2 ? 255 : 0;
  }
  for (let y = 0; y < height; y++) rgb.copy(raster, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (name: string, payload: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), payload]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    head.writeUInt32BE(payload.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return { png: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0))]), rgb };
}
