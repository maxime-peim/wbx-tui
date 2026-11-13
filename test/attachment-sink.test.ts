import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detailedPNG } from './image-fixture.js';
async function sink() {
  const directory = await mkdtemp('/tmp/opencode/wbx-chunk-sink-');
  const child = spawn(process.execPath, ['scripts/attachment-sink.mjs'], { env: { PATH: process.env.PATH, TMPDIR: directory }, stdio: ['pipe', 'pipe', 'ignore'] });
  const exited = once(child, 'exit'), lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const receive = async () => { const line = await lines.next(); assert.equal(line.done, false, 'helper produced its bounded phase response'); return JSON.parse(line.value!); };
  const send = async (value: object) => { child.stdin.write(JSON.stringify(value) + '\n'); return receive(); };
  child.stdin.on('error', () => {});
  return { child, directory, exited, receive, send, async close() { child.stdin.end(); await exited; await rm(directory, { recursive: true, force: true }); } };
}
function value(bytes: Buffer, png = false) {
  return { meta: { id: 'a'.repeat(64), name: png ? 'picture.png' : 'example.bin', mime: png ? 'image/png' : 'application/octet-stream', sourceBytes: bytes.length },
    body: { ...(png ? { kind: 'png', width: 120, height: 80, lines: Array(12).fill('⣿'.repeat(40)) } : { kind: 'original', text: bytes.length <= 1048576 && bytes.every(byte => byte === 65) }),
      decodedBytes: bytes.length, payload: { mode: 'chunks', encoding: 'base64', requestId: 2, transferId: 'b'.repeat(32),
        encodedBytes: 4 * Math.ceil(bytes.length / 3), chunkBytes: 49152, chunks: Math.ceil(bytes.length / 49152),
        sha256: createHash('sha256').update(bytes).digest('hex') } } };
}
async function prepare(s: Awaited<ReturnType<typeof sink>>, bytes: Buffer, v = value(bytes)) {
  assert.deepEqual(await s.receive(), { type: 'ready', version: 1 });
  assert.deepEqual(await s.send({ type: 'begin', value: v }), { type: 'begun' });
  for (let offset = 0, seq = 0; offset < bytes.length; offset += 49152, seq++) {
    const part = bytes.subarray(offset, offset + 49152);
    assert.deepEqual(await s.send({ type: 'chunk', seq, offset, decodedBytes: part.length, data: part.toString('base64') }), { type: 'chunk', seq });
  }
  return s.send({ type: 'prepare' });
}
for (const size of [0, 1, 2, 49151, 49152, 49153, 6000000]) test(`incremental helper verifies ${size} bytes and leases exact originals`, async () => {
  const s = await sink(), bytes = Buffer.alloc(size, 65);
  try {
    const ready = await prepare(s, bytes);
    assert.equal(ready.type, 'prepared'); assert.equal(ready.decodedBytes, size);
    const file = await s.send({ type: 'commit', mode: 'lease' });
    assert.equal(file.type, 'committed'); assert.deepEqual(await readFile(file.path), bytes);
    assert.equal((await stat(file.path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(file.path, '..'))).mode & 0o777, 0o700);
    s.child.stdin.end(); await s.exited;
    assert.deepEqual(await readdir(s.directory), []);
  } finally { await s.close(); }
});
test('sink prepares normalized PNG, checks dimensions, and can discard spool without a launch', async () => {
  const s = await sink(), bytes = detailedPNG(120, 80).png;
  try {
    assert.equal((await prepare(s, bytes, value(bytes, true))).type, 'prepared');
    assert.equal((await s.send({ type: 'commit', mode: 'discard' })).type, 'discarded');
    await s.exited; assert.deepEqual(await readdir(s.directory), []);
  } finally { await s.close(); }
});
for (const invalid of ['pad', 'digest', 'sequence', 'text', 'early', 'dimensions'] as const) test(`sink rejects ${invalid} before exposing a file or save`, async () => {
  const s = await sink(), bytes = invalid === 'dimensions' ? detailedPNG(120, 80).png : Buffer.from('A'), v = value(bytes, invalid === 'dimensions');
  try {
    await s.receive();
    if (invalid === 'digest') v.body.payload.sha256 = '0'.repeat(64);
    if (invalid === 'text') (v.body as any).text = false;
    if (invalid === 'dimensions') (v.body as any).width = 121;
    await s.send({ type: 'begin', value: v });
    if (invalid === 'early') s.child.stdin.write(JSON.stringify({ type: 'commit', mode: 'lease' }) + '\n');
    else {
      s.child.stdin.write(JSON.stringify({ type: 'chunk', seq: invalid === 'sequence' ? 1 : 0, offset: 0, decodedBytes: bytes.length,
        data: invalid === 'pad' ? 'QR==' : bytes.toString('base64') }) + '\n');
      if (!['pad', 'sequence'].includes(invalid)) { await s.receive(); s.child.stdin.write('{"type":"prepare"}\n'); }
    }
    const [code] = await s.exited; assert.equal(code, 1);
    assert.deepEqual(await readdir(s.directory), []);
  } finally { await s.close(); }
});
test('save keeps exact committed bytes, rejects existing files/symlinks, and never deletes them', async () => {
  for (const existing of ['none', 'file', 'symlink'] as const) {
    const s = await sink(), bytes = Buffer.from('AAAA'), destination = join(s.directory, 'saved');
    try {
      if (existing === 'file') await writeFile(destination, 'USER WORK');
      if (existing === 'symlink') { await writeFile(join(s.directory, 'target'), 'USER WORK'); await symlink('target', destination); }
      await prepare(s, bytes);
      s.child.stdin.write(JSON.stringify({ type: 'commit', mode: 'save', path: destination }) + '\n');
      if (existing === 'none') { assert.equal((await s.receive()).type, 'committed'); await s.exited; assert.deepEqual(await readFile(destination), bytes); }
      else { assert.equal((await s.exited)[0], 1); assert.equal(await readFile(destination, 'utf8'), 'USER WORK'); }
    } finally { await s.close(); }
  }
});
test('independent bundled helper obeys the shared canonical and original/raster metadata boundaries', async () => {
  const fixture = JSON.parse(await readFile('test/contract-boundaries.json', 'utf8'));
  assert.equal(fixture.version, 1);
  for (const row of fixture.canonical) {
    const s = await sink();
    try {
      await s.receive();
      const v = value(Buffer.alloc(row.bytes));
      await s.send({ type: 'begin', value: v });
      if (row.bytes === 0) assert.equal((await s.send({ type: 'prepare' })).type, 'prepared');
      else {
        const sent = s.send({ type: 'chunk', seq: 0, offset: 0, decodedBytes: row.bytes, data: row.data });
        if (row.valid) assert.equal((await sent).type, 'chunk'); else await assert.rejects(sent);
      }
    } finally { await s.close(); }
  }
  for (const kind of ['original', 'png']) for (const delta of [-1, 0, 1]) {
    const s = await sink(), limit = kind === 'png' ? fixture.limits.rasterBytes : fixture.limits.originalBytes;
    try {
      await s.receive();
      const v = value(kind === 'png' ? detailedPNG(120, 80).png : Buffer.alloc(1), kind === 'png');
      v.meta.sourceBytes = limit + delta;
      if (kind === 'original') {
        v.body.decodedBytes = limit + delta;
        v.body.payload.chunks = Math.ceil((limit + delta) / fixture.limits.chunkBytes);
        v.body.payload.encodedBytes = 4 * Math.ceil((limit + delta) / 3);
      }
      const sent = s.send({ type: 'begin', value: v });
      if (delta <= 0) assert.equal((await sent).type, 'begun'); else await assert.rejects(sent);
    } finally { await s.close(); }
  }
  for (const kind of ['text', 'png']) for (const delta of [-1, 0, 1]) {
    const s = await sink(), bytes = (kind === 'text' ? fixture.limits.textBytes : fixture.limits.pngBytes) + delta;
    try {
      await s.receive();
      const v = value(kind === 'png' ? detailedPNG(120, 80).png : Buffer.from('A'), kind === 'png');
      v.body.decodedBytes = bytes;
      if (kind === 'text') v.meta.sourceBytes = bytes;
      v.body.payload.chunks = Math.ceil(bytes / fixture.limits.chunkBytes);
      v.body.payload.encodedBytes = 4 * Math.ceil(bytes / 3);
      const sent = s.send({ type: 'begin', value: v });
      if (delta <= 0) assert.equal((await sent).type, 'begun'); else await assert.rejects(sent);
    } finally { await s.close(); }
  }
  for (const delta of [-1, 0, 1]) {
    const s = await sink(), lines = fixture.limits.textLines + delta;
    const bytes = Buffer.from('A\n'.repeat(lines - 1) + 'A'), v = value(bytes);
    (v.body as { text: boolean }).text = true;
    try {
      if (delta <= 0) assert.equal((await prepare(s, bytes, v)).type, 'prepared');
      else await assert.rejects(prepare(s, bytes, v), 'helper independently rejects an incorrect text claim beyond the line ceiling');
    } finally { await s.close(); }
  }
});
