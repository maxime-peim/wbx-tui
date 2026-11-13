import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { Uploads, type UploadProgress } from '../src/uploads.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import type { ReadStatusSource } from '../src/read-status.js';
const binding = { roomId: 'room', draftId: 'native-draft' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(t: TestContext, scopes = 'spark:rooms_read spark:messages_read spark:messages_write',
  reply?: (res: import('node:http').ServerResponse) => void, source?: ReadStatusSource) {
  const directory = await mkdtemp('/tmp/opencode/wbx-upload-engine-'), config = join(directory, 'config.json'), path = join(directory, 'local.txt');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  await writeFile(path, 'Synthetic staged bytes');
  const access = { token: 'SYNTHETIC', scope: scopes, expiresAt: Date.now() + 3600000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  let forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('LIVE NETWORK FORBIDDEN'); });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'room', title: 'Synthetic', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{ id: 'old', author: 'Synthetic', text: 'Old', created: '2026-01-01T00:00:00.000Z' }] }));
  const ack = () => ({ id: 'ack', roomId: 'room', personId: 'self', created: new Date().toISOString(), text: 'Synthetic',
    files: ['https://webexapis.com/v1/contents/synthetic'] });
  let posts = 0, received!: () => void;
  const posted = new Promise<void>(resolve => { received = resolve; });
  const server = createServer(async (req, res) => {
    posts++; for await (const _ of req) { /* Consume only this synthetic multipart. */ }
    received();
    if (reply) reply(res);
    else { res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(ack())); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port, uploads = new Uploads({ temporaryRoot: directory });
  const engine = new EditorEngine(undefined, source ? () => source : undefined, undefined, undefined, undefined, undefined, { uploads,
    uploadRequest: (options, listener) => {
      assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.path, '/v1/messages'); assert.equal(options.agent, false);
      return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
    },
  });
  const deliveries: any[] = [], progress: UploadProgress[] = [];
  engine.on('delivery', delivery => deliveries.push(delivery)); engine.on('upload.progress', value => progress.push(value));
  t.after(async () => {
    engine.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    const start = Date.now();
    while ((uploads.diagnostics().references || uploads.diagnostics().cleaning) && Date.now() - start < 3000) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(uploads.diagnostics().references, 0); assert.equal(forbidden, 0);
    await rm(directory, { recursive: true, force: true });
  });
  await engine.startSession({ mode: 'live', config, ...(source ? { readStatus: true, notificationPreview: true } : {}) }); await engine.select('room');
  return { engine, uploads, access, path, posted, posts: () => posts, deliveries, progress, ack };
}
test('actual engine stages/uploads through the common new-message ledger and repeats no POST for a replay', async t => {
  const f = await fixture(t), staged = await f.engine.stageUpload(f.path, binding);
  const first = f.engine.snapshot();
  await f.engine.sendUpload('upload-1', '', staged.attachmentId, binding);
  assert.equal(f.posts(), 1); assert.equal(f.deliveries[0].status, 'sent');
  assert.equal(f.deliveries[0].messageId, 'ack'); assert.equal(f.deliveries[0].attachmentId, staged.attachmentId);
  assert.equal(f.deliveries[0].draftId, binding.draftId);
  assert.equal(f.engine.snapshot().messages.length, first.messages.length + 1);
  assert.ok(!JSON.stringify(f.engine.snapshot()).includes('"authorId"'));
  assert.ok(!JSON.stringify(f.progress).includes(f.path));
  assert.ok(f.progress.every(value => Object.keys(value).every(key => ['roomId', 'parentId', 'draftId', 'attachmentId', 'phase', 'bytes', 'total'].includes(key))));
  await f.engine.sendUpload('upload-1', '', staged.attachmentId, binding);
  assert.equal(f.posts(), 1);
  await assert.rejects(f.engine.sendUpload('upload-1', 'different', staged.attachmentId, binding), /already belongs/);
  assert.equal(f.posts(), 1);
});
test('logical upload publishes fresh self events immediately, then delivery precedes hold release without extending source freshness', async t => {
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async () => {},
    markRead: async () => { throw new Error('RECEIPT FORBIDDEN'); }, close() {} };
  let response!: import('node:http').ServerResponse;
  const f = await fixture(t, 'spark:all', res => { response = res; }, source);
  const staged = await f.engine.stageUpload(f.path, binding), order: string[] = [];
  f.engine.on('delivery', () => order.push('delivery'));
  f.engine.on('state', value => order.push(value.uploadPending ? 'held' : 'released'));
  const pending = f.engine.sendUpload('long', '', staged.attachmentId, binding);
  await f.posted; source.onHealth!('live');
  const created = new Date().toISOString();
  source.onMessages!([{ id: 'other-client', roomId: 'room', created, self: true, preview: 'Other client' },
    { id: 'ack', roomId: 'room', created, self: true, preview: 'Own echo' }]);
  const captured = f.engine.snapshot();
  assert.equal(captured.uploadPending, true);
  assert.deepEqual(captured.messageEvents.items.map(item => item.id), ['other-client', 'ack']);
  assert.equal(captured.messageEvents.received, 2);
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  t.mock.timers.tick(45000);
  const aged = f.engine.snapshot();
  assert.equal(aged.uploadPending, true);
  assert.deepEqual(aged.messageEvents.items, [], 'Node retains the existing 30-second freshness policy');
  assert.equal(aged.messageEvents.received, 2);
  response.writeHead(201, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(f.ack()));
  await pending;
  assert.equal(f.engine.snapshot().uploadPending, undefined);
  assert.ok(order.includes('delivery'));
  assert.equal(order[order.indexOf('delivery') + 1], 'released', 'exact ACK is emitted before native release');
  assert.equal(f.posts(), 1);
  t.mock.timers.reset();
});
test('missing known write grant refuses staging before filesystem capability admission; configured scopes are not proof', async t => {
  const f = await fixture(t, 'spark:rooms_read spark:messages_read');
  const stage = t.mock.method(f.uploads, 'stage', async () => { throw new Error('must not stage'); });
  await assert.rejects(f.engine.stageUpload('/explicit-but-unavailable', binding), /known existing/);
  assert.equal(stage.mock.callCount(), 0); assert.equal(f.posts(), 0);
});
for (const malformed of ['room', 'parent', 'files', 'json'] as const) test(`malformed ${malformed} acknowledgment stays uncertain and cannot replay automatically`, async t => {
  const f = await fixture(t, undefined, res => {
    const body: Record<string, unknown> = { id: 'ack', roomId: malformed === 'room' ? 'other' : 'room',
      created: new Date().toISOString(), text: 'Synthetic', files: malformed === 'files' ? [] : ['https://webexapis.com/v1/contents/synthetic'],
      ...(malformed === 'parent' ? { parentId: 'wrong-root' } : {}) };
    res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(malformed === 'json' ? '{PRIVATE INVALID' : JSON.stringify(body));
  });
  const staged = await f.engine.stageUpload(f.path, binding);
  await f.engine.sendUpload('first', '', staged.attachmentId, binding);
  assert.equal(f.posts(), 1); assert.equal(f.deliveries[0].status, 'unknown');
  assert.equal(f.engine.snapshot().uncertain, true);
  await f.engine.sendUpload('new-but-unresolved', '', staged.attachmentId, binding);
  assert.equal(f.posts(), 1); assert.equal(f.deliveries[1].status, 'failed');
  assert.equal(f.uploads.diagnostics().references, 1, 'uncertain draft retains its staged metadata/source');
});
test('scope revocation aborts the exact upload, retains unknown delivery and emits only inert invalidation', async t => {
  const f = await fixture(t, undefined, () => {});
  const staged = await f.engine.stageUpload(f.path, binding), invalidated: unknown[] = [];
  f.engine.on('uploads.invalidated', value => invalidated.push(value));
  const pending = f.engine.sendUpload('in-flight', 'Synthetic', staged.attachmentId, binding);
  await f.posted;
  f.access.scope = 'spark:rooms_read spark:messages_read';
  await f.engine.refreshAuth(); await pending;
  assert.equal(f.posts(), 1); assert.deepEqual(invalidated, [{}]);
  assert.equal(f.deliveries[0].status, 'unknown'); assert.equal(f.engine.snapshot().uncertain, true);
  const deadline = Date.now() + 3000;
  while (f.uploads.diagnostics().references && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.uploads.diagnostics().references, 0, 'logical unknown does not require premature FD/native cleanup; actual settlement releases it');
});
test('strict upload RPC admits only bounded paths/handles and independent draft-bound intents', () => {
  const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
  assert.equal(parse('uploads.stage', { ...binding, path: '/local/file' }).method, 'uploads.stage');
  assert.equal(parse('uploads.send', { ...binding, attachmentId: 'a'.repeat(32), text: '', requestId: 'request' }).method, 'uploads.send');
  for (const params of [{ ...binding, path: '/local/file', bytes: 'base64' }, { ...binding, path: 'https://untrusted.invalid/file' }, { ...binding, path: '/local/file', url: 'https://untrusted.invalid' },
    { ...binding, draftId: '../escape', path: '/local/file' }, { ...binding, path: '/a\nb' }, { ...binding, path: '/x'.repeat(3000) }]) assert.throws(() => parse('uploads.stage', params));
  assert.throws(() => parse('uploads.send', { ...binding, attachmentId: 'a'.repeat(64), text: '', requestId: 'request' }));
  assert.throws(() => parse('uploads.cancel', { draftId: 'draft', command: 'kill' }));
});
