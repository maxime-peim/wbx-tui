// Incremental private local materialization. No network, shell, opener or credentials.
import { createHash } from 'node:crypto';
import { mkdtempSync, chmodSync, openSync, closeSync, writeSync, readSync, readFileSync, unlinkSync, rmdirSync, fstatSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';

let directory, path, fd, privateIdentity, ownedSave, value, seq = 0, bytes = 0, encoded = 0, hash, phase = 'begin', replying = true;
let fragments = [], frameBytes = 0;
const cleanup = () => {
  if (fd !== undefined) { try { closeSync(fd); } catch {} fd = undefined; }
  if (ownedSave) {
    try { const now = lstatSync(ownedSave.path); if (now.dev === ownedSave.dev && now.ino === ownedSave.ino) unlinkSync(ownedSave.path); } catch {}
    ownedSave = undefined;
  }
  if (path) {
    try { const now = lstatSync(path); if (now.dev === privateIdentity?.dev && now.ino === privateIdentity?.ino) unlinkSync(path); } catch {}
    path = undefined;
  }
  if (directory) { try { rmdirSync(directory); } catch {} directory = undefined; }
};
const exit = code => { cleanup(); process.exit(code); };
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => exit(0));
process.stdin.on('end', () => exit(phase === 'lease' ? 0 : 1));
process.stdin.on('error', () => exit(1)); process.stdout.on('error', () => exit(1));
let timer = setTimeout(() => exit(1), 45_000);
const reply = (message, done) => {
  replying = true;
  process.stdout.write(JSON.stringify(message) + '\n', () => { replying = false; done?.(); });
};
reply({ type: 'ready', version: 1 });
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fields = (v, names) => object(v) && Object.keys(v).sort().join(',') === names.slice().sort().join(',');
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const writeAll = (descriptor, data) => {
  let offset = 0;
  while (offset < data.length) { const size = writeSync(descriptor, data, offset); if (size <= 0) throw new Error(); offset += size; }
};
function begin(v) {
  if (!fields(v, ['meta', 'body'])) throw new Error();
  const { meta: m, body: b } = v, p = b?.payload;
  if (!fields(m, ['id', 'name', 'mime', 'sourceBytes']) || typeof m.id !== 'string' || !/^[a-f0-9]{64}$/.test(m.id)
    || typeof m.name !== 'string' || m.name.length > 120 || !/^[A-Za-z0-9_][A-Za-z0-9._ -]*$/.test(m.name)
    || typeof m.mime !== 'string' || !/^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(m.mime)
    || !integer(m.sourceBytes, 8_388_608) || !integer(b?.decodedBytes, 6_000_000)
    || !fields(p, ['mode', 'encoding', 'requestId', 'transferId', 'encodedBytes', 'chunkBytes', 'chunks', 'sha256'])
    || p.mode !== 'chunks' || p.encoding !== 'base64' || !integer(p.requestId, 0x7fffffff) || p.requestId === 0
    || typeof p.transferId !== 'string' || !/^[a-f0-9]{32}$/.test(p.transferId)
    || typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256)
    || p.chunkBytes !== 49152 || p.chunks !== Math.ceil(b.decodedBytes / 49152)
    || p.encodedBytes !== 4 * Math.ceil(b.decodedBytes / 3)) throw new Error();
  if (b.kind === 'original') {
    if (!fields(b, ['kind', 'decodedBytes', 'text', 'payload']) || m.sourceBytes !== b.decodedBytes
      || typeof b.text !== 'boolean' || b.text && b.decodedBytes > 1_048_576) throw new Error();
  } else if (b.kind !== 'png' || !fields(b, ['kind', 'decodedBytes', 'width', 'height', 'lines', 'payload'])
    || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(m.mime) || m.sourceBytes < ({'image/png':8,'image/jpeg':3,'image/gif':6,'image/webp':12})[m.mime]
    || b.decodedBytes < 45 || !integer(b.width, 1600) || !b.width || !integer(b.height, 1200) || !b.height
    || !Array.isArray(b.lines) || b.lines.length !== 12 || b.lines.some(row => typeof row !== 'string' || !/^[⠀-⣿]{40}$/u.test(row))) throw new Error();
  value = v; hash = createHash('sha256');
  directory = mkdtempSync(join(tmpdir(), 'wbx-attachment-')); chmodSync(directory, 0o700);
  path = join(directory, m.name); fd = openSync(path, 'wx', 0o600);
  privateIdentity = fstatSync(fd);
  phase = 'chunks'; clearTimeout(timer); timer = setTimeout(() => exit(1), 30_000);
}
function receive(v) {
  if (replying || !object(v)) throw new Error();
  if (v.type !== 'chunk' && Buffer.byteLength(JSON.stringify(v)) > 8192) throw new Error();
  if (phase === 'begin') {
    if (!fields(v, ['type', 'value']) || v.type !== 'begin' || Buffer.byteLength(JSON.stringify(v)) > 8192) throw new Error();
    begin(v.value); reply({ type: 'begun' }); return;
  }
  if (phase === 'chunks' && v.type === 'chunk') {
    const remaining = value.body.decodedBytes - bytes;
    if (!fields(v, ['type', 'seq', 'offset', 'decodedBytes', 'data']) || v.seq !== seq || v.offset !== bytes
      || remaining <= 0 || v.decodedBytes !== Math.min(49152, remaining) || typeof v.data !== 'string'
      || v.data.length !== 4 * Math.ceil(v.decodedBytes / 3)) throw new Error();
    const decoded = Buffer.from(v.data, 'base64');
    if (decoded.length !== v.decodedBytes || decoded.toString('base64') !== v.data) throw new Error();
    writeAll(fd, decoded); hash.update(decoded); bytes += decoded.length; encoded += v.data.length;
    reply({ type: 'chunk', seq: seq++ }); return;
  }
  if (phase === 'chunks' && v.type === 'prepare') {
    if (!fields(v, ['type']) || bytes !== value.body.decodedBytes || encoded !== value.body.payload.encodedBytes
      || seq !== value.body.payload.chunks || hash.digest('hex') !== value.body.payload.sha256) throw new Error();
    closeSync(fd); fd = undefined;
    let text = false;
    if (value.body.kind === 'original' && bytes <= 1_048_576) {
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
        text = !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(decoded) && decoded.split('\n').length <= 20_000;
      } catch {}
    }
    if (value.body.kind === 'original' && value.body.text !== text) throw new Error();
    if (value.body.kind === 'png') {
      // Read only the fixed header, not a second full PNG.
      const header = Buffer.alloc(24), file = openSync(path, 'r');
      try {
        if (readSync(file, header, 0, 24, 0) !== 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
          || header.readUInt32BE(16) !== value.body.width || header.readUInt32BE(20) !== value.body.height) throw new Error();
      } finally { closeSync(file); }
    }
    phase = 'prepared'; reply({ type: 'prepared', decodedBytes: bytes, encodedBytes: encoded, chunks: seq,
      sha256: value.body.payload.sha256, text }); return;
  }
  if (phase === 'prepared' && v.type === 'commit') {
    if (!['lease', 'save', 'discard'].includes(v.mode) || !fields(v, v.mode === 'save' ? ['type', 'mode', 'path'] : ['type', 'mode'])) throw new Error();
    if (v.mode === 'discard') { phase = 'done'; cleanup(); reply({ type: 'discarded' }, () => exit(0)); return; }
    if (v.mode === 'save') {
      if (typeof v.path !== 'string' || !isAbsolute(v.path) || Buffer.byteLength(v.path) > 4096 || /[\x00-\x1f\x7f]/.test(v.path)) throw new Error();
      const target = openSync(v.path, 'wx', 0o600), stats = fstatSync(target);
      ownedSave = { path: v.path, dev: stats.dev, ino: stats.ino };
      try {
        const source = openSync(path, 'r'), part = Buffer.alloc(49152);
        try {
          let size;
          while ((size = readSync(source, part, 0, part.length, null)) > 0) writeAll(target, part.subarray(0, size));
        } finally { closeSync(source); }
      } finally { closeSync(target); }
      ownedSave = undefined; phase = 'done'; cleanup();
      reply({ type: 'committed', path: v.path, text: value.body.kind === 'original' && value.body.text }, () => exit(0)); return;
    }
    phase = 'lease'; clearTimeout(timer); timer = setTimeout(() => exit(0), 30 * 60_000);
    reply({ type: 'committed', path, text: value.body.kind === 'original' && value.body.text }); return;
  }
  throw new Error();
}
// Each callback's new bytes are scanned once, and oversized segments rejected
// before joining/decoding. The helper permits only one response-credit step.
process.stdin.on('data', chunk => {
  try {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline, size = end - offset;
      if (frameBytes + size > 69632) throw new Error();
      if (size) { fragments.push(chunk.subarray(offset, end)); frameBytes += size; }
      if (newline < 0) return;
      const line = Buffer.concat(fragments, frameBytes).toString('utf8');
      fragments = []; frameBytes = 0; offset = newline + 1;
      receive(JSON.parse(line));
    }
  } catch { exit(1); }
});
