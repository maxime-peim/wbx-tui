import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, stat, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { MessageAttachments, ATTACHMENT_LIMITS, attachmentName, attachmentText, type OpenedAttachment } from '../src/message-attachments.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { serializeEditorOutput } from '../src/editor-output.js';

const url = 'https://webexapis.com/v1/contents/LOCAL-ATTACHMENT';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const file: OpenedAttachment = { id: 'a'.repeat(64), name: 'example.txt', mime: 'text/plain', size: 5, text: true, data: Buffer.from('Hello').toString('base64') };
test('attachment names are inert basenames and text detection rejects binaries, unsafe controls, malformed UTF-8 and display overflows', () => {
  assert.equal(attachmentName('attachment; filename="../../notes.txt"'), 'notes.txt');
  assert.equal(attachmentName("attachment; filename=x; filename*=UTF-8''..%2Fexample.py"), 'example.py');
  assert.equal(attachmentName('attachment; filename="..\\--evil|q!.txt"'), 'evil_q_.txt');
  assert.equal(attachmentName('attachment; filename="..."'), 'attachment');
  assert.equal(attachmentName("attachment; filename=normal.txt; filename*=UTF-8''%ZZ"), 'normal.txt');
  assert.ok(attachmentText(Buffer.from('print("hello")\r\n# vim: set shell=PRIVATE:\n')));
  for (const bytes of [Buffer.from([0, 1]), Buffer.from([0xc0, 0xaf]), Buffer.from('\x1b[31m'), Buffer.alloc(ATTACHMENT_LIMITS.textBytes + 1, 65), Buffer.from('\n'.repeat(20_000))]) assert.equal(attachmentText(bytes), false);
});
test('history registers bounded attachment identities without fetching or exposing URLs, headers or tokens', async () => {
  let reads = 0;
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async () => {
    reads++; return new Response(JSON.stringify({ items: [{ id: 'm', roomId: 'room', files: [url, url, 'https://evil/PRIVATE'] }, { id: 'foreign', roomId: 'elsewhere', files: [url] }] }));
  });
  try {
    const page = await api.history('room'); assert.equal(reads, 1); assert.equal(page.items.length, 1);
    assert.equal(page.items[0]!.attachments!.length, 1); assert.deepEqual(Object.keys(page.items[0]!.attachments![0]!), ['id']);
    assert.ok(!/https|PRIVATE/.test(JSON.stringify(page)));
  } finally { api.close(); }
});
test('explicit attachment GET authenticates only the registered Webex endpoint and transfers exact bytes once, without decoding or caching content', async () => {
  let reads = 0;
  const bytes = Buffer.from([0, 255, 128, 13, 10]);
  const source = new MessageAttachments(() => 'PRIVATE-TOKEN', async (target, options) => {
    reads++; assert.equal(target, url); assert.equal(options!.method, 'GET'); assert.equal(options!.redirect, 'error');
    assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer PRIVATE-TOKEN');
    return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="report.pdf"' } });
  });
  try {
    const refs = source.register([url]); assert.equal(reads, 0);
    const opened = await source.open(refs[0]!.id, new AbortController().signal);
    assert.deepEqual(opened, { id: refs[0]!.id, name: 'report.pdf', mime: 'application/pdf', size: bytes.length, text: false, data: bytes.toString('base64') });
    assert.equal(reads, 1); assert.deepEqual(source.register([url]), refs); assert.ok(!JSON.stringify(opened).includes('PRIVATE'));
    source.close(); await assert.rejects(source.open(refs[0]!.id, new AbortController().signal)); assert.equal(reads, 1);
  } finally { source.close(); }
});
test('redirects, partial responses, errors, oversized declared/streamed bodies, expired consent and forged identities fail closed', async () => {
  for (const response of [new Response('PRIVATE', { status: 302, headers: { location: 'https://evil' } }), new Response('PARTIAL', { status: 206 }),
    new Response('PRIVATE', { status: 403 }), new Response('x', { headers: { 'content-length': String(ATTACHMENT_LIMITS.bytes + 1) } }),
    new Response(new Uint8Array(ATTACHMENT_LIMITS.bytes + 1), { headers: { 'content-length': '1' } })]) {
    let reads = 0;
    const source = new MessageAttachments(() => 'PRIVATE-TOKEN', async () => { reads++; return response; });
    try {
      const id = source.register([url])[0]!.id;
      await assert.rejects(source.open('b'.repeat(64), new AbortController().signal));
      await assert.rejects(source.open(id, AbortSignal.abort())); assert.equal(reads, 0);
      await assert.rejects(source.open(id, new AbortController().signal), error => error instanceof Error && !error.message.includes('PRIVATE'));
      assert.equal(reads, 1);
    } finally { source.close(); }
  }
});
test('attachment deadline releases callers but blocks replacement reads until noncooperative transport settles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred<Response>(); let reads = 0;
  const source = new MessageAttachments(() => 'PRIVATE-TOKEN', async () => { reads++; return gate.promise; });
  try {
    const id = source.register([url])[0]!.id, signal = new AbortController().signal;
    const pending = source.open(id, signal), rejected = assert.rejects(pending);
    t.mock.timers.tick(ATTACHMENT_LIMITS.timeout); await rejected;
    await assert.rejects(source.open(id, signal)); assert.equal(reads, 1);
    gate.resolve(new Response('late PRIVATE'));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(source.register([url]), [{ id }]);
  } finally { source.close(); }
});
test('attachment references remain bounded and do not admit arbitrary content URLs', () => {
  const source = new MessageAttachments(() => 'PRIVATE');
  try {
    assert.deepEqual(source.register(['https://evil', 'file:///etc/passwd', url + '?token=PRIVATE']), []);
    assert.equal(source.register(Array.from({ length: 30 }, (_, i) => url + i)).length, 10);
    const old = source.register([url])[0]!;
    for (let i = 0; i < 1100; i++) source.register([url + i]);
    const entries = (source as unknown as { entries: Map<string, string> }).entries;
    assert.equal(entries.size, 1000); assert.equal(entries.has(old.id), false);
  } finally { source.close(); }
});
test('stream cancellation and stalled cleanup keep attachment admission bounded after the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cleanup = deferred<void>(); let reads = 0, canceled = 0;
  const source = new MessageAttachments(() => 'PRIVATE-TOKEN', async () => {
    reads++; return new Response(new ReadableStream({ cancel() { canceled++; return cleanup.promise; } }));
  });
  try {
    const id = source.register([url])[0]!.id, signal = new AbortController().signal;
    const pending = source.open(id, signal), rejected = assert.rejects(pending);
    await new Promise<void>(resolve => setImmediate(resolve));
    t.mock.timers.tick(ATTACHMENT_LIMITS.timeout); await rejected;
    await assert.rejects(source.open(id, signal)); assert.equal(reads, 1); assert.equal(canceled, 1);
    cleanup.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
  } finally { cleanup.resolve(); source.close(); }
});
test('attachment reads require loaded room/message/file membership and cancel on destination changes, reload or close without posts/receipts', async () => {
  for (const change of ['space', 'reload', 'close']) {
    const gate = deferred<OpenedAttachment>(); let reads = 0, signal: AbortSignal | undefined;
    const store = new MessagingStore({ rooms: async () => ({ items: ['a', 'b'].map(id => ({ id, title: id, type: 'group' as const, lastActivity: '' })) }),
      history: async () => ({ items: [{ id: 'm', author: 'Local', created: '', text: '', attachments: [{ id: file.id }] }] }),
      openAttachment: async (_id, abort) => { reads++; signal = abort; return gate.promise; }, send: async () => assert.fail('No posts.'), close() {} }, 0);
    try {
      await store.loadRooms(); await store.select('a');
      for (const args of [['b', 'm', file.id], ['a', 'foreign', file.id], ['a', 'm', 'b'.repeat(64)]]) await assert.rejects(store.openAttachment(...args as [string, string, string]));
      assert.equal(reads, 0);
      const pending = store.openAttachment('a', 'm', file.id), rejected = assert.rejects(pending);
      await assert.rejects(store.openAttachment('a', 'm', file.id)); assert.equal(reads, 1);
      if (change === 'close') store.close(); else await store.select(change === 'space' ? 'b' : 'a', true);
      assert.equal(signal?.aborted, true); const retained = store.messages;
      gate.resolve(file); await rejected; assert.equal(store.messages, retained);
    } finally { store.close(); }
  }
});
test('attachment RPC admits identities only, negotiates support and keeps large data out of replay retention and snapshots', async t => {
  const params = { roomId: 'room', messageId: 'm', attachmentId: file.id };
  for (const invalid of [{ ...params, url }, { ...params, path: '/tmp/PRIVATE' }, { ...params, token: 'PRIVATE' }, { ...params, attachmentId: url }, { ...params, roomId: '' }]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'messages.attachmentOpen', params: invalid }));
  }
  const engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [];
  let reads = 0;
  t.mock.method(engine, 'openAttachment', async () => { reads++; return file; });
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  const wire = (id: number, method: string, params: object) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 })); assert.ok(output.at(-1).result.capabilities.includes('message-attachments'));
    const request = wire(2, 'messages.attachmentOpen', params);
    await rpc.receive(request); assert.equal(output.at(-1).result, file);
    await rpc.receive(request); assert.equal(output.at(-1).error.code, -32002); assert.equal(reads, 1);
    const completed = (rpc as unknown as { completed: Map<number, unknown> }).completed.get(2);
    assert.ok(!JSON.stringify(completed).includes(file.data)); assert.ok(!JSON.stringify(engine.snapshot()).includes(file.data));
    assert.ok(serializeEditorOutput({ jsonrpc: '2.0', id: 3, result: { ...file, size: 6_000_000, data: Buffer.alloc(6_000_000).toString('base64') } }));
  } finally { await rpc.close(); }
});

