/** C3: actual engine/RPC/storage/content/write owners; only external I/O boundaries are controlled. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestOptions } from 'node:http';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { OAuthSession } from '../src/oauth.js';
import { MessagingStore } from '../src/messaging-store.js';
import { LocalDrafts, type LocalDraft } from '../src/local-drafts.js';
import { Uploads } from '../src/uploads.js';
import { spacesCacheKey } from '../src/spaces-cache.js';
import { until } from './async-test.js';

type StoragePhase = 'open-load' | 'save-load' | 'save-commit';
type WriteKind = 'metadata' | 'upload';
const profile = { clientId: 'c3-mixed-cleanup', clientSecret: 'PRIVATE-SECRET',
  redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] };
const binding = { roomId: 'room', draftId: 'original-native-draft' };
const options = { action: 'open', selectors: [], transfer: 'chunks-v1' };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
};
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const drafts = (account: string): LocalDraft[] => [
  { roomId: 'room', text: 'PRIVATE root ' + account, format: 'markdown', uncertain: false },
  { roomId: 'room', parentId: 'root', text: 'PRIVATE reply ' + account, format: 'plain', uncertain: true },
  { roomId: 'unopened', text: 'PRIVATE unopened ' + account, format: 'plain', uncertain: false },
];
async function fixture(t: TestContext) {
  const directory = await mkdtemp('/tmp/opencode/wbx-c3-matrix-'), config = join(directory, 'config.json'),
    state = join(directory, 'state'), file = join(directory, 'upload.txt');
  await writeFile(config, JSON.stringify({ oauth: profile }), { mode: 0o600 });
  await writeFile(file, 'Synthetic staged C3 bytes');
  let account = 'account-a', failRefresh = false, identityReads = 0, forbidden = 0, cleaning = false;
  const violations: unknown[] = [], trace: string[] = [];
  const check = (work: () => void) => { try { work(); } catch (error) { violations.push(error); throw error; } };
  const forbid = (label: string): never => { forbidden++; throw Error('Forbidden C3 boundary: ' + label); };
  const metrics = { storage: 0, maxStorage: 0, loads: 0, saves: 0, commits: 0,
    content: 0, maxContent: 0, gets: 0, public: 0, maxPublic: 0, puts: 0, upload: 0, maxUpload: 0, posts: 0 };
  const ioPlans: { kind: 'load' | 'save'; entered: ReturnType<typeof deferred>; gate: ReturnType<typeof deferred> }[] = [];
  const retainedPlans: typeof ioPlans = [];
  const io = async <T>(kind: 'load' | 'save', work: () => Promise<T>) => {
    metrics.storage++; metrics.maxStorage = Math.max(metrics.maxStorage, metrics.storage);
    if (kind === 'load') metrics.loads++; else metrics.saves++;
    trace.push('storage.' + kind + '.start');
    const plan = ioPlans[0]?.kind === kind ? ioPlans.shift() : undefined;
    try {
      if (plan) { plan.entered.resolve(); await plan.gate.promise; }
      const result = await work(); if (kind === 'save') metrics.commits++; return result;
    } finally { metrics.storage--; trace.push('storage.' + kind + '.settled'); }
  };
  class Storage extends LocalDrafts {
    override load(key: string) { return io('load', () => super.load(key)); }
    override save(key: string, revision: string, items: LocalDraft[], valid = () => true) {
      return io('save', () => super.save(key, revision, items, valid));
    }
  }
  const disk = new LocalDrafts(state), uploads = new Uploads({ temporaryRoot: directory });
  const key = (actor = account) => spacesCacheKey(config, profile, actor);
  const bytes = (actor = account) => readFile(join(disk.directory, key(actor) + '.json'), 'utf8');
  const titles = new Map(['account-a', 'account-b'].map(actor => [actor, 'Current room ' + actor]));
  const content = { entered: deferred(), headers: deferred(), canceled: deferred(), cleanup: deferred(),
    armed: true, signal: undefined as AbortSignal | undefined };
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(String(input));
    check(() => { assert.equal(url.origin, 'https://webexapis.com'); assert.ok(!init?.method || init.method === 'GET'); });
    const actor = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer C3-', '');
    if (url.pathname === '/v1/rooms') return Response.json({ items: [
      { id: 'room', title: titles.get(actor), type: 'group', lastActivity: '2026-11-01T12:00:00.000Z' },
    ] });
    if (url.pathname === '/v1/messages') return Response.json({ items: [
      { id: 'message-' + actor, roomId: 'room', personId: 'peer', text: 'Current bounded history',
        created: '2026-11-01T12:00:00.000Z', files: ['https://webexapis.com/v1/contents/C3-' + actor] },
    ] });
    if (!url.pathname.startsWith('/v1/contents/C3-')) return forbid('fetch ' + url.pathname);
    metrics.gets++; metrics.content++; metrics.maxContent = Math.max(metrics.maxContent, metrics.content);
    trace.push('content.get');
    if (content.armed) {
      content.armed = false; content.signal = init?.signal ?? undefined; content.entered.resolve();
      await content.headers.promise; // Deliberately ignores abort until the synthetic transport returns.
      return new Response(new ReadableStream({ cancel() {
        content.canceled.resolve(); trace.push('content.cancel');
        return content.cleanup.promise.finally(() => { metrics.content--; trace.push('content.settled'); });
      } }), { headers: { 'Content-Type': 'application/octet-stream' } });
    }
    let ended = false;
    const finish = () => { if (!ended) { ended = true; metrics.content--; } };
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.from('Current attachment ' + actor)); controller.close(); finish();
    }, cancel() { finish(); } }), { headers: { 'Content-Type': 'application/octet-stream' } });
  });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({
    token: 'C3-' + account, scope: 'spark:all', expiresAt: Date.now() + 3600_000,
  }));
  t.mock.method(OAuthSession.prototype, 'refresh', async () => {
    if (failRefresh) { failRefresh = false; throw Error('PRIVATE synthetic application failure'); }
    return { token: 'C3-' + account, scope: 'spark:all', expiresAt: Date.now() + 3600_000 };
  });
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  const write = { entered: deferred(), destroyed: deferred(), armed: true, acked: false, closed: false,
    signal: undefined as AbortSignal | undefined, ack: () => {}, close: () => {} };
  const transport = (kind: WriteKind) => (o: RequestOptions, receive: (response: any) => void): any => {
    check(() => { assert.equal(o.hostname, 'webexapis.com'); assert.equal(o.protocol, 'https:'); assert.equal(o.agent, false); });
    const actor = String((o.headers as Record<string, string>).Authorization).replace('Bearer C3-', '');
    const isWrite = o.method === 'PUT' || o.method === 'POST', held = isWrite && write.armed && !cleaning;
    if (held) write.armed = false;
    const chunks: Buffer[] = [];
    if (kind === 'upload') { metrics.upload++; metrics.maxUpload = Math.max(metrics.maxUpload, metrics.upload); }
    else { metrics.public++; metrics.maxPublic = Math.max(metrics.maxPublic, metrics.public); }
    let closed = false, body: Record<string, string> | undefined, ackId = '';
    const client = Object.assign(new EventEmitter(), {
      write(value: Uint8Array, done: (error?: Error) => void) { chunks.push(Buffer.from(value)); queueMicrotask(() => done()); return true; },
      end(value?: Buffer | (() => void)) {
        if (typeof value !== 'function' && value) chunks.push(Buffer.from(value));
        check(() => {
          if (kind === 'upload') { assert.equal(o.method, 'POST'); assert.equal(o.path, '/v1/messages'); }
          else if (isWrite) {
            assert.equal(o.method, 'PUT'); assert.equal(o.path, '/v1/rooms/room');
            body = JSON.parse(Buffer.concat(chunks).toString()); assert.deepEqual(Object.keys(body!), ['title']);
          }
        });
        if (kind === 'upload') ackId = 'upload-ack-' + ++metrics.posts;
        else if (isWrite) metrics.puts++;
        const respond = () => {
          let value: unknown;
          if (kind === 'upload') value = { id: ackId, roomId: 'room', personId: actor, text: 'Explicit C3 upload',
            created: '2026-11-01T12:01:00.000Z', files: ['https://webexapis.com/v1/contents/' + ackId] };
          else if (o.path === '/v1/people/me') value = { id: actor };
          else if (o.method === 'GET' && o.path === '/v1/rooms/room') value = { id: 'room', type: 'group', title: titles.get(actor), isLocked: false };
          else if (String(o.path).startsWith('/v1/memberships?roomId=room&personId=')) value = {
            items: [{ id: 'own', roomId: 'room', personId: actor, isModerator: false }],
          };
          else if (isWrite) { titles.set(actor, body!.title!); value = { id: 'room', type: 'group', title: body!.title, isLocked: false }; }
          else return forbid('REST ' + o.path);
          receive(Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { statusCode: 200, headers: {} }));
        };
        queueMicrotask(() => {
          if (typeof value === 'function') value();
          if (held && !cleaning) {
            write.signal = o.signal as AbortSignal;
            write.ack = () => { if (!write.acked) { write.acked = true; trace.push('write.ack'); respond(); } };
            write.close = close;
            trace.push('write.submitted'); write.entered.resolve();
          } else respond();
        });
        return client;
      },
      destroy() { if (held) write.destroyed.resolve(); if (!held || cleaning) queueMicrotask(close); return client; },
    });
    function close() {
      if (closed) return;
      closed = true;
      if (kind === 'upload') metrics.upload--; else metrics.public--;
      if (held) { write.closed = true; trace.push('write.closed'); }
      client.emit('close');
    }
    return client;
  };
  const engine = new EditorEngine(async () => forbid('browser'), () => forbid('SDK'), () => forbid('People'),
    () => forbid('meetings'), undefined, { create: () => forbid('cache'), account: async () => { identityReads++; return account; } },
    { messaging: (api, _poll, mode) => new MessagingStore(api, 0, mode),
      localDrafts: new Storage(state), uploads, publicRequest: transport('metadata'), uploadRequest: transport('upload') });
  const packets: any[] = [], events: string[] = [];
  for (const event of ['state', 'delivery', 'direct.delivery', 'upload.progress', 'uploads.invalidated', 'room.revoked'])
    engine.on(event, () => events.push(event));
  const rpc = new EditorRPC(engine, new EditorMeetings(), packet => { packets.push(structuredClone(packet)); });
  let serial = 0;
  const pending: Promise<any>[] = [];
  const begin = (method: string, params: object = {}) => {
    const id = ++serial, wire = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    let settled = false;
    const promise = rpc.receive(wire).then(() => {
      settled = true;
      const packet = packets.find(value => value.id === id); assert.ok(packet, method); return packet;
    });
    void promise.catch(() => {}); pending.push(promise);
    return { id, wire, promise, settled: () => settled };
  };
  const call = (method: string, params: object = {}) => begin(method, params).promise;
  const send = async (method: string, params: object = {}) => {
    const packet = await call(method, params); assert.ok(!packet.error, method + ': ' + JSON.stringify(packet.error)); return packet.result;
  };
  t.after(async () => {
    cleaning = true;
    content.headers.resolve(); content.cleanup.resolve();
    for (const plan of retainedPlans) plan.gate.resolve();
    write.ack(); write.close();
    await Promise.allSettled(pending);
    await rpc.close();
    await until(() => !uploads.diagnostics().sending && !uploads.diagnostics().references && !uploads.diagnostics().cleaning
      && metrics.storage === 0 && metrics.content === 0 && metrics.public === 0 && metrics.upload === 0, 'C3 physical cleanup');
    await rm(directory, { recursive: true, force: true });
    assert.equal(forbidden, 0); assert.deepEqual(violations, [], 'no boundary assertion may be swallowed by a production catch');
  });
  for (const actor of ['account-a', 'account-b']) {
    const empty = await disk.load(key(actor)); await disk.save(key(actor), empty.revision, drafts(actor));
  }
  const start = () => send('session.start', { mode: 'live', config });
  const select = () => send('rooms.select', { roomId: 'room' });
  const resolveParams = () => ({ roomId: 'room', messageId: engine.snapshot().messages[0]!.id,
    attachmentId: engine.snapshot().messages[0]!.attachments![0]!.id, ...options });
  await send('hello', { version: 1 }); await start(); await select();
  return { engine, rpc, uploads, metrics, trace, events, packets, begin, call, send, start, select, bytes, key, file, content, write, resolveParams,
    counts: () => ({ ...metrics, identityReads }), account: () => account, setAccount(value: string) { account = value; },
    fail() { failRefresh = true; return send('auth.refresh'); },
    hold(phase: StoragePhase) {
      const plan = { kind: phase === 'save-commit' ? 'save' as const : 'load' as const, entered: deferred(), gate: deferred() };
      ioPlans.push(plan); retainedPlans.push(plan); return plan;
    },
    unchanged: async (work: () => Promise<void>) => {
      const before = engine.snapshot(), count = events.length;
      await work(); await turn(); await turn();
      assert.deepEqual(engine.snapshot(), before, 'late old I/O cannot alter the current projection');
      assert.equal(events.length, count, 'late old I/O emits no state, delivery, progress or invalidation');
    },
  };
}

for (const invalidation of ['failure', 'stop', 'replacement'] as const)
  for (const phase of ['open-load', 'save-load', 'save-commit'] as const)
    for (const kind of ['metadata', 'upload'] as const)
      for (const order of ['storage-first', 'network-first'] as const)
        test(`C3 simultaneous storage/content/${kind}: ${invalidation}, ${phase}, ${order}`, { timeout: 15_000 }, async t => {
          const f = await fixture(t), owner = f.engine as any, oldStore = owner.store as MessagingStore;
          const opened = await f.send('drafts.open'), originalBytes = await f.bytes('account-a'), bBytes = await f.bytes('account-b');
          const oldSession = f.engine.snapshot().localContext!.sessionId, generation = owner.generation;
          const staged = kind === 'upload' ? await f.send('uploads.stage', { ...binding, path: f.file }) : undefined;
          const hold = f.hold(phase);
          const oldStorage = f.begin(phase === 'open-load' ? 'drafts.open' : 'drafts.save',
            phase === 'open-load' ? {} : { profile: opened.profile, revision: opened.revision,
              items: [{ ...drafts('account-a')[1]!, text: 'PRIVATE retired pending edit', uncertain: false }] });
          await hold.entered.promise;
          const oldContent = f.begin('messages.attachmentResolve', f.resolveParams()); await f.content.entered.promise;
          const oldWrite = kind === 'metadata'
            ? f.begin('rooms.rename', { requestId: 'original', roomId: 'room', expectedTitle: f.engine.snapshot().room!.title,
              title: 'Retired possible title', confirmed: true })
            : f.begin('uploads.send', { ...binding, requestId: 'original', attachmentId: staged.attachmentId, text: '' });
          await f.write.entered.promise;
          assert.equal(f.metrics.storage, 1); assert.equal(f.metrics.content, 1);
          assert.equal(f.metrics.public + f.metrics.upload, 1, 'all three physical consumers actually overlap');
          const retainedFD = kind === 'upload' ? owner.uploads.entries.get(staged.attachmentId).file : undefined;
          if (retainedFD) assert.ok(retainedFD.fd >= 0, 'submitted upload owns a real anonymous snapshot FD');
          assert.equal((await f.send('state.get')).ready, true, 'held optional work does not delay current history');

          f.trace.push('invalidate.' + invalidation);
          if (invalidation === 'failure') {
            await f.fail(); assert.equal(f.engine.snapshot().state, 'failed');
            assert.equal(owner.generation, generation, 'application failure relies on inactive state/closed owners, not a new generation');
          } else {
            await f.send('session.stop'); assert.equal(f.engine.snapshot().state, 'idle');
          }
          if (invalidation === 'replacement') f.setAccount('account-b');
          await until(() => oldContent.settled() && oldWrite.settled(), 'C3 logical cancellation before physical settlement');
          assert.ok((await oldContent.promise).error); assert.ok((await oldWrite.promise).error);
          assert.equal(oldStorage.settled(), false);
          assert.equal(f.content.signal?.aborted, true); assert.equal(f.write.signal?.aborted, true);
          assert.equal(f.metrics.storage, 1); assert.equal(f.metrics.content, 1);
          assert.equal(f.metrics.public + f.metrics.upload, 1, 'abort is not physical release');
          assert.equal(owner.contentAdmission.explicit, true);
          assert.equal(owner.publicREST.busy(), kind === 'metadata');
          assert.equal(owner.conversations.busy(), kind === 'metadata');
          if (retainedFD) assert.ok(retainedFD.fd >= 0);
          assert.equal(owner.attachmentOperations.size, 0); assert.equal(owner.attachmentPipeline, undefined, 'logical pipeline retired independently of physical content admission');
          if (kind === 'metadata') {
            assert.equal(owner.conversations.requests.size, 0);
            assert.equal(owner.conversations.retired.get('original').result.outcome.status, 'unknown');
          } else {
            assert.equal(oldStore.uncertain.has('room'), true);
            assert.equal((oldStore as any).requests.get('original').result.status, 'unknown');
            assert.equal(f.uploads.diagnostics().sending, true);
          }
          let storageDone = false, contentDone = false, writeDone = false;
          const releaseStorage = async () => {
            if (storageDone) return;
            await f.unchanged(async () => {
              hold.gate.resolve();
              assert.equal((await oldStorage.promise).error?.code, -32003, 'retired storage cannot return text/profile or accept a stale commit');
              await until(() => f.metrics.storage === 0, 'C3 old storage settlement');
              f.trace.push('retired.storage.rejected');
            });
            assert.equal(await f.bytes('account-a'), originalBytes);
            assert.equal(await f.bytes('account-b'), bBytes, 'late storage cannot commit either account');
            storageDone = true;
          };
          const releaseContent = async () => {
            if (contentDone) return;
            await f.unchanged(async () => { f.content.headers.resolve(); await f.content.canceled.promise; });
            assert.equal(f.metrics.content, 1, 'late headers do not settle native body cancellation');
            assert.equal(owner.contentAdmission.explicit, true);
            if (f.engine.snapshot().state === 'ready') assert.ok((await f.call('messages.attachmentResolve', f.resolveParams())).error);
            assert.equal(f.metrics.gets, 1);
            await f.unchanged(async () => {
              f.content.cleanup.resolve();
              await until(() => f.metrics.content === 0 && !owner.contentAdmission.explicit, 'C3 content/lease physical settlement');
            });
            assert.equal(f.metrics.gets, 1, 'failed admission was never queued for later replay');
            contentDone = true;
          };
          const releaseWrite = async () => {
            if (writeDone) return;
            await f.unchanged(async () => { f.write.ack(); await f.write.destroyed.promise; });
            assert.equal(f.metrics.public + f.metrics.upload, 1, 'valid late ACK is not socket-close/FD settlement');
            if (retainedFD) assert.ok(retainedFD.fd >= 0);
            const blocked = await f.call('messages.send', { requestId: 'still-blocked', roomId: 'room', text: 'Not queued' });
            assert.equal(blocked.error.code, f.engine.snapshot().state === 'ready' ? -32002 : -32003);
            await f.unchanged(async () => {
              f.write.close();
              await until(() => f.metrics.public + f.metrics.upload === 0
                && !owner.conversations.busy() && !f.uploads.diagnostics().sending && !f.uploads.diagnostics().references, 'C3 write/FD physical settlement');
            });
            if (retainedFD) assert.equal(retainedFD.fd, -1, 'old anonymous snapshot closes only after the held native write drains');
            assert.equal(f.metrics.puts + f.metrics.posts, 1);
            writeDone = true;
          };
          // Exercise failed()/stop() themselves before restart, not only their
          // subsequent generation fence. Replacement instead keeps all three
          // consumers held until account B is ready.
          if (invalidation !== 'replacement') {
            if (order === 'storage-first') await releaseStorage();
            else { await releaseContent(); await releaseWrite(); }
            assert.equal(f.engine.snapshot().state, invalidation === 'failure' ? 'failed' : 'idle');
            if (invalidation === 'failure') assert.equal(owner.generation, generation);
            f.trace.push('inactive.partial-settlement');
          }
          await f.start(); await f.select();
          f.trace.push('replacement.ready');
          assert.notEqual(f.engine.snapshot().localContext!.sessionId, oldSession);
          assert.equal(f.engine.snapshot().ready, true);
          assert.equal(f.engine.snapshot().uncertain, false, 'old possible-write evidence is not new-account authority');
          const counts = f.counts();
          if (!storageDone) assert.equal((await f.call('drafts.open')).error?.code, -32002, 'held physical draft I/O cannot be released by a logical reset');
          if (!contentDone) assert.ok((await f.call('messages.attachmentResolve', f.resolveParams())).error);
          if (!writeDone) assert.equal((await f.call('messages.send', { requestId: 'blocked-write', roomId: 'room', text: 'Not queued' })).error.code, -32002);
          assert.equal(f.metrics.loads, counts.loads); assert.equal(f.metrics.gets, counts.gets);
          assert.equal(f.counts().identityReads, 1, 'restart and refused I/O do not automatically probe/restore private drafts');
          assert.equal(f.metrics.puts + f.metrics.posts, 1, 'no retry or queued mutation after failure/stop/replacement');
          await f.rpc.receive(oldWrite.wire);
          assert.equal(f.metrics.puts + f.metrics.posts, 1, 'RPC replay repeats evidence only');

          const deliberateStorage = async () => {
            const current = await f.send('drafts.open');
            assert.equal(current.profile, f.key()); assert.notEqual(current.sessionId, opened.sessionId);
            assert.deepEqual(current.items, drafts(f.account()));
            if (invalidation === 'replacement') {
              assert.notEqual(current.profile, opened.profile);
              assert.equal((await f.call('drafts.save', { profile: opened.profile, revision: opened.revision, items: drafts('account-a') })).error.code, -32002);
            }
            const patch = { ...drafts(f.account())[0]!, text: 'PRIVATE deliberate current edit' };
            await f.send('drafts.save', { profile: current.profile, revision: current.revision, items: [patch] });
            const saved = await f.send('drafts.open');
            assert.deepEqual(saved.items, [patch, ...drafts(f.account()).slice(1)], 'explicit save retains exact reply uncertainty and unopened destinations');
            assert.equal(f.counts().identityReads, 2, 'one verified identity per explicit storage session, not per overlapping consumer');
            f.trace.push('fresh.storage.saved');
          };
          if (order === 'storage-first') {
            await releaseStorage(); await deliberateStorage();
            assert.equal(f.metrics.content, 1); assert.equal(f.metrics.public + f.metrics.upload, 1);
          }
          await releaseContent();
          const freshContent = f.begin('messages.attachmentResolve', f.resolveParams()), descriptor = (await freshContent.promise).result;
          assert.equal(descriptor.body.payload.mode, 'chunks'); assert.equal(f.metrics.gets, 2);
          f.trace.push('fresh.content.descriptor');
          await releaseWrite();
          if (kind === 'metadata') {
            assert.ok((await f.call('conversations.resolve', { action: 'rename', roomId: 'room', requestId: 'wrong', checked: true })).error);
            const recovered = await f.call('conversations.resolve', { action: 'rename', roomId: 'room', requestId: 'original', checked: true });
            if (invalidation === 'replacement') assert.equal(recovered.error.code, -32035);
            else assert.equal(recovered.result, null);
            await f.send('rooms.list'); // Fresh deliberate observation, not installation from the retired ACK.
            const result = await f.send('rooms.rename', { requestId: 'deliberate', roomId: 'room',
              expectedTitle: f.engine.snapshot().room!.title, title: 'Deliberate current title', confirmed: true });
            assert.equal(result.status, 'changed'); assert.equal(f.engine.snapshot().room!.title, 'Deliberate current title');
          } else {
            assert.equal(oldStore.uncertain.has('room'), true, 'late ACK never reclassifies the original unknown as sent');
            const freshBinding = { roomId: 'room', draftId: 'deliberate-new-draft' };
            const freshFile = await f.send('uploads.stage', { ...freshBinding, path: f.file });
            await f.send('uploads.send', { ...freshBinding, attachmentId: freshFile.attachmentId, requestId: 'deliberate', text: '' });
            assert.ok(f.engine.snapshot().messages.some(message => message.id === 'upload-ack-2'));
            assert.equal(f.packets.filter(packet => packet.method === 'delivery' && packet.params.requestId === 'deliberate' && packet.params.status === 'sent').length, 1);
          }
          f.trace.push('fresh.write.confirmed');
          assert.equal(f.metrics.puts + f.metrics.posts, 2, 'only one subsequent deliberate mutation was submitted');
          if (order === 'network-first') {
            assert.equal(f.metrics.storage, 1);
            await releaseStorage(); await deliberateStorage();
          }
          const p = descriptor.body.payload;
          const chunk = await f.send('messages.attachmentChunk', { requestId: freshContent.id, transferId: p.transferId, seq: 0, offset: 0 });
          assert.equal(Buffer.from(chunk.data, 'base64').toString(), 'Current attachment ' + f.account(), 'late sibling cleanup cannot clear a fresh transfer or publish old bytes');
          await f.send('messages.attachmentComplete', { requestId: freshContent.id, transferId: p.transferId, chunks: p.chunks,
            decodedBytes: descriptor.body.decodedBytes, encodedBytes: p.encodedBytes, sha256: p.sha256 });
          assert.equal(owner.attachmentPipeline, undefined);
          f.trace.push('fresh.transfer.complete');
          assert.equal(f.metrics.maxStorage, 1); assert.equal(f.metrics.maxContent, 1);
          assert.ok(f.metrics.maxPublic <= 1); assert.ok(f.metrics.maxUpload <= 1);
          assert.equal(f.metrics.commits, 1, 'retired pending saves never commit, only the explicit current save');
          assert.doesNotMatch(JSON.stringify(f.engine.snapshot()), /PRIVATE|Retired possible title/);
          assert.equal(f.packets.filter(packet => packet.method === 'delivery' && packet.params.requestId === 'original').length, 0);
          assert.equal(f.packets.filter(packet => packet.id === oldContent.id).every(packet => !packet.result), true);
          if (invalidation === 'replacement') {
            await f.send('session.stop'); f.setAccount('account-a'); await f.start(); await f.select();
            assert.deepEqual((await f.send('drafts.open')).items, drafts('account-a'), 'return to original account retains exact original text and uncertainty');
            if (kind === 'metadata') {
              assert.equal(owner.conversations.retired.get('original').resolved, undefined, 'wrong-account recovery did not consume original evidence');
              await f.send('conversations.resolve', { action: 'rename', roomId: 'room', requestId: 'original', checked: true });
            } else assert.equal(oldStore.uncertain.has('room'), true);
            assert.equal(f.metrics.puts + f.metrics.posts, 2, 'return/check never retries an original write');
          }
          t.diagnostic(JSON.stringify({ invalidation, phase, kind, order, simultaneousConsumers: 3, physicalMaxPerOwner: 1,
            originalWriteSubmissions: 1, deliberateWriteSubmissions: 1, latePublications: 0, replayedMutations: 0,
            retainedReplyUncertainty: true, freshStorageContentAndWriteSucceeded: true, anonymousUploadFD: kind === 'upload',
            explicitStorageIdentities: f.counts().identityReads }));
          t.diagnostic(JSON.stringify({ trace: f.trace }));
        });
