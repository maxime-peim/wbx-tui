import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { SDK_SHA256, SDK_URL, SDK_VERSION } from '../src/sdk-version.js';

const response = await fetch(SDK_URL, { signal: AbortSignal.timeout(60_000) });
if (!response.ok || !response.body) throw new Error(`SDK download failed (${response.status}).`);
const chunks: Uint8Array[] = [];
let size = 0;
for await (const chunk of response.body) {
  size += chunk.byteLength;
  if (size > 16 * 1024 * 1024) throw new Error('SDK download exceeds size limit.');
  chunks.push(chunk);
}
const data = Buffer.concat(chunks);
if (createHash('sha256').update(data).digest('hex') !== SDK_SHA256) {
  throw new Error('SDK checksum mismatch. Refusing to use this download.');
}
await mkdir('vendor', { recursive: true });
await writeFile('vendor/webex.min.js.part', data, { mode: 0o600 });
await rename('vendor/webex.min.js.part', 'vendor/webex.min.js');
console.log(`Downloaded Webex SDK ${SDK_VERSION}: ${size} bytes, SHA-256 verified.`);
