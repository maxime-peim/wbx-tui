import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import type { ChatMessage } from '../src/chat-protocol.js';
import type { ReadStatusSource } from '../src/read-status.js';

test('receipts require the known newest displayed endpoint, including history frozen at its memory limit', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-endpoint-');
  const config = join(directory, 'config.json');
  const room = { id: 'synthetic-room', title: 'Endpoint fixture', type: 'direct' as const, lastActivity: '2026-01-01T00:00:00.000Z' };
  const messages: ChatMessage[] = Array.from({ length: 500 }, (_, i) => ({ id: `message-${i}`, author: 'Synthetic', text: `Body ${i}`,
    created: new Date(Date.parse(room.lastActivity) + i * 1000).toISOString() }));
  const future = { ...messages[499]!, id: 'future-message', created: '2027-01-01T00:00:00.000Z' };
  let histories = 0, network = 0, exactReads = 0;
  const receipts: string[] = [];
  const source: ReadStatusSource = { onRooms() {}, onFailure() {},
    async start() { source.onRooms([{ ...room, lastActivity: messages[499]!.created, lastSeen: messages[499]!.created }]); },
    async markRead(_room, message) { receipts.push(message); }, close() {} };
  const engine = new EditorEngine(async () => { throw new Error('Browser forbidden.'); }, () => source);
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] } }), { mode: 0o600 });
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Network forbidden.'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [room] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: ++histories === 1 ? messages : [future] }));
  t.mock.method(WebexMessagingAPI.prototype, 'getMessage', async (_room: string, id: string) => {
    exactReads++; return messages.find(message => message.id === id);
  });
  try {
    await engine.start('live', config, true); await engine.select(room.id);
    assert.equal(engine.snapshot().historyLatest, true);
    const initiallyRead = engine.snapshot().rooms[0]!;
    assert.ok('unread' in initiallyRead && initiallyRead.unread === false, 'the initial SDK endpoint is server-confirmed read');
    await assert.rejects(engine.markRead(room.id, messages[498]!.id), /known newest endpoint/);
    await engine.markRead(room.id, messages[499]!.id);
    await engine.history();
    assert.equal(engine.snapshot().messages.length, 500);
    assert.equal(engine.snapshot().messages.at(-1)!.id, messages[499]!.id);
    assert.equal(engine.snapshot().historyLatest, false, 'the unseen latest endpoint is not represented by the retained bottom row');
    const stale = engine.snapshot().rooms[0]!;
    assert.equal(stale.unread, false, 'retain the historical confirmed read flag');
    assert.equal(stale.unreadStale, true, 'an observed but undisplayed newer message invalidates fresh server-read certainty');
    await assert.rejects(engine.markRead(room.id, messages[499]!.id), /known newest endpoint/);
    assert.deepEqual(receipts, [messages[499]!.id]);
    await engine.select(room.id);
    assert.equal(engine.snapshot().historyLatest, false, 'same-space re-entry must retain the bounded history');
    await engine.select(room.id, true);
    assert.equal(engine.snapshot().historyLatest, true);
    await assert.rejects(engine.markRead(room.id, future.id), /unavailable or stale/, 'returning to latest does not freshen an old SDK observation');
    source.onRooms([{ ...room, lastActivity: future.created, lastSeen: messages[499]!.created }]);
    assert.equal(engine.snapshot().rooms[0]!.unread, true); assert.equal(engine.snapshot().rooms[0]!.unreadStale, false);
    await engine.markRead(room.id, future.id);
    assert.deepEqual(receipts, [messages[499]!.id, future.id]);
    assert.equal(network, 0);
    assert.equal(exactReads, 1, 'one bounded revalidation of retained content, never a real service read');
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});
