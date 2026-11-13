import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { MessagingStore } from '../src/messaging-store.js';
import { Uploads, UploadFailure, type UploadSource, type SnapshotBinding } from '../src/uploads.js';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await turn();
  assert.ok(check(), 'bounded physical upload settlement');
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-demo-recipient-file-'), path = join(directory, 'local.bin');
  const bytes = Buffer.from('Synthetic staged bytes 😀\n'.repeat(4000)); await writeFile(path, bytes);
  let forbidden = 0, failRead = false, postFault: 'lost' | 'malformed' | undefined;
  let streamGate: { gate: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> } | undefined;
  let postGate: { gate: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> } | undefined;
  const held: ReturnType<typeof deferred>[] = [], consumed: Buffer[][] = [];
  class Files extends Uploads {
    override send<T>(id: string, binding: SnapshotBinding, valid: () => boolean,
      run: (source: UploadSource, signal: AbortSignal, submitted: () => void) => Promise<T>, parent?: AbortSignal): Promise<T> {
      return super.send(id, binding, valid, async (source, signal, submitted) => {
        const chunks: Buffer[] = []; consumed.push(chunks);
        const gate = streamGate; streamGate = undefined;
        const failure = failRead; failRead = false;
        return run({ ...source, async *read(active) {
          gate?.started.resolve(); if (gate) await gate.gate.promise;
          for await (const chunk of source.read(active)) {
            chunks.push(Buffer.from(chunk)); if (failure) throw new UploadFailure('failed'); yield chunk;
          }
        } }, signal, submitted);
      }, parent);
    }
  }
  const posts: { store: number; input: Record<string, unknown> }[] = [], stores: MessagingStore[] = [];
  class Store extends MessagingStore {
    override async demoConversation(action: string, input: Record<string, unknown>) {
      if (action !== 'direct') return super.demoConversation(action, input);
      posts.push({ store: stores.indexOf(this), input });
      const gate = postGate; postGate = undefined; gate?.started.resolve(); if (gate) await gate.gate.promise;
      const value = await super.demoConversation(action, input), fault = postFault; postFault = undefined;
      if (fault === 'lost') throw Error('PRIVATE synthetic lost file ACK');
      if (fault === 'malformed') return { ...(value as object), files: [] };
      return value;
    }
  }
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(net.Socket.prototype, 'connect', function () { forbidden++; throw Error('SOCKET FORBIDDEN'); });
  const uploads = new Files({ temporaryRoot: directory });
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), undefined, undefined, undefined, undefined, undefined, {
    uploads, messaging: (api, poll, mode) => { const store = new Store(api, poll, mode); stores.push(store); return store; },
    uploadRequest: () => assert.fail('No live multipart transport in demo'),
  });
  const packets: any[] = [], deliveries: unknown[] = [], direct: any[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => direct.push(value));
  const rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value)); let id = 0;
  const call = async (method: string, params = {}) => {
    const key = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }));
    const reply = packets.find(packet => packet.id === key); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  t.after(async () => {
    for (const gate of held) gate.resolve(); engine.stop(); await rpc.close();
    await until(() => !uploads.diagnostics().references && !uploads.diagnostics().cleaning && !uploads.diagnostics().sending);
    await rm(directory, { recursive: true, force: true });
  });
  await send('hello', { version: 1 });
  return { engine, uploads, path, bytes, posts, stores, consumed, deliveries, direct, call, send,
    async start() { await send('session.start', { mode: 'demo' }); await send('rooms.select', { roomId: 'demo-general' }); },
    async recipient(person = 'file-peer') { return send('direct.prepare', { person }); },
    async stage(targetId: string, draftId = 'recipient-draft') { return send('uploads.stage', { targetId, draftId, path }); },
    failRead() { failRead = true; }, fault(value: 'lost' | 'malformed') { postFault = value; },
    hold(stage: 'stream' | 'post') {
      const gate = deferred(), started = deferred(); held.push(gate);
      if (stage === 'stream') streamGate = { gate, started }; else postGate = { gate, started };
      return { started: started.promise, release: gate.resolve };
    },
    settled: () => until(() => !uploads.diagnostics().sending), forbidden: () => forbidden,
  };
}
const params = (targetId: string, attachmentId: string, requestId: string, text = 'Exact file caption') =>
  ({ targetId, attachmentId, requestId, draftId: 'recipient-draft', text, confirmed: true });

