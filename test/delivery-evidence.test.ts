import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebexMessagingAPI, MessagingError } from '../src/messaging-api.js';
import { MessagingStore, type Delivery } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { PublicREST, type PublicMethod, type ActionREST } from '../src/public-rest.js';
import { ConversationActions } from '../src/conversation-actions.js';
import { MessageActions } from '../src/message-actions.js';
import { RoomMembers } from '../src/room-members.js';

const created = '2026-11-16T10:00:00.000Z';
for (const action of ['create', 'edit', 'delete'] as const) test(`request construction failure is definitely not submitted for ${action}`, async () => {
  let constructions = 0;
  const transport = new PublicREST(() => { constructions++; throw new Error('Synthetic request construction refusal'); });
  const raw = { id: 'message', roomId: 'room', personId: 'self', text: 'Original', created };
  const paths: string[] = [];
  const rest: ActionREST = { busy: () => transport.busy(), settled: () => transport.settled(),
    call: async (path, method, token, signal, body) => {
      paths.push(method + ' ' + path);
      if (method !== 'GET') return transport.call(path, method, token, signal, body);
      return { value: path === '/v1/people/me' ? { id: 'self' } : raw };
    } };
  const access = { token: 'SYNTHETIC', scopes: ['spark:all'], expiresAt: Date.now() + 600000 };
  if (action === 'create') {
    const owner = new ConversationActions(rest, new RoomMembers(), () => access, async () => 'self');
    assert.equal((await owner.create('create', 'Room title', () => true)).outcome.status, 'failed');
    assert.deepEqual(paths, ['POST /v1/rooms']);
  } else {
    const owner = new MessageActions(rest, () => access), context = await owner.prepare('room', 'message', action, () => true);
    const result = await owner.submit({ contextId: context.contextId, requestId: action, action, revision: 0,
      ...(action === 'edit' ? { content: 'New content', format: 'plain' as const } : {}), conflictAccepted: true }, () => true);
    assert.equal(result.outcome.status, 'failed');
    assert.ok(await owner.prepare('room', 'message', action, () => true), 'no possible-write latch was invented');
  }
  assert.equal(constructions, 1, 'construction failure is not automatically replayed');
});

for (const change of [
  { text: 'different' }, { created: undefined }, { created: 'not-a-date' },
  { errors: [] }, { error: 'refused' }, { roomId: 'other' }, { parentId: 'unexpected' }, { files: ['unexpected'] },
]) test(`plaintext raw ACK refuses ${JSON.stringify(change)} before display projection`, async () => {
  let posts = 0;
  const api = new WebexMessagingAPI(() => 'SYNTHETIC', async (_url, init) => {
    posts++;
    return Response.json({ id: 'ack', ...JSON.parse(String(init!.body)), created, ...change });
  });
  try {
    await assert.rejects(api.send('room', 'Exact submitted text'), error => error instanceof MessagingError && error.reason === 'unknown');
    assert.equal(posts, 1, 'invalid acknowledgment never replays the write');
  } finally { api.close(); }
});

test('a reused message ID cannot become a successful new-send acknowledgment', async () => {
  const raw = { id: 'existing', roomId: 'room', text: 'Exact submitted text', created };
  const api = new WebexMessagingAPI(() => 'SYNTHETIC', async (url, init) => init?.method === 'POST'
    ? Response.json(raw)
    : Response.json({ items: String(url).includes('/rooms') ? [{ id: 'room', type: 'group', title: 'Room' }] : [raw] }));
  const store = new MessagingStore(api, 0), deliveries: Delivery[] = [];
  store.onDelivery = result => deliveries.push(result);
  try {
    await store.loadRooms(); await store.select('room');
    await store.send('new', 'room', raw.text);
    assert.equal(deliveries.at(-1)!.status, 'unknown');
    assert.equal(store.uncertain.has('room'), true);
  } finally { store.close(); }
});

for (const text of [' **Exact Markdown**\n', '\n**Second formatted**  ']) {
  test(`live rich ACK validates raw whitespace ${JSON.stringify(text)} before display trimming`, async t => {
    const directory = await mkdtemp('/tmp/opencode/wbx-raw-rich-'), config = join(directory, 'config.json');
    await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic',
      redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
    t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'SYNTHETIC', expiresAt: Date.now() + 600000, scope: 'spark:messages_write' }));
    t.mock.method(OAuthSession.prototype, 'watch', () => {});
    t.mock.method(globalThis, 'fetch', async () => { throw Error('LIVE NETWORK FORBIDDEN'); });
    t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'room', title: 'Room', type: 'group' as const, lastActivity: '' }] }));
    t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [] }));
    const calls: unknown[][] = [];
    t.mock.method(PublicREST.prototype, 'call', async (path: string, method: PublicMethod, _token: string, _signal: AbortSignal, body?: object) => {
      calls.push([path, method, body]);
      return { value: { id: 'ack', ...body, created } };
    });
    const engine = new EditorEngine(), deliveries: Delivery[] = [];
    engine.on('delivery', value => deliveries.push(value));
    try {
      await engine.start('live', config); await engine.select('room');
      await engine.sendRich('rich', text, { roomId: 'room', draftId: 'draft' }, {});
      assert.deepEqual(calls, [['/v1/messages', 'POST', { roomId: 'room', markdown: text }]]);
      assert.equal(deliveries.at(-1)!.status, 'sent');
      assert.equal(deliveries.at(-1)!.draftId, 'draft', 'native confirmation retains exact request/draft correlation');
      assert.equal(deliveries.at(-1)!.messageId, 'ack');
      assert.equal(deliveries.at(-1)!.format, 'markdown');
      assert.equal(deliveries.at(-1)!.text, undefined, 'ordinary rich ACK need not echo draft content on the wire');
      assert.equal(engine.snapshot().uncertain, false);
    } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
  });
}
