import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebexMessagingAPI, MessagingError, demoMessageAPI } from '../src/messaging-api.js';
import { MessagingStore, type Delivery } from '../src/messaging-store.js';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { EditorRPC } from '../src/editor-worker.js';
import { validChatSnapshot, type ChatMessage } from '../src/chat-protocol.js';

const message = (id: string, parentId?: string): ChatMessage => ({ id, author: 'Synthetic', created: '2026-11-09T12:00:00Z', text: id, ...(parentId ? { parentId } : {}) });

test('REST history retains actual reply parents, rejects malformed relationships and never infers replies from quotes', async () => {
  const items = [{ id: 'root', text: '> quote, not a reply', parentId: null }, { id: 'answer', parentId: 'root' },
    { id: 'self', parentId: 'self' }, { id: 'bad', parentId: {} }, { id: 'bad-path', parentId: '../private' }];
  const api = new WebexMessagingAPI(() => 'synthetic', async () => Response.json({ items: items.map(item => ({ ...item, roomId: 'space' })) }));
  try {
    const result = await api.history('space');
    assert.deepEqual(result.items.map(item => [item.id, item.parentId]), [['root', undefined], ['answer', 'root']]);
    assert.equal(result.items[0]!.quoted, undefined);
  } finally { api.close(); }
});

test('reply POST uses parentId and literal plaintext, and requires matching space AND parent in its ACK', async () => {
  for (const returnedParent of ['root', undefined, 'other-root']) {
    const calls: RequestInit[] = [];
    const api = new WebexMessagingAPI(() => 'synthetic', async (_url, init) => {
      calls.push(init!); return Response.json({ ...message('sent', returnedParent), text: JSON.parse(String(init!.body)).text, roomId: 'space' });
    });
    try {
      if (returnedParent === 'root') assert.equal((await api.send('space', '**literal**\nsecond line', 'root')).parentId, 'root');
      else await assert.rejects(api.send('space', 'reply', 'root'), error => error instanceof MessagingError && error.reason === 'unknown');
      assert.equal(calls.length, 1);
      assert.deepEqual(JSON.parse(String(calls[0]!.body)), { roomId: 'space', text: returnedParent === 'root' ? '**literal**\nsecond line' : 'reply', parentId: 'root' });
      assert.equal(calls[0]!.redirect, 'error');
    } finally { api.close(); }
  }
  let posts = 0;
  const api = new WebexMessagingAPI(() => 'synthetic', async () => { posts++; return Response.json({ ...message('sent', 'unexpected-thread'), roomId: 'space' }); });
  try {
    await assert.rejects(api.send('space', 'normal post'), error => error instanceof MessagingError && error.reason === 'unknown');
    await assert.rejects(api.send('space', 'reply', '../bad')); assert.equal(posts, 1, 'bad parent IDs never issue a request');
  } finally { api.close(); }
});