test('ordinary demo recipient-file RPC sends immutable plain first file then exact Markdown bound-room file and file-only zero bytes', async t => {
  const f = await fixture(t); await f.start(); const before = f.engine.snapshot(), recipient = await f.recipient();
  const first = await f.stage(recipient.targetId); await writeFile(f.path, 'Replaced path is never the staged snapshot');
  assert.deepEqual(f.engine.snapshot().rooms, before.rooms, 'preparation/staging do not create placeholders');
  const intent = params(recipient.targetId, first.attachmentId, 'plain-first');
  const outcome = await f.send('direct.send', intent); assert.equal(outcome.status, 'changed');
  assert.deepEqual(Buffer.concat(f.consumed[0]!), f.bytes);
  assert.equal(f.posts[0]!.input.toPersonId, 'file-peer'); assert.equal(f.posts[0]!.input.roomId, undefined);
  assert.equal(f.posts[0]!.input.text, intent.text); assert.equal(f.posts[0]!.input.file, true);
  await f.send('direct.send', intent); assert.equal(f.posts.length, 1, 'exact replay performs no second stream or post');
  assert.equal(f.consumed.length, 1);
  const second = await f.stage(recipient.targetId), markdown = '  **résumé 😀**\n`literal`\n';
  const rich = await f.send('direct.send', { ...params(recipient.targetId, second.attachmentId, 'rich-later', markdown), format: 'markdown' });
  assert.equal(rich.status, 'changed'); assert.equal(rich.roomId, outcome.roomId);
  assert.equal(f.posts[1]!.input.roomId, outcome.roomId); assert.equal(f.posts[1]!.input.toPersonId, undefined);
  assert.equal(f.posts[1]!.input.markdown, markdown); assert.equal(f.posts[1]!.input.text, undefined);
  await writeFile(f.path, ''); const empty = await f.stage(recipient.targetId);
  assert.equal((await f.send('direct.send', params(recipient.targetId, empty.attachmentId, 'file-only', ''))).status, 'changed');
  assert.equal(Buffer.concat(f.consumed[2]!).length, 0); assert.equal(f.posts.length, 3);
  assert.equal(f.engine.snapshot().room!.id, before.room!.id); assert.deepEqual(f.engine.snapshot().messages, before.messages);
  assert.deepEqual(f.deliveries, []); assert.equal(f.forbidden(), 0);
  await f.send('rooms.select', { roomId: outcome.roomId });
  assert.equal(f.engine.snapshot().messages.length, 3); assert.equal(f.engine.snapshot().messages[1]!.markdown, markdown);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file ordinary sends', posts: 3, replayedPosts: 0,
    immutableSnapshot: true, exactBoundRoom: true, normalDeliveries: 0, nativeRequests: 0 }));
});

test('ordinary demo recipient-file RPC rejects unconfirmed and wrong snapshot targets without streaming then recovers exact binding', async t => {
  const f = await fixture(t); await f.start();
  const recipient = await f.recipient(), foreign = await f.recipient('other-file-peer'), staged = await f.stage(recipient.targetId);
  const intent = params(recipient.targetId, staged.attachmentId, 'right-binding');
  assert.equal((await f.call('direct.send', { ...intent, confirmed: false })).error.code, -32602);
  const wrong = await f.send('direct.send', { ...intent, targetId: foreign.targetId, requestId: 'wrong-target' });
  assert.equal(wrong.status, 'failed'); assert.equal(f.posts.length + f.consumed.length, 0);
  const wrongDraft = await f.send('direct.send', { ...intent, draftId: 'wrong-draft', requestId: 'wrong-draft' });
  assert.equal(wrongDraft.status, 'failed'); assert.equal(f.posts.length + f.consumed.length, 0);
  assert.equal((await f.send('direct.send', intent)).status, 'changed'); assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0]!.input.personId, 'file-peer'); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file exact binding', invalidTargetPosts: 0,
    invalidDraftStreams: 0, explicitRecoveryPosts: 1 }));
});

test('ordinary demo recipient-file RPC pre-submission read failure retains snapshot and recovers only on a new explicit request', async t => {
  const f = await fixture(t); await f.start(); const recipient = await f.recipient(), staged = await f.stage(recipient.targetId);
  const intent = params(recipient.targetId, staged.attachmentId, 'read-failure'); f.failRead();
  const failed = await f.send('direct.send', intent); assert.equal(failed.status, 'failed');
  await f.settled(); assert.equal(f.posts.length, 0); assert.equal(f.uploads.diagnostics().references, 1);
  const reads = f.consumed.length; await turn(); await f.send('direct.send', intent);
  assert.equal(f.consumed.length, reads, 'failed-result replay does not retry the stream');
  assert.equal((await f.send('direct.send', { ...intent, requestId: 'explicit-read-recovery' })).status, 'changed');
  assert.deepEqual(Buffer.concat(f.consumed.at(-1)!), f.bytes); assert.equal(f.posts.length, 1); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file read recovery', automaticRetries: 0,
    failedReadPosts: 0, snapshotRetained: true, explicitRecoveryPosts: 1 }));
});

