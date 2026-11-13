import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { EventEmitter } from 'node:events';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdtemp, writeFile, readFile, readdir, rm, symlink, link, truncate, rename } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Uploads, UploadFailure, UPLOAD_LIMITS, type UploadOptions } from '../src/uploads.js';
import { postUpload, multipart, type UploadRequest } from '../src/upload-http.js';
const binding = { roomId: 'room', parentId: 'parent', draftId: 'draft' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const until = async (check: () => boolean) => {
  const start = Date.now();
  while (!check() && Date.now() - start < 3000) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'physical work settled within the fixture deadline');
};
async function fixture(options: Omit<UploadOptions, 'temporaryRoot'> = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-upload-test-'), path = join(directory, 'résumé "literal".txt');
  await writeFile(path, 'Original snapshot 😀');
  const owner = new Uploads({ ...options, temporaryRoot: directory });
  return { directory, path, owner, close: async () => { owner.reset(); await until(() => !owner.diagnostics().references && !owner.diagnostics().cleaning); await rm(directory, { recursive: true, force: true }); } };
}
function parseMultipart(body: Buffer, type: string) {
  const boundary = /boundary=([^;]+)/.exec(type)![1]!, delimiter = Buffer.from('--' + boundary);
  const parts: { name: string; filename?: string; bytes: Buffer }[] = [];
  let at = 0;
  while (true) {
    const first = body.indexOf(delimiter, at);
    if (first < 0 || body.subarray(first + delimiter.length, first + delimiter.length + 2).toString() === '--') break;
    const headersEnd = body.indexOf('\r\n\r\n', first), next = body.indexOf(delimiter, headersEnd);
    assert.ok(headersEnd > first && next > headersEnd);
    const headers = body.subarray(first, headersEnd).toString('utf8');
    const name = /name="([^"]+)"/.exec(headers)![1]!, filename = /filename="((?:[^"\\]|\\.)*)"/.exec(headers)?.[1]?.replace(/\\(.)/g, '$1');
    parts.push({ name, ...(filename ? { filename } : {}), bytes: body.subarray(headersEnd + 4, next - 2) });
    at = next;
  }
  return parts;
}
test('staging returns only bounded metadata and a read-only anonymous stable snapshot', async () => {
  const f = await fixture();
  try {
    const staged = await f.owner.stage(f.path, binding);
    assert.deepEqual(Object.keys(staged).sort(), ['attachmentId', 'bytes', 'name']);
    assert.equal(staged.name, 'résumé "literal".txt');
    assert.match(staged.attachmentId, /^[a-f0-9]{32}$/);
    const entry = (f.owner as any).entries.get(staged.attachmentId);
    assert.equal((await entry.file.stat()).nlink, 0);
    assert.equal((await entry.file.stat()).mode & 0o077, 0);
    await assert.rejects(entry.file.write(Buffer.from('Tamper')), /EBADF/);
    const directories = (await readdir(f.directory)).filter(name => name.startsWith('wbx-upload-'));
    assert.equal(directories.length, 1); assert.deepEqual(await readdir(join(f.directory, directories[0]!)), []);
    await writeFile(f.path, 'Changed source is NOT SENT');
    await rename(f.path, f.path + '.original');
    await writeFile(f.path, 'Replaced inode is NOT SENT');
    let bytes!: Buffer;
    await f.owner.send(staged.attachmentId, binding, () => true, async (source, signal, submitted) => {
      submitted(); const chunks = []; for await (const chunk of source.read(signal)) chunks.push(chunk);
      bytes = Buffer.concat(chunks); return 'ACK';
    });
    assert.equal(bytes.toString(), 'Original snapshot 😀');
    assert.equal(f.owner.diagnostics().references, 0);
  } finally { await f.close(); }
});
test('runtime parameter intersections never leak paths, draft text or unknown fields through progress', async () => {
  const f = await fixture(), progress: unknown[] = [];
  try {
    f.owner.onProgress = value => progress.push(value);
    await f.owner.stage(f.path, { ...binding, path: f.path, text: 'PRIVATE DRAFT' } as typeof binding);
    assert.ok(progress.length);
    assert.ok(!JSON.stringify(progress).includes('path')); assert.ok(!JSON.stringify(progress).includes('PRIVATE'));
    assert.deepEqual(Object.keys(progress[0] as object).sort(), ['attachmentId', 'bytes', 'draftId', 'parentId', 'phase', 'roomId', 'total']);
  } finally { await f.close(); }
});
test('removing a staged reference while its POST is admitted does not cancel or retarget that operation', async () => {
  const f = await fixture(), gate = deferred<void>(), started = deferred<void>();
  try {
    const staged = await f.owner.stage(f.path, binding);
    const pending = f.owner.send(staged.attachmentId, binding, () => true, async (source, signal, submitted) => {
      submitted(); started.resolve(); await gate.promise;
      assert.equal(signal.aborted, false);
      const chunks = []; for await (const chunk of source.read(signal)) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), 'Original snapshot 😀'); return 'ACK';
    });
    await started.promise; f.owner.remove(staged.attachmentId, binding);
    assert.ok(f.owner.diagnostics().sending); assert.equal(f.owner.diagnostics().references, 1);
    gate.resolve(); assert.equal(await pending, 'ACK'); assert.equal(f.owner.diagnostics().references, 0);
  } finally { gate.resolve(); await f.close(); }
});
for (const kind of ['symlink', 'parent-link', 'hardlink', 'directory', 'oversize'] as const) test(`staging refuses ${kind} without a file capability or retained reservation`, async () => {
  const f = await fixture();
  try {
    let path = f.path;
    if (kind === 'symlink') { path = join(f.directory, 'alias'); await symlink(f.path, path); }
    if (kind === 'parent-link') { const directory = join(f.directory, 'alias'); await symlink(f.directory, directory); path = join(directory, 'résumé "literal".txt'); }
    if (kind === 'hardlink') await link(f.path, join(f.directory, 'hardlink'));
    if (kind === 'directory') path = f.directory;
    if (kind === 'oversize') await truncate(f.path, UPLOAD_LIMITS.fileBytes + 1);
    await assert.rejects(f.owner.stage(path, binding), UploadFailure);
    assert.equal(f.owner.diagnostics().references, 0);
  } finally { await f.close(); }
});
test('a file changed during staging is refused rather than represented by name/size alone', async () => {
  const f = await fixture(); let changed = false;
  try {
    f.owner.onProgress = progress => { if (!changed && progress.phase === 'stage') { changed = true; writeFileSync(f.path, 'Changed snapshot  😀'); } };
    await assert.rejects(f.owner.stage(f.path, binding), UploadFailure);
    assert.ok(changed); assert.equal(f.owner.diagnostics().references, 0);
  } finally { await f.close(); }
});
test('destination/draft identity is exact; removal never sends and simultaneous stages are not queued', async () => {
  const f = await fixture();
  try {
    const first = f.owner.stage(f.path, binding);
    await assert.rejects(f.owner.stage(f.path, { ...binding, draftId: 'other' }), UploadFailure);
    const staged = await first; let calls = 0;
    for (const patch of [{ roomId: 'other' }, { parentId: undefined }, { draftId: 'other' }]) await assert.rejects(
      f.owner.send(staged.attachmentId, { ...binding, ...patch }, () => true, async () => { calls++; }), UploadFailure);
    assert.throws(() => f.owner.remove(staged.attachmentId, { ...binding, draftId: 'other' }));
    f.owner.remove(staged.attachmentId, binding);
    await until(() => f.owner.diagnostics().references === 0);
    assert.equal(calls, 0);
  } finally { await f.close(); }
});
test('staged reference and aggregate disk budgets include all anonymous snapshots', async () => {
  const f = await fixture();
  try {
    await truncate(f.path, UPLOAD_LIMITS.fileBytes);
    const first = await f.owner.stage(f.path, binding);
    await f.owner.stage(f.path, { ...binding, draftId: 'second' });
    assert.equal(f.owner.diagnostics().bytes, UPLOAD_LIMITS.totalBytes);
    await writeFile(f.path, 'x');
    await assert.rejects(f.owner.stage(f.path, { ...binding, draftId: 'third' }), UploadFailure);
    f.owner.remove(first.attachmentId, binding);
    await until(() => f.owner.diagnostics().bytes === UPLOAD_LIMITS.fileBytes);
    f.owner.reset(); await until(() => f.owner.diagnostics().references === 0 && !f.owner.diagnostics().cleaning);
    await writeFile(f.path, '');
    for (let i = 0; i < 8; i++) await f.owner.stage(f.path, { ...binding, draftId: 'empty-' + i });
    assert.equal(f.owner.diagnostics().references, 8);
    await assert.rejects(f.owner.stage(f.path, { ...binding, draftId: 'overflow' }), UploadFailure);
  } finally { await f.close(); }
});
test('cancel/reset retain a stubborn physical upload slot while permitting a separately bounded replacement snapshot', async () => {
  const f = await fixture(), gate = deferred<string>(), started = deferred<void>();
  try {
    const staged = await f.owner.stage(f.path, binding);
    const pending = f.owner.send(staged.attachmentId, binding, () => true, async (_, __, submitted) => {
      submitted(); started.resolve(); return gate.promise;
    });
    await started.promise; f.owner.cancel(binding.draftId);
    await assert.rejects(pending, (error: UploadFailure) => error.reason === 'unknown');
    assert.ok(f.owner.diagnostics().sending);
    f.owner.reset();
    const replacement = await f.owner.stage(f.path, { ...binding, draftId: 'replacement' });
    await assert.rejects(f.owner.send(replacement.attachmentId, { ...binding, draftId: 'replacement' }, () => true, async () => 'BAD'), UploadFailure);
    gate.resolve('LATE ACK'); await until(() => !f.owner.diagnostics().sending);
    assert.equal(f.owner.diagnostics().references, 1);
  } finally { gate.resolve('CLEANUP'); await f.close(); }
});
test('pre-transmission deadline is failed and keeps native stat admission until its actual completion', async t => {
  const f = await fixture(), gate = deferred<any>();
  try {
    const staged = await f.owner.stage(f.path, binding), entry = (f.owner as any).entries.get(staged.attachmentId);
    const info = await entry.file.stat();
    t.mock.method(entry.file, 'stat', () => gate.promise);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const pending = f.owner.send(staged.attachmentId, binding, () => true, async () => { calls++; return 'BAD'; });
    t.mock.timers.tick(UPLOAD_LIMITS.sendMs);
    await assert.rejects(pending, (error: UploadFailure) => error.reason === 'failed');
    assert.equal(calls, 0); assert.ok(f.owner.diagnostics().sending);
    f.owner.reset(); gate.resolve(info); await tick(); await tick();
    t.mock.timers.reset();
    await until(() => !f.owner.diagnostics().sending);
  } finally { gate.resolve(undefined); t.mock.timers.reset(); await f.close(); }
});
test('canceled staging keeps physical source-close admission across reset until cleanup really settles', async t => {
  const f = await fixture(), gate = deferred<void>(), closing = deferred<void>();
  let hooked = false;
  try {
    f.owner.onProgress = value => {
      if (hooked || value.phase !== 'stage') return;
      hooked = true;
      const input = (f.owner as any).staging.retained[0], original = input.close.bind(input);
      t.mock.method(input, 'close', async () => { closing.resolve(); await gate.promise; await original(); });
    };
    const pending = f.owner.stage(f.path, binding);
    await closing.promise;
    f.owner.cancel(binding.draftId, 'stage');
    await assert.rejects(pending, (error: UploadFailure) => error.reason === 'failed');
    f.owner.reset();
    assert.ok(f.owner.diagnostics().staging);
    await assert.rejects(f.owner.stage(f.path, { ...binding, draftId: 'replacement' }), UploadFailure);
    gate.resolve(); await until(() => !f.owner.diagnostics().staging && !f.owner.diagnostics().cleaning);
    assert.equal(f.owner.diagnostics().references, 0);
  } finally { gate.resolve(); await f.close(); }
});
function syntheticResponse(chunks: Buffer[], stubborn = false) {
  let yielded = 0;
  const incoming = Object.assign(new EventEmitter(), { statusCode: 201,
    destroy() { if (!stubborn) incoming.emit('close'); return incoming; },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) { yielded++; yield chunk; } },
  });
  const request: UploadRequest = (options, listener) => {
    assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.path, '/v1/messages');
    let closed = false;
    const client = Object.assign(new EventEmitter(), {
      write(_: Uint8Array, callback: (error?: Error) => void) { queueMicrotask(() => callback()); return true; },
      end(callback: () => void) { queueMicrotask(() => { listener(incoming as any); callback(); }); return client; },
      destroy() { if (!closed) { closed = true; client.emit('close'); } return client; },
    });
    return client as any;
  };
  return { incoming, request, yielded: () => yielded };
}
for (const kind of ['bytes', 'reads', 'utf8'] as const) test(`acknowledgment ${kind} bounds fail closed with no second submission`, async () => {
  const f = await fixture();
  const chunks = kind === 'bytes' ? [Buffer.alloc(262145)] : kind === 'reads' ? Array.from({ length: 5000 }, () => Buffer.from(' '))
    : [Buffer.from([0xc3, 0x28])];
  const synthetic = syntheticResponse(chunks);
  try {
    const staged = await f.owner.stage(f.path, binding);
    await assert.rejects(f.owner.send(staged.attachmentId, binding, () => true, (source, signal, submitted) =>
      postUpload(source, { roomId: 'room', text: '' }, 'SYNTHETIC', signal, submitted, synthetic.request)),
    (error: UploadFailure) => error.reason === 'unknown');
    assert.ok(synthetic.yielded() <= 1025);
    assert.equal(f.owner.diagnostics().references, 1);
  } finally { await f.close(); }
});
test('stubborn response cleanup remains physically admitted after logical cancel and cannot overlap a replacement POST', async () => {
  const f = await fixture(), synthetic = syntheticResponse([Buffer.from('INVALID')], true);
  try {
    const staged = await f.owner.stage(f.path, binding);
    const pending = f.owner.send(staged.attachmentId, binding, () => true, (source, signal, submitted) =>
      postUpload(source, { roomId: 'room', text: '' }, 'SYNTHETIC', signal, submitted, synthetic.request));
    await until(() => synthetic.yielded() === 1);
    f.owner.cancel(binding.draftId);
    await assert.rejects(pending, (error: UploadFailure) => error.reason === 'unknown');
    assert.ok(f.owner.diagnostics().sending);
    await assert.rejects(f.owner.send(staged.attachmentId, binding, () => true, async () => 'BAD'), UploadFailure);
    synthetic.incoming.emit('close'); await until(() => !f.owner.diagnostics().sending);
  } finally { synthetic.incoming.emit('close'); await f.close(); }
});
for (const variant of ['small', 'empty', 'limit'] as const) test(`actual multipart receiver gets exact literal fields, Unicode filename and bytes once (${variant})`, async () => {
  const f = await fixture(); let server: Server | undefined; const requests: { body: Buffer; type: string; length: string | undefined }[] = [];
  try {
    const empty = variant === 'empty';
    if (empty) await writeFile(f.path, '');
    if (variant === 'limit') await truncate(f.path, UPLOAD_LIMITS.fileBytes);
    const expected = await readFile(f.path), staged = await f.owner.stage(f.path, binding);
    server = createServer(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      requests.push({ body: Buffer.concat(chunks), type: String(req.headers['content-type']), length: req.headers['content-length'] });
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'ack', roomId: 'room', parentId: 'parent' }));
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const request: UploadRequest = (options, listener) => {
      assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.path, '/v1/messages'); assert.equal(options.agent, false);
      return httpRequest({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
    };
    const text = empty ? '' : 'Text <tag> & literal;$(never-run)\n😀';
    const result = await f.owner.send(staged.attachmentId, binding, () => true, (source, signal, submitted) =>
      postUpload(source, { roomId: 'room', parentId: 'parent', text }, 'SYNTHETIC', signal, submitted, request));
    assert.equal(result.id, 'ack'); assert.equal(requests.length, 1);
    const recording = requests[0]!, parts = parseMultipart(recording.body, recording.type);
    assert.equal(recording.body.length, Number(recording.length));
    assert.deepEqual(parts.map(part => part.name), empty ? ['roomId', 'parentId', 'files'] : ['roomId', 'parentId', 'text', 'files']);
    assert.equal(parts[0]!.bytes.toString(), 'room'); assert.equal(parts[1]!.bytes.toString(), 'parent');
    if (!empty) assert.equal(parts[2]!.bytes.toString(), text);
    assert.equal(parts.at(-1)!.filename, staged.name); assert.deepEqual(parts.at(-1)!.bytes, expected);
  } finally { server?.closeAllConnections(); await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await f.close(); }
});
for (const status of [401, 429, 307, 500]) test(`HTTP ${status} never follows a redirect, refreshes auth or repeats the POST`, async () => {
  const f = await fixture(); let calls = 0; const server = createServer(async (req, res) => {
    calls++; for await (const _ of req) { /* A known response, not an early socket reset race. */ }
    res.writeHead(status, { Location: '/would-replay', 'Retry-After': '0' }); res.end('PRIVATE ERROR');
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const request: UploadRequest = (options, listener) => httpRequest({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
    const staged = await f.owner.stage(f.path, binding);
    await assert.rejects(f.owner.send(staged.attachmentId, binding, () => true, (source, signal, submitted) =>
      postUpload(source, { roomId: 'room', text: '' }, 'SYNTHETIC', signal, submitted, request)),
    (error: UploadFailure) => error.reason === ([401, 429].includes(status) ? 'failed' : 'unknown') && !error.message.includes('PRIVATE'));
    assert.equal(calls, 1); assert.equal(f.owner.diagnostics().references, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); }
});
test('multipart boundary/envelope stays bounded and rejects malformed fields before submission', () => {
  const body = multipart({ name: 'literal.txt', bytes: UPLOAD_LIMITS.fileBytes }, { roomId: 'room', text: '😀'.repeat(500) });
  assert.ok(body.prefix.length + body.suffix.length <= 8192);
  for (const fields of [{ roomId: '../invalid', text: '' }, { roomId: 'room', text: 'a'.repeat(1001) }, { roomId: 'room', text: '\ud800' }]) assert.throws(() => multipart({ name: 'file', bytes: 1 }, fields), UploadFailure);
});
test('10 MiB staging/streaming records bounded work and event-loop responsiveness without a latency threshold', async t => {
  const f = await fixture(), lag = monitorEventLoopDelay({ resolution: 10 });
  let running = true, turns = 0, chunks = 0, bytes = 0, largest = 0;
  const progress: { phase: string; at: number }[] = [];
  const turn = () => { if (running) { turns++; setImmediate(turn); } };
  try {
    await truncate(f.path, UPLOAD_LIMITS.fileBytes); lag.enable(); setImmediate(turn);
    f.owner.onProgress = value => progress.push({ phase: value.phase, at: performance.now() });
    const begin = performance.now(), staged = await f.owner.stage(f.path, binding), stagedAt = performance.now();
    await f.owner.send(staged.attachmentId, binding, () => true, async (source, signal) => {
      for await (const chunk of source.read(signal)) { chunks++; bytes += chunk.byteLength; largest = Math.max(largest, chunk.byteLength); }
      return 'LOCAL SINK ACK';
    });
    const end = performance.now(); lag.disable();
    assert.equal(bytes, UPLOAD_LIMITS.fileBytes); assert.equal(chunks, 160); assert.equal(largest, UPLOAD_LIMITS.chunkBytes);
    assert.ok(turns > 0, 'filesystem/streaming yielded to other event-loop work');
    t.diagnostic(JSON.stringify({ bytes, chunks, largestChunk: largest, eventLoopTurns: turns, progressEvents: progress.length,
      stageMs: +(stagedAt - begin).toFixed(2), streamMs: +(end - stagedAt).toFixed(2), eventLoopMaxMs: +(lag.max / 1e6).toFixed(2),
      scope: 'synthetic local anonymous snapshot and sink, no latency threshold or live-upload claim' }));
  } finally { running = false; lag.disable(); await f.close(); }
});
test('progress rate is deterministically bounded per operation, independent of wall-clock performance', async () => {
  let clock = 0; const f = await fixture({ now: () => clock += 10 }), updates: { phase: string; at: number }[] = [];
  try {
    await truncate(f.path, UPLOAD_LIMITS.fileBytes);
    f.owner.onProgress = value => updates.push({ phase: value.phase, at: clock });
    const staged = await f.owner.stage(f.path, binding);
    await f.owner.send(staged.attachmentId, binding, () => true, async (source, signal) => {
      for await (const _ of source.read(signal)) { /* Bounded local sink. */ } return 'ACK';
    });
    for (const phase of ['stage', 'send']) {
      const phaseUpdates = updates.filter(value => value.phase === phase);
      assert.ok(phaseUpdates.length >= 2);
      for (let i = 1; i < phaseUpdates.length; i++) assert.ok(phaseUpdates[i]!.at - phaseUpdates[i - 1]!.at >= UPLOAD_LIMITS.progressMs);
    }
  } finally { await f.close(); }
});
