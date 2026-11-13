import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { MessagingStore } from '../src/messaging-store.js';
import type { MessagingAPI } from '../src/messaging-api.js';
import type { ReadStatusSource } from '../src/read-status.js';
import { SpacesCache, spacesCacheKey } from '../src/spaces-cache.js';
import { ReceivedCache, ReceivedCacheStorage } from '../src/received-cache.js';
const tick = () => new Promise<void>(r => setImmediate(r));
async function until(check: () => boolean) {
  for (let n = 0; n < 300 && !check(); n++) await tick();
  assert.ok(check(), 'local transition settled');
}
const m = { id: 'message', author: 'fallback', authorId: 'person', text: 'Private saved text', created: '2026-11-18T12:00:00.000Z' };
const room = { id: 'room', title: 'Known room', type: 'group' as const, lastActivity: m.created };

test('actual engine restart restores display only, reuses names/reactions, and replaces text only after fresh history', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-received-engine-'), path = join(directory, 'config.json'), base = join(directory, 'cache');
  const profile = { clientId: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'] };
  await writeFile(path, JSON.stringify({ oauth: { ...profile, clientSecret: 'synthetic' } }), { mode: 0o600 });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600000 }));
  let account = 'account', nameReads = 0, sends = 0, receipts = 0, reactions = 0, held: (() => void) | undefined, hold = false;
  const caches: ReceivedCache[] = [], engines: EditorEngine[] = [], stores: MessagingStore[] = [];
  const sources: ReadStatusSource[] = [];
  t.after(async () => { engines.forEach(e => e.stop()); caches.forEach(c => c.close()); held?.(); await rm(directory, { recursive: true, force: true }); });
  function create(enabled = true) {
    const engine = new EditorEngine(async () => { throw new Error('No browser'); }, () => {
      const source: ReadStatusSource = { onRooms() {}, onFailure() {}, async start() {}, close() {},
        async markRead() { receipts++; },
        async reaction(command) { reactions++; if(command.action!=='summary') return {status:'changed'}; return { roomId: command.roomId, messageId: command.messageId, observedAt: Date.now(),
          partial: true, unknown: false, groups: [{ reaction: 'heart', label: 'Heart', count: 3, mine: true }] }; } };
      sources.push(source); return source;
    }, undefined, undefined, undefined, { create: () => new SpacesCache(base), account: async () => account }, {
      senderFetch: async () => { nameReads++; return Response.json({ id: 'person', displayName: 'Known name' }); },
      receivedCache: () => { const cache = new ReceivedCache(new ReceivedCacheStorage(base)); caches.push(cache); return cache; },
      messaging: () => {
        const api = { async rooms() { return { items: [room] }; }, async history() {
          if (hold) await new Promise<void>(r => { held = r; });
          return { items: [{ ...m, ...(hold ? { text: 'Fresh replacement' } : {}) }] };
        }, async send() { sends++; return m; }, close() {} } as unknown as MessagingAPI;
        const store = new MessagingStore(api, 0); stores.push(store); return store;
      },
    });
    engines.push(engine);
    return { engine, start: () => engine.start('live', path, true, false, false, enabled, false, true) };
  }
  const first = create(); await first.start();
  await until(() => caches[0]!.state === 'ready');
  await first.engine.select('room'); await until(() => nameReads === 1 && first.engine.snapshot().messages[0]?.author === 'Known name');
  await first.engine.reactionSummary('room', 'message');
  const prepared=await first.engine.prepareReaction('room','message','add','celebrate');
  assert.equal((await first.engine.submitReaction(prepared.contextId,'confirmed','room','message')).status,'changed');
  const confirmed=caches[0]!.reactions('room',stores[0]!.messages);
  assert.deepEqual(confirmed[0]!.groups.find(g=>g.reaction==='celebrate'),{reaction:'celebrate',label:'Celebrate',mine:true},
    'the confirmed result enters the actual disk-cache owner before any read-back');
  await first.engine.submitReaction(prepared.contextId,'confirmed','room','message');
  assert.deepEqual(caches[0]!.reactions('room',stores[0]!.messages),confirmed,'historical ACK replay cannot delete or freshen the cache');
  await caches[0]!.flush(); first.engine.stop();
  hold = true;
  const second = create(); await second.start(); await until(() => caches[1]!.state === 'ready');
  const selecting = second.engine.select('room'); await until(() => !!held);
  const restored = second.engine.snapshot();
  assert.equal(restored.historyCached, true); assert.equal(restored.ready, false); assert.equal(restored.historyLatest, false);
  assert.equal(restored.messages[0]!.text, m.text); assert.equal(restored.messages[0]!.author, 'Known name');
  assert.equal(restored.cachedReactions![0]!.groups[0]!.count, 3);
  assert.deepEqual(restored.cachedReactions![0]!.groups.find(g=>g.reaction==='celebrate'),{reaction:'celebrate',label:'Celebrate',mine:true});
  assert.deepEqual(stores[1]!.messages, [], 'saved content never enters the authority-bearing store');
  await second.engine.send('explicit', 'room', 'Must not send'); assert.equal(sends, 0);
  await assert.rejects(second.engine.reactionSummary('room', 'message'), /revalidated/);
  await assert.rejects(second.engine.markRead('room', 'message'));
  held!(); held = undefined; await selecting;
  assert.equal(second.engine.snapshot().historyCached, undefined);
  assert.equal(second.engine.snapshot().messages[0]!.text, 'Fresh replacement');
  assert.deepEqual(second.engine.snapshot().cachedReactions, [], 'changed text cannot inherit old reaction observations');
  assert.equal(nameReads, 1, 'a verified name restored across backend sessions starts no person GET');
  assert.equal(reactions, 3); assert.equal(receipts, 0);
  await caches[1]!.flush(); second.engine.stop();

  // A different authenticated account using the identical config gets no content.
  account = 'other-account'; hold = true;
  const third = create(); await third.start(); await until(() => caches[2]!.state === 'ready');
  const foreignSelect = third.engine.select('room'); await until(() => !!held);
  assert.deepEqual(third.engine.snapshot().messages, []); assert.deepEqual(third.engine.snapshot().cachedReactions, []);
  held!(); held = undefined; await foreignSelect; third.engine.stop();
  assert.notEqual(spacesCacheKey(path, profile, 'account'), spacesCacheKey(path, profile, account));

  // Existing spaces_cache opt-out suppresses all new disk owners and restores.
  const before = caches.length, off = create(false); await off.start();
  const offSelect = off.engine.select('room'); await until(() => !!held);
  assert.equal(caches.length, before); assert.deepEqual(off.engine.snapshot().messages, []);
  held!(); held = undefined; await offSelect; off.engine.stop();
});
