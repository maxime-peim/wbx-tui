import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { MessagingUI } from '../src/messaging-ui.js';
import { defaults } from '../src/config.js';
import { oauthFixture } from './oauth-fixture.js';

test('real loopback HTTP messaging + OAuth rotation: paginated spaces/history, modal multiline delivery, new bearer, denied and unknown POST handling', async () => {
  const oauth = await oauthFixture();
  let access = await oauth.session.authorize(oauth.open), mode = 'ok';
  const calls: { method: string; url: string; bearer: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ method: req.method!, url: req.url!, bearer: req.headers.authorization ?? '', body });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      if (mode === 'denied') { res.writeHead(403).end('{"private":"credential details"}'); return; }
      if (mode === 'unknown') { req.socket.destroy(); return; }
      const value = JSON.parse(body); res.end(JSON.stringify({ ...value, id: 'delivered', personEmail: 'you@example.test', created: '2026-11-07' })); return;
    }
    if (req.url?.startsWith('/v1/rooms')) {
      if (!req.url.includes('cursor')) res.setHeader('Link', '<https://webexapis.com/v1/rooms?cursor=second>; rel="next"');
      res.end(JSON.stringify({ items: [{ id: req.url.includes('cursor') ? 'second' : 'first', title: 'Authorized test fixture', type: 'group' }] })); return;
    }
    res.end(JSON.stringify({ items: [{ id: 'history', roomId: 'first', text: 'received locally', personEmail: 'other@example.test', created: '2026-01-01' }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = new WebexMessagingAPI(() => access.token, async (url, init) => {
    const target = new URL(String(url)); assert.equal(target.origin, 'https://webexapis.com');
    return fetch(origin + target.pathname + target.search, init);
  });
  const store = new MessagingStore(api, 0), ui = new MessagingUI(store, defaults());
  try {
    await store.loadRooms(); await store.loadRooms(true); assert.equal(store.rooms.length, 2);
    await store.select('first'); assert.equal(store.messages[0]!.text, 'received locally');
    ui.action('insert'); ui.paste('literal **plaintext**\n世界');
    await store.send('http-send', 'first', ui.draft!.text);
    assert.equal(store.messages.at(-1)!.text, 'literal **plaintext**\n世界');
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    assert.ok(calls.every(call => call.bearer === 'Bearer synthetic-access-1'));
    access = await oauth.session.refresh(); await store.refresh();
    assert.equal(calls.at(-1)!.bearer, 'Bearer synthetic-access-2');
    mode = 'denied'; await store.send('denied', 'first', 'do not retry'); assert.equal(store.uncertain.size, 0);
    mode = 'unknown'; await store.send('unknown', 'first', 'lost acknowledgment'); assert.ok(store.uncertain.has('first'));
    await store.send('blocked', 'first', 'do not replay'); assert.equal(calls.filter(call => call.method === 'POST').length, 3);
    assert.ok(!ui.screen(120, 32).lines.join('\n').includes('synthetic-access'), 'bearer never reaches terminal text');
    assert.ok(!store.notice.includes('credential details'));
  } finally { store.close(); await oauth.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
