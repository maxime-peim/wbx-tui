import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { Uploads } from '../src/uploads.js';
import { multipart } from '../src/upload-http.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import type { ReadStatusSource } from '../src/read-status.js';
import type { PublicResponse } from '../src/public-rest.js';
import { PublicREST } from '../src/public-rest.js';
import { EventEmitter } from 'node:events';

const binding = { roomId: 'room', parentId: 'root', draftId: 'native-draft' };
const rich = { format: 'markdown' as const };
const bytes = Buffer.from([0, 255, 13, 10, 65, 240, 159, 152, 128]);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const until = async (check: () => boolean) => {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'bounded physical fixture settlement');
};
function parts(body: Buffer, type: string) {
  const boundary = /boundary=([^;]+)/.exec(type)![1]!, delimiter = Buffer.from('--' + boundary);
  const out: { name: string; bytes: Buffer }[] = [];
  let at = 0;
  while (body.subarray(at + delimiter.length, at + delimiter.length + 2).toString() !== '--') {
    assert.deepEqual(body.subarray(at, at + delimiter.length), delimiter);
    const endHeaders = body.indexOf('\r\n\r\n', at), next = body.indexOf(delimiter, endHeaders);
    assert.ok(endHeaders > at && next > endHeaders);
    out.push({ name: /name="([^"]+)"/.exec(body.subarray(at, endHeaders).toString())![1]!,
      bytes: body.subarray(endHeaders + 4, next - 2) });
    at = next;
  }
  assert.equal(body.subarray(at + delimiter.length).toString(), '--\r\n');
  return out;
}
async function fixture(t: TestContext, options: {
  scopes?: string; group?: boolean; status?: number; ack?: (raw: Record<string, unknown>) => unknown;
  member?: (res: ServerResponse, person: string) => void; holdPost?: boolean; source?: ReadStatusSource;
} = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-rich-upload-'), config = join(directory, 'config.json'), path = join(directory, 'literal.bin');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  await writeFile(path, bytes);
  const access = { token: 'INERT', scope: options.scopes ?? 'spark:messages_write spark:memberships_read', expiresAt: Date.now() + 3600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Live/fetch/SDK network forbidden'); });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [
    { id: 'room', title: 'Synthetic', type: options.group === false ? 'direct' as const : 'group' as const, lastActivity: '' },
    { id: 'other', title: 'Other', type: 'group' as const, lastActivity: '' },
  ] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [
    { id: 'root', author: 'Synthetic', text: 'Root', created: '2026-01-01T00:00:00.000Z' },
  ] }));
  const calls: { method: string; path: string; body: Buffer; type: string }[] = [];
  const posted = deferred<ServerResponse>();
  let reply = () => {};
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), type = req.headers['content-type'] ?? '';
    calls.push({ method: req.method!, path: req.url!, body, type });
    assert.equal(req.headers.authorization, 'Bearer INERT');
    if (req.method === 'GET') {
      assert.equal(body.length, 0);
      const url = new URL(req.url!, 'https://webexapis.com');
      assert.equal(url.pathname, '/v1/memberships'); assert.equal(url.searchParams.get('roomId'), 'room');
      assert.equal(url.searchParams.get('max'), '100');
      const person = url.searchParams.get('personId')!;
      if (options.member) options.member(res, person);
      else res.end(JSON.stringify({ items: [{ id: 'member-' + person, roomId: 'room', personId: person }] }));
      return;
    }
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/messages');
    assert.equal(Number(req.headers['content-length']), body.length);
    const values = parts(body, type);
    const ack = { id: 'ack', roomId: 'room', parentId: 'root', created: new Date().toISOString(),
      markdown: values.find(p => p.name === 'markdown')?.bytes.toString(),
      files: ['https://webexapis.com/v1/contents/inert'] };
    reply = () => {
      res.writeHead(options.status ?? 201, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
      res.end(JSON.stringify(options.ack ? options.ack(ack) : ack));
    };
    posted.resolve(res); if (!options.holdPost) reply();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port, uploads = new Uploads({ temporaryRoot: directory });
  const localRequest = (native: any, listener: any) => {
    assert.equal(native.hostname, 'webexapis.com'); assert.equal(native.protocol, 'https:'); assert.equal(native.agent, false);
    return request({ ...native, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  };
  const engine = new EditorEngine(undefined, options.source ? () => options.source! : undefined, undefined, undefined, undefined, undefined,
    { uploads, uploadRequest: localRequest, publicRequest: localRequest });
  const deliveries: any[] = []; engine.on('delivery', value => deliveries.push(value));
  t.after(async () => {
    engine.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await until(() => !uploads.diagnostics().references && !uploads.diagnostics().sending && !uploads.diagnostics().cleaning);
    await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, ...(options.source ? { readStatus: true, notificationPreview: true } : {}) });
  await engine.select('room');
  const staged = await engine.stageUpload(path, binding);
  return { engine, uploads, calls, deliveries, access, staged, path, posted: posted.promise, reply: () => reply(),
    posts: () => calls.filter(call => call.method === 'POST'),
    send: (id: string, text: string, intent: object = rich) => engine.sendUpload(id, text, staged.attachmentId, binding, intent as any) };
}
test('MF14 finite upload RPC accepts only explicit Markdown format/consent with one opaque staged handle', () => {
  const input = { ...binding, requestId: 'one', text: '**rich**', attachmentId: 'a'.repeat(32), ...rich, mentionsAccepted: true };
  const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'uploads.send', params });
  assert.deepEqual(parse(input), { method: 'uploads.send', params: input });
  for (const patch of [{ format: 'plain' }, { format: 'html' }, { mentionsAccepted: 1 }, { allAccepted: 'yes' },
    { text: '' }, { text: ' \n' }, { text: 'x'.repeat(1001) }, { text: '\ud800' }, { markdown: '**other**' },
    { files: ['a'] }, { url: 'https://evil.invalid' }, { personId: 'actor' }]) assert.throws(() => parse({ ...input, ...patch }));
  const plain = { ...binding, requestId: 'plain', text: '', attachmentId: 'a'.repeat(32) };
  assert.equal(parse(plain).method, 'uploads.send');
  assert.throws(() => parse({ ...plain, mentionsAccepted: true }));
});
test('MF14 custom serializer emits exact UTF-8 Markdown, one file and root, without alternate text or extra fields', () => {
  const markdown = '  **résumé 😀**\n`code`\n';
  const value = multipart({ name: 'literal.bin', bytes: bytes.length }, { roomId: 'room', parentId: 'root', text: markdown, ...rich });
  const parsed = parts(Buffer.concat([value.prefix, bytes, value.suffix]), 'multipart/form-data; boundary=' + value.boundary);
  assert.deepEqual(parsed.map(p => p.name), ['roomId', 'parentId', 'markdown', 'files']);
  assert.equal(parsed[2]!.bytes.toString(), markdown); assert.deepEqual(parsed[3]!.bytes, bytes);
});
test('MF14 engine sends one multipart POST, binds format/draft/file and replays no POST for repeated IDs', async t => {
  const f = await fixture(t), text = '  **résumé 😀**\n`code`\n';
  await writeFile(f.path, 'Replacing the selected source cannot alter its staged bytes');
  await f.send('one', text);
  assert.equal(f.posts().length, 1); assert.equal(f.deliveries.at(-1).status, 'sent');
  assert.equal(f.deliveries.at(-1).format, 'markdown'); assert.equal(f.deliveries.at(-1).text, text);
  assert.equal(f.deliveries.at(-1).attachmentId, f.staged.attachmentId);
  assert.equal(f.deliveries.at(-1).draftId, binding.draftId); assert.equal(f.deliveries.at(-1).parentId, 'root');
  assert.equal(f.calls.length, 1, 'no mentions means no preflight reads');
  assert.deepEqual(parts(f.posts()[0]!.body, f.posts()[0]!.type).find(p => p.name === 'files')!.bytes, bytes);
  await f.send('one', text); assert.equal(f.posts().length, 1);
  await assert.rejects(f.send('one', text, { ...rich, mentionsAccepted: true }));
  await assert.rejects(f.send('one', text, {}));
  assert.equal(f.posts().length, 1);
});
test('MF14 mentions freshly verify each exact person once before the sole POST; @all requires independent consent', async t => {
  const f = await fixture(t), text = '**Rich** <@personId:a|Same> <@personId:b|Same> <@personId:a|Same> <@all>';
  await f.send('no', text); assert.equal(f.deliveries.at(-1).status, 'failed'); assert.equal(f.calls.length, 0);
  await f.send('no-all', text, { ...rich, mentionsAccepted: true }); assert.equal(f.calls.length, 0);
  await f.send('yes', text, { ...rich, mentionsAccepted: true, allAccepted: true });
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'POST']);
  assert.equal(f.deliveries.at(-1).status, 'sent');
});
for (const kind of ['direct', 'grant', 'syntax', '429', 'identity'] as const) test(`MF14 ${kind} preflight refusal produces no POST or downgrade`, async t => {
  const f = await fixture(t, { group: kind !== 'direct', scopes: kind === 'grant' ? 'spark:messages_write' : undefined,
    member: kind === '429' ? res => { res.writeHead(429); res.end('{}'); }
      : kind === 'identity' ? res => { res.end(JSON.stringify({ items: [{ id: 'm', roomId: 'other', personId: 'a' }] })); } : undefined });
  await f.send('refuse', kind === 'syntax' ? '<@personEmail:a@example.invalid>' : '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
  assert.equal(f.posts().length, 0); assert.equal(f.deliveries.at(-1).status, 'failed');
  assert.equal(f.calls.length, ['429', 'identity'].includes(kind) ? 1 : 0);
});
for (const kind of ['markdown', 'trimmed-markdown', 'missing-markdown', 'room', 'root', 'files', 'multiple-files', 'foreign-file', 'errors', 'created', 'id'] as const) {
  test(`MF14 raw ${kind} ACK mismatch stays unknown without registering a file or automatically replaying`, async t => {
    const f = await fixture(t, { ack: raw => ({ ...raw, ...({
      markdown: { markdown: '**changed**' }, 'trimmed-markdown': { markdown: '**exact**' }, 'missing-markdown': { markdown: undefined }, room: { roomId: 'other' },
      root: { parentId: 'other' }, files: { files: [] }, 'foreign-file': { files: ['https://evil.invalid/file'] },
      'multiple-files': { files: ['https://webexapis.com/v1/contents/a', 'https://webexapis.com/v1/contents/b'] },
      errors: { errors: [] }, created: { created: 'invalid' }, id: { id: 'root' },
    }[kind]) }) });
    const project = t.mock.method(WebexMessagingAPI.prototype, 'projectMessage', () => assert.fail('No rejected-ACK registry side effect'));
    await f.send('bad', '  **exact**\n');
    assert.equal(f.deliveries.at(-1).status, 'unknown'); assert.equal(f.engine.snapshot().uncertain, true);
    assert.equal(project.mock.callCount(), 0); assert.equal(f.posts().length, 1);
    await f.send('bad', '  **exact**\n'); await f.send('new', '**exact**');
    assert.equal(f.posts().length, 1);
  });
}
for (const status of [302, 401, 403, 429, 500]) test(`MF14 HTTP ${status} never follows, refreshes or replays the POST`, async t => {
  const f = await fixture(t, { status }); await f.send('status', '**draft**');
  assert.equal(f.posts().length, 1); assert.equal(f.calls.length, 1);
  assert.equal(f.deliveries.at(-1).status, [401, 403, 429].includes(status) ? 'failed' : 'unknown');
});
test('MF14 normal-root raw ACK permits only the documented absent/null no-parent representation', async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, parentId: null }) });
  const target = { roomId: 'room', draftId: 'normal-draft' }, staged = await f.engine.stageUpload(f.path, target);
  await f.engine.sendUpload('normal', '**Normal**', staged.attachmentId, target, rich);
  assert.equal(f.deliveries.at(-1).status, 'sent'); assert.equal(f.deliveries.at(-1).parentId, undefined);
  assert.deepEqual(parts(f.posts()[0]!.body, f.posts()[0]!.type).map(p => p.name), ['roomId', 'markdown', 'files']);
});
test('MF14 draft and consent objects are detached before an asynchronous membership read', async t => {
  const held = deferred<ServerResponse>(), f = await fixture(t, { member: res => held.resolve(res) });
  const target = { ...binding }, consent = { ...rich, mentionsAccepted: true, allAccepted: true };
  const pending = f.engine.sendUpload('detached', '<@personId:a|Person> <@all>', f.staged.attachmentId, target, consent);
  const res = await held.promise;
  target.roomId = 'other'; target.parentId = 'other'; target.draftId = 'other';
  consent.mentionsAccepted = false; consent.allAccepted = false;
  res.end(JSON.stringify({ items: [{ id: 'm', roomId: 'room', personId: 'a' }] })); await pending;
  assert.equal(f.deliveries.at(-1).status, 'sent'); assert.equal(f.deliveries.at(-1).roomId, 'room');
  assert.equal(f.deliveries.at(-1).parentId, 'root'); assert.equal(f.deliveries.at(-1).draftId, 'native-draft');
  assert.equal(f.posts().length, 1);
});
test('MF14 20-second mention deadline ends logical delivery but retains stubborn work until settlement', async t => {
  const f = await fixture(t), gate = deferred<PublicResponse>(), started = deferred<void>();
  Object.assign(f.engine, { actionREST: { busy: () => false, async call() { started.resolve(); return gate.promise; } } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.send('deadline', '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
    await started.promise; t.mock.timers.tick(20000); await pending;
    assert.equal(f.deliveries.at(-1).status, 'failed'); assert.equal(f.uploads.diagnostics().sending, true);
    assert.equal(f.posts().length, 0);
  } finally {
    gate.resolve({ value: { items: [{ id: 'm', roomId: 'room', personId: 'a' }] } });
    t.mock.timers.reset();
  }
  await until(() => !f.uploads.diagnostics().sending);
});
test('PublicREST settled waits for native close after a logical canceled GET', async () => {
  const started = deferred<void>();
  let native!: EventEmitter, nativeSignal!: AbortSignal;
  const rest = new PublicREST((options: any) => {
    nativeSignal = options.signal;
    native = Object.assign(new EventEmitter(), { end() { started.resolve(); }, destroy() { return native; } });
    nativeSignal.addEventListener('abort', () => native.emit('error', new Error('canceled')), { once: true });
    return native as any;
  });
  const abort = new AbortController(), pending = rest.call('/v1/memberships?roomId=room&personId=a&max=100', 'GET', 'INERT', abort.signal);
  await started.promise; abort.abort(); await assert.rejects(pending);
  let settled = false; const close = rest.settled().then(() => { settled = true; });
  await tick(); assert.equal(settled, false); assert.equal(rest.busy(), true);
  native.emit('close'); await close; assert.equal(rest.busy(), false);
});
test('MF14 grant loss during mention verification refuses before upload, retaining the immutable snapshot', async t => {
  const held = deferred<{ res: ServerResponse; person: string }>();
  const f = await fixture(t, { member: (res, person) => held.resolve({ res, person }) });
  const pending = f.send('revoke', '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
  const { res, person } = await held.promise;
  Object.assign(f.engine, { grantedScope: 'spark:messages_write' });
  res.end(JSON.stringify({ items: [{ id: 'm', roomId: 'room', personId: person }] })); await pending;
  assert.equal(f.posts().length, 0); assert.equal(f.deliveries.at(-1).status, 'failed');
  assert.equal(f.uploads.diagnostics().references, 1);
});
test('MF14 selection away-and-return during preflight cannot submit or retarget the staged file', async t => {
  const held = deferred<ServerResponse>();
  const f = await fixture(t, { member: res => held.resolve(res) });
  const pending = f.send('away', '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
  const res = await held.promise;
  await f.engine.select('other'); await f.engine.select('room');
  res.end(JSON.stringify({ items: [{ id: 'm', roomId: 'room', personId: 'a' }] })); await pending;
  assert.equal(f.posts().length, 0); assert.equal(f.deliveries.at(-1).status, 'failed');
});
test('MF14 cancel and replacement session retain a stubborn physical preflight slot until actual settlement', async t => {
  const f = await fixture(t), gate = deferred<PublicResponse>(), started = deferred<void>();
  Object.assign(f.engine, { actionREST: { busy: () => false, async call() { started.resolve(); return gate.promise; } } });
  const pending = f.send('held', '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
  await started.promise; f.engine.cancelUpload(binding.draftId, 'send'); await pending;
  assert.equal(f.deliveries.at(-1).status, 'failed'); assert.equal(f.posts().length, 0);
  assert.equal(f.uploads.diagnostics().sending, true);
  f.engine.stop(); await f.engine.start('demo'); await f.engine.select('demo-general');
  await assert.rejects(f.engine.send('overlap', 'demo-general', 'must not submit'));
  gate.resolve({ value: { items: [{ id: 'm', roomId: 'room', personId: 'a' }] } });
  await until(() => !f.uploads.diagnostics().sending);
  assert.equal(f.posts().length, 0);
});
test('MF14 preflight retains admission when a logical REST abort precedes its native close', async t => {
  const f = await fixture(t), closed = deferred<void>(), started = deferred<void>();
  Object.assign(f.engine, { actionREST: { busy: () => true, settled: () => closed.promise, async call(_p: string, _m: string, _t: string, signal: AbortSignal) {
    started.resolve(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true }));
  } } });
  const pending = f.send('logical', '<@personId:a|Person>', { ...rich, mentionsAccepted: true });
  await started.promise; f.engine.cancelUpload(binding.draftId, 'send'); await pending; await tick();
  assert.equal(f.uploads.diagnostics().sending, true, 'logical abort cannot release the physical upload/preflight owner');
  closed.resolve(); await until(() => !f.uploads.diagnostics().sending);
});
test('MF14 post-submission cancellation stays unknown and never automatically replays', async t => {
  const f = await fixture(t, { holdPost: true });
  const pending = f.send('cancel', '**draft**'); await f.posted;
  f.engine.cancelUpload(binding.draftId, 'send'); await pending;
  assert.equal(f.deliveries.at(-1).status, 'unknown');
  await f.send('second', '**draft**'); assert.equal(f.posts().length, 1);
});
test('MF14 exact ACK exclusion precedes hold release without suppressing other-client self events', async t => {
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {}, close() {}, markRead: async () => assert.fail('No receipt') };
  const f = await fixture(t, { source, holdPost: true, scopes: 'spark:all' }), order: string[] = [];
  f.engine.on('delivery', () => order.push('delivery'));
  f.engine.on('state', value => order.push(value.uploadPending ? 'held' : 'released'));
  const pending = f.send('notifications', '**draft**'); await f.posted;
  source.onHealth!('live');
  const created = new Date().toISOString();
  source.onMessages!([{ id: 'ack', roomId: 'room', created, self: true, preview: 'own echo' },
    { id: 'other-client', roomId: 'room', created, self: true, preview: 'Other client' }]);
  assert.deepEqual(f.engine.snapshot().messageEvents.items.map(item => item.id), ['ack', 'other-client']);
  f.reply(); await pending;
  assert.equal(f.deliveries.at(-1).format, 'markdown');
  assert.equal(order[order.indexOf('delivery') + 1], 'released');
  assert.equal(f.posts().length, 1);
});
test('shared 64-entry delivery ledger refuses saturation instead of evicting a write into resend eligibility', async () => {
  let sends = 0;
  const store = new MessagingStore({ async send(_room: string, text: string) {
    sends++; return { id: 'ack-' + sends, author: 'Synthetic', created: '2026-11-15T10:00:00.000Z', text };
  }, close() {} } as any);
  store.room = { id: 'room', title: 'Synthetic' } as any; store.ready = true;
  try {
    for (let i = 0; i < 64; i++) await store.send('one-' + i, 'room', 'same');
    await assert.rejects(store.send('overflow', 'room', 'same'), /limit|full|saturat/i);
    await store.send('one-0', 'room', 'same');
    assert.equal(sends, 64);
  } finally { store.close(); }
});
