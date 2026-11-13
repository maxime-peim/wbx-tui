/** MF15 actual engine/one-shot transports with a loopback-only request boundary. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { Uploads } from '../src/uploads.js';
import type { DirectOptions } from '../src/conversation-actions.js';
import type { PublicResponse } from '../src/public-rest.js';
import type { ReadStatusSource } from '../src/read-status.js';

const rich = { format: 'markdown' as const }, binary = Buffer.from([0, 255, 10, 65, 240, 159, 152, 128]);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => boolean) {
  const end = Date.now() + 3000;
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'bounded physical settlement');
}
function decode(body: Buffer, type: string) {
  if (type.startsWith('application/json')) return { fields: JSON.parse(body.toString()), names: Object.keys(JSON.parse(body.toString())), file: undefined };
  const delimiter = Buffer.from('--' + /boundary=([^;]+)/.exec(type)![1]);
  const fields: Record<string, string> = {}, names: string[] = [];
  let at = 0, file: Buffer | undefined;
  while (body.subarray(at + delimiter.length, at + delimiter.length + 2).toString() !== '--') {
    assert.deepEqual(body.subarray(at, at + delimiter.length), delimiter);
    const end = body.indexOf('\r\n\r\n', at), next = body.indexOf(delimiter, end);
    assert.ok(end > at && next > end);
    const name = /\bname="([^"]+)"/.exec(body.subarray(at, end).toString())![1]!;
    names.push(name);
    const value = body.subarray(end + 4, next - 2);
    if (name === 'files') { assert.equal(file, undefined); file = value; } else fields[name] = value.toString();
    at = next;
  }
  assert.equal(body.subarray(at + delimiter.length).toString(), '--\r\n');
  return { fields, names, file };
}
async function fixture(t: TestContext, options: {
  status?: number; ack?: (value: Record<string, unknown>) => unknown; roomStatus?: number; roomType?: string;
  person?: string; holdPost?: boolean; holdPerson?: boolean; holdRoom?: boolean;
  scopes?: string; source?: ReadStatusSource; sendMs?: number;
} = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-direct-transport-'), config = join(directory, 'config.json'), path = join(directory, 'literal.bin');
  await writeFile(path, binary);
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'inert', clientSecret: 'inert',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'INERT', scope: options.scopes ?? 'spark:people_read spark:messages_write spark:rooms_read', expiresAt: Date.now() + 600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live/fetch/SDK path'));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'selected', title: 'Selected', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [] }));
  const calls: { method: string; path: string; body: Buffer; type: string }[] = [];
  let sending = false, ids = 0;
  const posted = deferred<ServerResponse>(), personRead = deferred<ServerResponse>(), roomRead = deferred<ServerResponse>();
  const replies: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), type = req.headers['content-type'] ?? '', method = req.method!, path = req.url!;
    calls.push({ method, path, body, type });
    assert.equal(req.headers.authorization, 'Bearer INERT');
    if (method === 'GET') {
      assert.equal(body.length, 0);
      if (path === '/v1/people/me') return void res.end(JSON.stringify({ id: 'self' }));
      if (path === '/v1/people/peer') {
        const reply = () => res.end(JSON.stringify({ id: sending ? options.person ?? 'peer' : 'peer', displayName: 'Same Name' }));
        if (sending && options.holdPerson) { replies.push(reply); personRead.resolve(res); } else reply();
        return;
      }
      assert.equal(path, '/v1/rooms/real');
      const reply = () => {
        res.writeHead(options.roomStatus ?? 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'real', type: options.roomType ?? 'direct', title: 'Not peer identity' }));
      };
      if (options.holdRoom) { replies.push(reply); roomRead.resolve(res); } else reply();
      return;
    }
    assert.equal(method, 'POST'); assert.equal(path, '/v1/messages');
    assert.equal(Number(req.headers['content-length']), body.length);
    const { fields } = decode(body, type);
    const raw = { id: 'ack-' + ++ids, roomId: 'real', roomType: 'direct', personId: 'self', toPersonId: 'peer',
      created: new Date().toISOString(), ...(fields.markdown !== undefined ? { markdown: fields.markdown } : { text: fields.text }),
      ...(type.startsWith('multipart') ? { files: ['https://webexapis.com/v1/contents/inert'] } : {}) };
    const reply = () => {
      res.writeHead(options.status ?? 201, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
      res.end(JSON.stringify(options.ack ? options.ack(raw) : raw));
    };
    posted.resolve(res);
    if (options.holdPost) replies.push(reply); else reply();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port, uploads = new Uploads({ temporaryRoot: directory, sendMs: options.sendMs });
  const native = (input: any, listener: any) => {
    assert.equal(input.protocol, 'https:'); assert.equal(input.hostname, 'webexapis.com'); assert.equal(input.agent, false);
    return request({ ...input, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  };
  const engine = new EditorEngine(undefined, options.source ? () => options.source! : undefined, undefined, undefined, undefined, undefined,
    { uploads, publicRequest: native, uploadRequest: native });
  t.after(async () => {
    engine.stop(); for (const reply of replies) reply(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await until(() => !uploads.diagnostics().references && !uploads.diagnostics().sending && !uploads.diagnostics().cleaning);
    await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, ...(options.source ? { readStatus: true, notificationPreview: true } : {}) });
  await engine.select('selected');
  const target = await engine.prepareDirect('peer');
  const binding = { targetId: target.targetId, draftId: 'native-direct' };
  calls.length = 0; sending = true;
  const outcomes: any[] = []; engine.on('direct.delivery', value => outcomes.push(value));
  return { engine, uploads, calls, target, binding, path, outcomes, posted: posted.promise, personRead: personRead.promise, roomRead: roomRead.promise,
    reply: () => { for (const reply of replies.splice(0)) reply(); },
    stage: () => engine.stageUpload(path, binding), posts: () => calls.filter(call => call.method === 'POST'),
    send: (id: string, text: string, intent: DirectOptions = rich) => engine.sendDirect(id, target.targetId, binding.draftId, text, intent) };
}
for (const mode of ['markdown', 'file', 'plain-file', 'markdown-file'] as const) {
  test(`MF15 physical ${mode} first/later sends use one exact selector and immutable bytes per new request`, async t => {
    const f = await fixture(t), text = mode === 'file' ? '' : mode === 'plain-file' ? 'Literal <@all>' : '  **résumé 😀**\n`exact`\n';
    let intent: DirectOptions = mode.includes('markdown') ? rich : {};
    if (mode !== 'markdown') intent = { ...intent, attachmentId: (await f.stage()).attachmentId };
    await writeFile(f.path, 'New path contents must not replace staged bytes');
    const first = await f.send('first', text, intent);
    assert.equal(first.status, 'changed'); assert.equal(first.roomId, 'real');
    const wire = decode(f.posts()[0]!.body, f.posts()[0]!.type);
    assert.deepEqual(wire.names, ['toPersonId', ...(text ? [intent.format ? 'markdown' : 'text'] : []), ...(intent.attachmentId ? ['files'] : [])]);
    assert.equal(wire.fields.toPersonId, 'peer'); assert.equal(wire.fields[intent.format ? 'markdown' : 'text'] ?? '', text);
    if (intent.attachmentId) assert.deepEqual(wire.file, binary);
    assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), ['GET /v1/people/me', 'GET /v1/people/peer', 'POST /v1/messages', 'GET /v1/rooms/real']);
    await f.send('first', text, intent); assert.equal(f.posts().length, 1, 'exact replay must not reread/rePOST');
    if (intent.attachmentId) intent = { ...intent, attachmentId: (await f.stage()).attachmentId };
    const second = await f.send('second', text, intent);
    assert.equal(second.status, 'changed'); assert.equal(f.posts().length, 2);
    const later = decode(f.posts()[1]!.body, f.posts()[1]!.type);
    assert.equal(later.fields.roomId, 'real'); assert.equal(later.fields.toPersonId, undefined);
    assert.equal(f.engine.snapshot().room!.id, 'selected');
  });
}
const badACKs: Record<string, (raw: Record<string, unknown>) => unknown> = {
  recipient: raw => ({ ...raw, toPersonId: 'foreign' }), 'missing-recipient': raw => ({ ...raw, toPersonId: undefined }),
  author: raw => ({ ...raw, personId: 'foreign' }), 'room-type': raw => ({ ...raw, roomType: 'group' }),
  root: raw => ({ ...raw, parentId: 'root' }), markdown: raw => ({ ...raw, markdown: '**Exact**' }),
  created: raw => ({ ...raw, created: 'invalid' }), id: raw => ({ ...raw, id: '' }),
  'missing-file': raw => ({ ...raw, files: [] }), 'extra-files': raw => ({ ...raw, files: [raw.files, raw.files] }),
  'foreign-file': raw => ({ ...raw, files: ['https://evil.invalid/secret'] }),
  card: raw => ({ ...raw, attachments: [{ content: 'unexpected' }] }), errors: raw => ({ ...raw, errors: [] }),
};
for (const [kind, ack] of Object.entries(badACKs)) test(`MF15 physical ${kind} file ACK is unknown before any registry/history installation`, async t => {
  const f = await fixture(t, { ack }), staged = await f.stage();
  const project = t.mock.method(WebexMessagingAPI.prototype, 'projectMessage', () => assert.fail('No bad ACK registry effects'));
  const result = await f.send('bad', '  **Exact**\n', { ...rich, attachmentId: staged.attachmentId });
  assert.equal(result.status, 'unknown'); assert.equal(result.roomId, undefined); assert.equal(project.mock.callCount(), 0);
  assert.equal(f.engine.snapshot().rooms.some(room => room.id === 'real'), false);
  assert.equal(f.posts().length, 1);
  await assert.rejects(f.send('new-id', '**Exact**', rich)); assert.equal(f.posts().length, 1);
});
for (const status of [302, 401, 403, 429, 500]) test(`MF15 typed multipart HTTP ${status} refuses or stays unknown without redirect/refresh/rePOST`, async t => {
  const f = await fixture(t, { status }), staged = await f.stage();
  const intent = { attachmentId: staged.attachmentId };
  const result = await f.send('status', 'Plain', intent);
  assert.equal(result.status, [401, 403, 429].includes(status) ? 'failed' : 'unknown');
  await f.send('status', 'Plain', intent); assert.equal(f.posts().length, 1);
});
for (const status of [403, 429, 500]) test(`MF15 post-ACK room GET ${status} remains unknown with no new-room adoption`, async t => {
  const f = await fixture(t, { roomStatus: status }), staged = await f.stage();
  const result = await f.send('room', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  assert.equal(result.status, 'unknown'); assert.equal(result.roomId, undefined);
  await assert.rejects(f.send('no-recreate', '**Exact**')); assert.equal(f.posts().length, 1);
});
test('MF15 changed fresh recipient refuses before any file POST and retains its snapshot', async t => {
  const f = await fixture(t, { person: 'foreign' }), staged = await f.stage();
  const result = await f.send('wrong-person', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  assert.equal(result.status, 'failed'); assert.equal(f.posts().length, 0); assert.equal(f.uploads.diagnostics().references, 1);
});
test('MF15 cancel before submission refuses, cancel after submission is unknown; neither replays', async t => {
  const f = await fixture(t, { holdPerson: true }), staged = await f.stage();
  const sending = f.send('cancel', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await f.personRead; f.engine.cancelUpload(f.binding.draftId, 'send');
  assert.equal((await sending).status, 'failed'); assert.equal(f.posts().length, 0); f.reply();
});
test('MF15 post-submission cancellation latches the exact person and publishes no room', async t => {
  const f = await fixture(t, { holdPost: true }), staged = await f.stage();
  const sending = f.send('cancel', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await f.posted; f.engine.cancelUpload(f.binding.draftId, 'send');
  assert.equal((await sending).status, 'unknown');
  await assert.rejects(f.send('again', '**Exact**')); assert.equal(f.posts().length, 1); f.reply();
});
test('MF15 grant loss after a successful file POST but before room verification is unknown', async t => {
  const f = await fixture(t, { holdRoom: true }), staged = await f.stage();
  const sending = f.send('grant', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await f.roomRead; Object.assign(f.engine, { grantedScope: 'spark:messages_write' }); f.reply();
  assert.equal((await sending).status, 'unknown'); assert.equal(f.outcomes.at(-1).roomId, undefined);
});
test('MF15 post-submission upload deadline is unknown within the single total file budget', async t => {
  const f = await fixture(t, { holdPost: true, sendMs: 100 }), staged = await f.stage();
  const sending = f.send('deadline', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await f.posted; assert.equal((await sending).status, 'unknown'); assert.equal(f.posts().length, 1);
});
test('MF15 exact direct delivery exclusion precedes room publication and direct hold release', async t => {
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {}, close() {}, markRead: async () => assert.fail('No receipt') };
  const f = await fixture(t, { source, holdPost: true, scopes: 'spark:all' }), staged = await f.stage(), order: string[] = [];
  f.engine.on('direct.delivery', () => order.push('delivery'));
  f.engine.on('state', value => order.push(value.directPending ? 'held' : 'released'));
  const sending = f.send('events', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await f.posted; source.onHealth!('live');
  const created = new Date().toISOString();
  source.onMessages!([{ id: 'ack-1', roomId: 'real', created, self: true, preview: 'Own' },
    { id: 'other-client', roomId: 'real', created, self: true, preview: 'Other client' }]);
  assert.deepEqual(f.engine.snapshot().messageEvents.items.map(item => item.id), ['ack-1', 'other-client']);
  f.reply(); assert.equal((await sending).status, 'changed');
  assert.equal(order[order.indexOf('delivery') + 1], 'held', 'delivery exclusion happens before confirmed room publication');
  assert.equal(order.at(-1), 'released');
});
test('MF15 total preflight cancel holds stubborn logical/native work across reset without a new sender', async t => {
  const f = await fixture(t), staged = await f.stage(), gate = deferred<PublicResponse>(), started = deferred<void>();
  // Runtime composition retains the one ActionREST object; replace only its inert boundary.
  const actions = (f.engine as any).actionREST;
  actions.busy = () => false; actions.settled = async () => {};
  actions.call = async () => { started.resolve(); return gate.promise; };
  const sending = f.send('stubborn', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  await started.promise; f.engine.cancelUpload(f.binding.draftId, 'send');
  assert.equal((await sending).status, 'failed'); assert.equal(f.uploads.diagnostics().sending, true);
  f.engine.stop(); await f.engine.start('demo'); await f.engine.select('demo-general');
  await assert.rejects(f.engine.send('overlap', 'demo-general', 'Not admitted'));
  gate.resolve({ value: { id: 'self' } }); await until(() => !f.uploads.diagnostics().sending);
  assert.equal(f.posts().length, 0);
});
test('MF15 recipient context is rechecked after preflight expiry without submitting a placeholder', async t => {
  const f = await fixture(t, { holdPerson: true }), staged = await f.stage();
  const sending = f.send('expiry', '**Exact**', { ...rich, attachmentId: staged.attachmentId }); await f.personRead;
  const actual = Date.now(); t.mock.method(Date, 'now', () => actual + 700000);
  f.reply(); assert.equal((await sending).status, 'failed'); assert.equal(f.posts().length, 0);
});
test('MF15 20-second file preflight deadline refuses logically while a stubborn GET retains physical admission', async t => {
  const f = await fixture(t), staged = await f.stage(), gate = deferred<PublicResponse>(), started = deferred<void>();
  const actions = (f.engine as any).actionREST;
  actions.busy = () => false; actions.settled = async () => {};
  actions.call = async () => { started.resolve(); return gate.promise; };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const sending = f.send('preflight-deadline', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
    await started.promise; t.mock.timers.tick(20000);
    assert.equal((await sending).status, 'failed');
    assert.equal(f.uploads.diagnostics().sending, true);
    await assert.rejects(f.engine.send('overlap', 'selected', 'No overlap'));
    assert.equal(f.posts().length, 0);
  } finally { gate.resolve({ value: { id: 'self' } }); t.mock.timers.reset(); }
  await until(() => !f.uploads.diagnostics().sending);
});
test('MF15 Markdown-only deadline retains native admission and cannot publish late success after reset', async t => {
  const f = await fixture(t), gate = deferred<PublicResponse>(), started = deferred<void>();
  const actions = (f.engine as any).actionREST, original = actions.call;
  actions.call = async (...args: any[]) => args[1] === 'POST' ? (started.resolve(), gate.promise) : original(...args);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const sending = f.send('markdown-deadline', '**Exact**');
    await started.promise; t.mock.timers.tick(20000);
    assert.equal((await sending).status, 'unknown');
    await assert.rejects(f.engine.prepareDirect('peer'));
    f.engine.stop(); await f.engine.start('demo');
    await assert.rejects(f.engine.prepareDirect('peer'), 'replacement must not overlap the stubborn physical mutation');
  } finally { gate.resolve({ value: { id: 'late', roomId: 'real', personId: 'self', toPersonId: 'peer', markdown: '**Exact**', created: new Date().toISOString() } }); t.mock.timers.reset(); }
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(f.engine.snapshot().rooms.some(room => room.id === 'real'), false);
});
test('MF15 replacing a recipient context revokes its file handle rather than promoting it to another target', async t => {
  const f = await fixture(t), staged = await f.stage();
  f.engine.discardDirect(f.target.targetId);
  const second = await f.engine.prepareDirect('peer');
  const result = await f.engine.sendDirect('borrow', second.targetId, f.binding.draftId, '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  assert.equal(result.status, 'failed'); assert.equal(f.posts().length, 0);
});
test('MF15 retained new-mode result limit is enforced before publication, not by truncating ACK identity', async t => {
  const f = await fixture(t, { ack: raw => ({ ...raw, ignoredLargeProfile: 'x'.repeat(50000) }) }), staged = await f.stage();
  const result = await f.send('bounded', '**Exact**', { ...rich, attachmentId: staged.attachmentId });
  assert.equal(result.status, 'changed');
  const owner = (f.engine as any).conversations;
  const record = owner.requests.get('bounded');
  assert.ok(Buffer.byteLength(JSON.stringify(record.result)) <= 16384);
  assert.doesNotMatch(JSON.stringify(record), /ignoredLargeProfile/);
});