test('real loopback HTTP reply round trip retains threading and never retries an uncertain POST', async () => {
  const bodies: unknown[] = []; let loseAck = false;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    bodies.push(JSON.parse(body));
    if (loseAck) { req.socket.destroy(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...message('delivered', 'root'), ...JSON.parse(body) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = new WebexMessagingAPI(() => 'synthetic', (url, init) => {
    const target = new URL(String(url)); assert.equal(target.origin, 'https://webexapis.com');
    return fetch(origin + target.pathname, init);
  });
  try {
    assert.equal((await api.send('space', 'local-only reply', 'root')).parentId, 'root');
    loseAck = true;
    await assert.rejects(api.send('space', 'uncertain reply', 'root'), error => error instanceof MessagingError && error.reason === 'unknown');
    assert.equal(bodies.length, 2);
  } finally { api.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('store admits only a current-room thread root or a root evidenced by a loaded reply; replay is target-bound', async () => {
  const api = demoMessageAPI(); const posts: unknown[][] = [];
  api.history = async () => ({ items: [message('root'), message('child', 'root'), message('orphan', 'unloaded-root')] });
  api.send = async (...args) => { posts.push(args); return message('sent-' + posts.length, args[2]); };
  const store = new MessagingStore(api, 0), deliveries: Delivery[] = [];
  store.onDelivery = value => deliveries.push(value);
  try {
    await store.loadRooms(); await store.select('demo-general');
    await store.send('first', 'demo-general', 'reply', 'root');
    await store.send('first', 'demo-general', 'reply', 'root');
    assert.equal(posts.length, 1); assert.equal(deliveries.at(-1)!.parentId, 'root');
    await assert.rejects(store.send('first', 'demo-general', 'reply', 'unloaded-root'), /already belongs/);
    for (const parent of ['child', 'not-in-this-space', '../invalid']) {
      await store.send('bad-' + deliveries.length, 'demo-general', 'do not send', parent);
      assert.equal(deliveries.at(-1)!.status, 'failed');
    }
    await store.send('orphan-thread', 'demo-general', 'reply with missing root', 'unloaded-root');
    assert.equal(posts.length, 2); assert.equal(posts[1]![2], 'unloaded-root');
    await store.select('demo-engineering'); store.messages = [];
    await store.send('wrong-space', 'demo-engineering', 'never post to a previous space thread', 'root');
    assert.equal(posts.length, 2); assert.equal(deliveries.at(-1)!.status, 'failed');
  } finally { store.close(); }
});

test('a mismatched reply ACK blocks the entire room until explicit resolution and is never automatically retried', async () => {
  const api = demoMessageAPI(); let posts = 0;
  api.history = async () => ({ items: [message('root')] });
  api.send = async () => { posts++; return message('wrong-ack'); };
  const store = new MessagingStore(api, 0), deliveries: Delivery[] = [];
  store.onDelivery = value => deliveries.push(value);
  try {
    await store.loadRooms(); await store.select('demo-general');
    await store.send('unknown', 'demo-general', 'reply', 'root');
    assert.equal(deliveries.at(-1)!.status, 'unknown'); assert.equal(deliveries.at(-1)!.parentId, 'root');
    assert.ok(store.uncertain.has('demo-general'));
    await store.send('normal-blocked', 'demo-general', 'normal draft');
    await store.send('reply-blocked', 'demo-general', 'reply', 'root');
    assert.equal(posts, 1); assert.equal(store.messages.length, 1, 'unconfirmed reply never enters authoritative history');
  } finally { store.close(); }
});

test('editor RPC advertises replies, validates parent IDs, preserves parent metadata and echoes the bound reply target', async () => {
  const engine = new EditorEngine(), output: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => output.push(value));
  let id = 0;
  const request = (method: string, params: object = {}) => rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }));
  try {
    await request('hello', { version: 1 }); assert.ok(output.at(-1).result.capabilities.includes('message-replies'));
    await request('session.start', { mode: 'demo' }); await request('rooms.select', { roomId: 'demo-general' });
    const parentId = engine.snapshot().messages[0]!.id;
    for (const parent of [null, {}, [], true, '', '../bad']) {
      await request('messages.send', { roomId: 'demo-general', requestId: 'invalid', text: 'not sent', parentId: parent });
      assert.equal(output.at(-1).error.code, -32602);
    }
    await request('messages.send', { roomId: 'demo-general', requestId: 'reply', text: 'a reply', parentId });
    assert.equal(output.find(value => value.method === 'delivery').params.parentId, parentId);
    assert.equal(engine.snapshot().messages.at(-1)!.parentId, parentId);
    await request('messages.send', { roomId: 'demo-general', requestId: 'reply-child', text: 'not a nested Webex root', parentId: engine.snapshot().messages.at(-1)!.id });
    assert.equal(output.filter(value => value.method === 'delivery').at(-1).params.status, 'failed');
  } finally { await rpc.close(); }
});

test('compatibility snapshot admission validates optional reply metadata without treating quotes as thread parents', () => {
  const snapshot = { state: 'ready', mode: 'demo', room: { id: 'room', title: 'Room' }, rooms: [], sending: false, messages: [message('child', 'root')] };
  assert.ok(validChatSnapshot(snapshot));
  for (const parentId of ['child', '../bad', {}, null]) assert.equal(validChatSnapshot({ ...snapshot, messages: [{ ...snapshot.messages[0], parentId }] }), false);
});