for (const fault of ['lost', 'malformed'] as const) test(`ordinary demo recipient-file RPC ${fault} ACK retains uncertainty until explicit recipient recovery without replay`, async t => {
  const f = await fixture(t); await f.start(); const recipient = await f.recipient(), staged = await f.stage(recipient.targetId);
  const intent = params(recipient.targetId, staged.attachmentId, 'unknown-file'); f.fault(fault);
  const unknown = await f.send('direct.send', intent); assert.equal(unknown.status, 'unknown');
  await f.settled(); await turn(); assert.equal(f.posts.length, 1);
  assert.deepEqual(await f.send('direct.send', intent), unknown); assert.equal(f.posts.length, 1);
  assert.equal((await f.call('direct.send', { ...intent, requestId: 'blocked-new' })).error.code, -32035);
  assert.equal((await f.call('direct.resolve', { targetId: 'f'.repeat(32) })).error.code, -32035);
  assert.equal(f.posts.length, 1); assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE/);
  await f.send('direct.resolve', { targetId: recipient.targetId });
  const recovered = await f.send('direct.send', { ...intent, requestId: 'explicit-file-recovery', text: 'User deliberately chose another file send' });
  assert.equal(recovered.status, 'changed'); assert.equal(f.posts.length, 2);
  assert.equal(f.posts[1]!.input.toPersonId, 'file-peer', 'unknown result never guessed/adopted the returned room');
  assert.deepEqual(f.deliveries, []); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file unknown recovery ' + fault,
    admittedPosts: 2, automaticRetries: 0, replayedPosts: 0, wrongTargetResolutions: 0, explicitRecovery: true }));
});

test('ordinary demo recipient-file RPC held stream keeps shared upload admission and only the explicit send posts after release', async t => {
  const f = await fixture(t); await f.start(); const recipient = await f.recipient(), staged = await f.stage(recipient.targetId);
  const held = f.hold('stream'), pending = f.send('direct.send', params(recipient.targetId, staged.attachmentId, 'held-file'));
  await held.started;
  assert.equal(f.uploads.diagnostics().sending, true); assert.equal(f.posts.length, 0);
  assert.equal((await f.call('direct.prepare', { person: 'blocked-peer' })).error.code, -32002);
  assert.equal((await f.call('messages.send', { requestId: 'not-queued', roomId: 'demo-general', text: 'Not queued' })).error.code, -32002);
  held.release(); assert.equal((await pending).status, 'changed'); await f.settled();
  assert.equal(f.posts.length, 1); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file held stream', overlappingPosts: 0,
    postsBeforeRelease: 0, postsAfterRelease: 1, queuedSends: 0 }));
});

for (const stage of ['stream', 'post'] as const) test(`ordinary demo recipient-file RPC session replacement during ${stage} retains physical admission and rejects late delivery`, async t => {
  const f = await fixture(t); await f.start(); const recipient = await f.recipient(), staged = await f.stage(recipient.targetId);
  const held = f.hold(stage), pending = f.call('direct.send', params(recipient.targetId, staged.attachmentId, 'old-session-file'));
  await held.started; await f.send('session.stop'); await f.start(); const before = f.engine.snapshot();
  const failed = await pending; assert.equal(failed.error.code, -32004);
  assert.equal(f.uploads.diagnostics().sending, true, 'logical reset cannot release the held source/post');
  assert.equal((await f.call('direct.prepare', { person: 'new-file-peer' })).error.code, -32002);
  held.release(); await f.settled(); await turn();
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.direct, []); assert.deepEqual(f.deliveries, []);
  assert.ok(f.posts.every(post => post.store === 0), 'no old file is posted through the replacement store');
  assert.equal(f.posts.length, stage === 'stream' ? 0 : 1);
  const next = await f.recipient('new-file-peer'), nextFile = await f.stage(next.targetId);
  const changed = await f.send('direct.send', params(next.targetId, nextFile.attachmentId, 'new-session-file'));
  assert.equal(changed.status, 'changed'); assert.equal(f.posts.at(-1)!.store, 1);
  assert.equal(f.posts.at(-1)!.input.personId, 'new-file-peer'); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo recipient file replacement ' + stage,
    lateDeliveries: 0, replacementStoreOldPosts: 0, overlappingPosts: 0, explicitNewSessionRecovery: true }));
});