test('real API projection -> store -> engine -> RPC carries original bytes without auth changes, POSTs, receipts or content snapshots', async () => {
  const calls: string[] = [], engine = new EditorEngine(), meetings = new EditorMeetings(), output: any[] = [];
  const api = new WebexMessagingAPI(() => 'PRIVATE-TOKEN', async (target, options) => {
    const path = new URL(String(target)).pathname; calls.push(path);
    assert.notEqual(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
    if (path === '/v1/rooms') return new Response(JSON.stringify({ items: [{ id: 'room', title: 'Room', type: 'group' }] }));
    if (path === '/v1/messages') return new Response(JSON.stringify({ items: [{ id: 'm', roomId: 'room', text: '', files: [url] }] }));
    assert.equal(String(target), url);
    return new Response('Hello', { headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename=example.txt' } });
  });
  const store = new MessagingStore(api, 0);
  Object.assign(engine, { store, state: 'ready' }); // Synthetic owner, no OAuth/startup side effects.
  const rpc = new EditorRPC(engine, meetings, value => output.push(value));
  const wire = (id: number, method: string, params: object = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  try {
    await rpc.receive(wire(1, 'hello', { version: 1 })); await rpc.receive(wire(2, 'rooms.list'));
    await rpc.receive(wire(3, 'rooms.select', { roomId: 'room' }));
    assert.deepEqual(calls, ['/v1/rooms', '/v1/messages']);
    const attachmentId = engine.snapshot().messages[0]!.attachments![0]!.id;
    await rpc.receive(wire(4, 'messages.attachmentOpen', { roomId: 'room', messageId: 'm', attachmentId }));
    assert.deepEqual(output.at(-1).result, { ...file, id: attachmentId });
    assert.deepEqual(calls, ['/v1/rooms', '/v1/messages', '/v1/contents/LOCAL-ATTACHMENT']);
    const snapshot = JSON.stringify(engine.snapshot()); assert.ok(!snapshot.includes(file.data)); assert.ok(!snapshot.includes(url)); assert.ok(!snapshot.includes('PRIVATE'));
    await rpc.receive(wire(4, 'messages.attachmentOpen', { roomId: 'room', messageId: 'm', attachmentId }));
    assert.equal(calls.length, 3); assert.equal(output.at(-1).error.code, -32002);
  } finally { await rpc.close(); }
});

async function helper(directory: string, value: object, lease = false) {
  const child = spawn(process.execPath, ['scripts/attachment-lease.mjs'], { env: { ...process.env, TMPDIR: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
  const done = once(child, 'exit');
  let output = '', stderr = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stderr.on('data', part => { stderr += part; });
  const line = new Promise<any>(resolve => { child.stdout.on('data', part => { output += part; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]!)); }); child.once('exit', () => resolve(undefined)); });
  if (lease) child.stdin.write(JSON.stringify(value) + '\n'); else child.stdin.end(JSON.stringify(value) + '\n');
  return { child, done, result: await line, stderr: () => stderr };
}
test('attachment helper leases exact private bytes, cleans on EOF, and explicit download preserves bytes without overwrite/symlink writes', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-attachment-helper-');
  const bytes = Buffer.from([0, 255, 65, 10]), value = { mode: 'lease', name: 'literal;not-a-command.pdf', data: bytes.toString('base64') };
  try {
    const invalid = await helper(directory, value); assert.equal((await invalid.done)[0], 1); assert.equal(invalid.result, undefined);
    const leased = await helper(directory, { ...value, name: 'report.pdf' }, true);
    assert.ok(leased.result); assert.equal(leased.result.text, false);
    assert.deepEqual(await readFile(leased.result.path), bytes);
    assert.equal((await stat(leased.result.path)).mode & 0o777, 0o600); assert.equal((await stat(dirname(leased.result.path))).mode & 0o777, 0o700);
    leased.child.stdin.end(); assert.equal((await leased.done)[0], 0);
    await assert.rejects(stat(leased.result.path)); assert.deepEqual(await readdir(directory), []);
    const path = join(directory, 'download.pdf'), saved = await helper(directory, { ...value, name: 'report.pdf', mode: 'save', path });
    assert.equal((await saved.done)[0], 0); assert.equal(saved.result.path, path); assert.deepEqual(await readFile(path), bytes);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const retry = await helper(directory, { ...value, name: 'report.pdf', mode: 'save', path, data: Buffer.from('OVERWRITE').toString('base64') });
    assert.equal((await retry.done)[0], 1); assert.deepEqual(await readFile(path), bytes);
    const link = join(directory, 'link.pdf'); await symlink(path, link);
    const linked = await helper(directory, { ...value, name: 'report.pdf', mode: 'save', path: link });
    assert.equal((await linked.done)[0], 1); assert.deepEqual(await readFile(path), bytes);
    const badBase64 = await helper(directory, { ...value, name: 'safe', data: 'AB==' }); assert.equal((await badBase64.done)[0], 1);
    const escape = await helper(directory, { ...value, name: '../escape' }); assert.equal((await escape.done)[0], 1);
    assert.equal(leased.stderr() + saved.stderr() + retry.stderr() + linked.stderr(), '');
    await writeFile(join(directory, 'user-owned'), 'Kept');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
