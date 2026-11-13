import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { ReadStatusWorker, type ReadStatusSource } from '../src/read-status.js';
import { parseMessageCreated, validReadStatusRequest } from '../src/read-status-protocol.js';
import { parseEditorOperation, parseEditorRequest } from '../src/editor-protocol.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
test('REST history keeps validated person identity separate from legacy labels and ignores supplied display names', async () => {
  const api = new WebexMessagingAPI(() => 'SYNTHETIC', async () => Response.json({ items:
    ['person', '../invalid', 'me', undefined].map((personId, i) => ({
      id: 'm-' + i, roomId: 'room', created: new Date().toISOString(), text: 'Synthetic', personId,
      personEmail: 'legacy@example.invalid', senderName: 'UNTRUSTED', displayName: 'UNTRUSTED',
    })),
  }));
  try {
    const { items } = await api.history('room');
    assert.equal(items.length, 4);
    assert.deepEqual(items.map(item => item.authorId), ['person', undefined, undefined, undefined]);
    assert.ok(items.every(item => item.author === 'legacy@example.invalid' && item.senderName === undefined));
  } finally { api.close(); }
});
async function fixture(t: TestContext, enabled: boolean, scopes = 'spark:all', fetcher?: typeof fetch) {
  const directory = await mkdtemp('/tmp/opencode/wbx-senders-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'SYNTHETIC-ONLY', scope: scopes, expiresAt: Date.now() + 3600_000 };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'refresh', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  let forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('LIVE NETWORK FORBIDDEN'); });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'room', title: 'Synthetic', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: Array.from({ length: 50 }, (_, i) => ({
    id: 'message-' + i, author: 'legacy@example.invalid', authorId: 'person', text: 'Synthetic', created: new Date().toISOString(),
  })) }));
  t.mock.method(WebexMessagingAPI.prototype, 'send', async () => { throw new Error('POST FORBIDDEN'); });
  const sources: ReadStatusSource[] = [], consent: unknown[][] = [], calls: string[] = [];
  const engine = new EditorEngine(undefined, () => {
    const source: ReadStatusSource = { onRooms() {}, onFailure() {}, start: async (...args) => { consent.push(args.slice(1)); },
      markRead: async () => { throw new Error('RECEIPT FORBIDDEN'); }, close() {} };
    sources.push(source); return source;
  }, undefined, undefined, undefined, undefined, { senderFetch: async (url, options) => {
    calls.push(String(url)); assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    return fetcher ? fetcher(url, options) : Response.json({ id: 'person', displayName: 'Alice\n\u202e <tag>', type: 'person', emails: ['PRIVATE'], status: 'call' });
  } });
  t.after(async () => { engine.stop(); assert.equal(forbidden, 0); await rm(directory, { recursive: true, force: true }); });
  await engine.startSession({ mode: 'live', config, readStatus: true, notificationPreview: true, senderNames: enabled });
  return { engine, sources, consent, calls, access };
}
test('sender consent is default false and strictly typed; raw event identity needs independent preview and sender consent', () => {
  const start = (senderNames?: unknown) => parseEditorOperation(parseEditorRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.start', params: { mode: 'demo', ...(senderNames === undefined ? {} : { senderNames }) } })));
  assert.equal('senderNames' in start().params, false);
  assert.equal('senderNames' in start(false).params, false);
  assert.equal('senderNames' in start(true).params, true);
  for (const value of [null, 0, 'true', {}]) assert.throws(() => start(value));
  const data = { id: 'message', roomId: 'room', created: new Date().toISOString(), personId: 'person', text: 'Excerpt', displayName: 'UNTRUSTED' };
  assert.equal(parseMessageCreated({ data }, undefined, false, true)?.senderId, undefined);
  assert.equal(parseMessageCreated({ data }, undefined, true, false)?.senderId, undefined);
  assert.equal(parseMessageCreated({ data }, undefined, true, true)?.senderId, 'person');
  assert.equal(parseMessageCreated({ data: { ...data, personId: '../invalid' } }, undefined, true, true)?.senderId, undefined);
  const credentials = { token: 'SYNTHETIC', scope: 'spark:all', expiresAt: Date.now() + 10000 };
  assert.equal(validReadStatusRequest({ type: 'start', credentials, senderNames: true }), false);
  assert.equal(validReadStatusRequest({ type: 'start', credentials, preview: true, senderNames: true }), true);
});
for (const enabled of [false, true]) test(`history and notifications share the name cache without exposing source IDs (enabled=${enabled})`, async t => {
  const gate = deferred<Response>(), f = await fixture(t, enabled, 'spark:all', () => gate.promise);
  const source = f.sources[0]!;
  source.onHealth!('live');
  await f.engine.select('room');
  assert.equal(f.calls.length, enabled ? 1 : 0, '50 repeated authors use at most one profile GET');
  const before = f.engine.snapshot(), rooms = before.rooms;
  const event = { id: 'other-client', roomId: 'room', created: new Date().toISOString(), self: true, preview: 'First words', ...(enabled ? { senderId: 'person' } : {}) };
  source.onMessages!([event]); source.onMessages!([event]);
  const observedAt = f.engine.snapshot().messageEvents.items[0]!.observedAt;
  assert.equal(f.engine.snapshot().messageEvents.received, 1);
  assert.ok(!JSON.stringify(f.engine.snapshot()).includes('"senderId"'));
  assert.ok(!JSON.stringify(f.engine.snapshot()).includes('"authorId"'));
  assert.equal(f.engine.snapshot().messages[0]!.author, 'legacy@example.invalid');
  gate.resolve(Response.json({ id: 'person', type: 'person', displayName: 'Alice\n\u202e <tag>', emails: ['PRIVATE'], customStatus: 'PRIVATE' }));
  await tick(); await tick();
  const after = f.engine.snapshot();
  assert.equal(after.messages[0]!.author, enabled ? 'Alice <tag>' : 'legacy@example.invalid');
  assert.equal(after.messageEvents.items[0]!.senderName, enabled ? 'Alice <tag>' : undefined);
  assert.equal(after.messageEvents.received, 1); assert.equal(after.messageEvents.items[0]!.observedAt, observedAt);
  assert.deepEqual(after.rooms, rooms);
  assert.ok(!JSON.stringify(after).includes('PRIVATE'));
  for (let i = 0; i < 100; i++) f.engine.snapshot();
  await f.engine.history(); await tick(); assert.equal(f.calls.length, enabled ? 1 : 0);
  const revision = f.engine.snapshot().revision;
  source.onMessages!([{ ...event, id: 'wrong-consent', senderId: '../private' }]);
  assert.equal(f.engine.snapshot().revision, revision);
  await assert.rejects(f.engine.startSession({ mode: 'live', readStatus: true, notificationPreview: true, senderNames: !enabled }), /Disconnect/);
});
test('unknown grants never start lookups or consent to private sender IDs', async t => {
  const f = await fixture(t, true, 'spark:rooms_read spark:messages_read');
  await f.engine.select('room'); await tick();
  assert.deepEqual(f.calls, []); assert.equal(f.engine.snapshot().senderNames, undefined);
  assert.equal(f.engine.snapshot().messages[0]!.senderName, undefined);
});
test('grant replacement erases names and late profile responses cannot change the new session projection', async t => {
  const gate = deferred<Response>(), f = await fixture(t, true, 'spark:all', () => gate.promise);
  await f.engine.select('room'); assert.equal(f.calls.length, 1);
  f.access.scope = 'spark:rooms_read spark:messages_read';
  await f.engine.refreshAuth();
  const revision = f.engine.snapshot().revision;
  gate.resolve(Response.json({ id: 'person', displayName: 'OLD ACCOUNT' })); await tick(); await tick();
  assert.equal(f.engine.snapshot().revision, revision);
  assert.equal(f.engine.snapshot().senderNames, undefined);
  assert.equal(f.engine.snapshot().messages[0]!.author, 'legacy@example.invalid');
});
test('ordinary credential renewal cannot clear a profile denial latch or retry it on history refresh', async t => {
  const f = await fixture(t, true, 'spark:all', async () => new Response('', { status: 403 }));
  await f.engine.select('room'); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.engine.snapshot().senderNames, undefined);
  f.access.token = 'SYNTHETIC-RENEWED';
  await f.engine.refreshAuth(); await f.engine.history(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.engine.snapshot().senderNames, undefined);
});
for (const enabled of [false, true]) test(`actual private IPC independently rejects an unconsented sender identity (enabled=${enabled})`, async () => {
  const worker = new ReadStatusWorker(new URL('./read-status-worker-fixture.mjs', import.meta.url).pathname, 2000);
  const values: unknown[] = [], failures: unknown[] = [];
  const received = new Promise<void>(resolve => {
    worker.onMessages = items => { values.push(...items); resolve(); };
    worker.onFailure = reason => { failures.push(reason); resolve(); };
  });
  try {
    await worker.start({ token: 'message-sender', scope: 'spark:all', expiresAt: Date.now() + 10000 }, true, enabled);
    await received;
    assert.equal(values.length, enabled ? 1 : 0);
    assert.deepEqual(failures, enabled ? [] : ['invalid-data']);
  } finally {
    const child = (worker as unknown as { child: ChildProcess }).child;
    const exit = child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
    worker.close(); await exit;
  }
});
