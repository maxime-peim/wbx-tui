import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageQueries } from '../src/message-queries.js';
import type { ActionREST, PublicResponse } from '../src/public-rest.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { createServer, request } from 'node:http';
import { PublicREST } from '../src/public-rest.js';

const sessionId = 'a'.repeat(32), context = { sessionId, roomId: 'room' };
const raw = (id: string, parentId?: string) => ({ id, roomId: 'room', personId: 'person-a',
  created: '2026-11-15T10:00:00.000Z', text: 'Body ' + id, ...(parentId ? { parentId } : {}) });
function fixture() {
  let now = 10000;
  const queries = new MessageQueries(() => now), calls: string[] = [], pages: PublicResponse[] = [];
  const rest: ActionREST = { busy: () => false, async call(path, method, token, _signal, body) {
    assert.equal(method, 'GET'); assert.equal(token, 'INERT'); assert.equal(body, undefined);
    calls.push(path); const page = pages.shift(); assert.ok(page, 'every physical GET accounted for'); return page;
  } };
  const signal = new AbortController().signal;
  return { queries, calls, pages, rest, setNow: (value: number) => { now = value; },
    thread: (more = false, revision?: number, messageId = 'root', parentId?: string) =>
      queries.thread({ ...context, messageId, ...(parentId ? { parentId } : {}) }, rest, () => 'INERT', signal, more, revision),
    mentions: (more = false, revision?: number) => queries.mentions(context, rest, () => 'INERT', signal, more, revision) };
}
test('finite message reads reject caller actors, arbitrary roots/filters/URLs and unbound pages', () => {
  for (const method of ['messages.thread', 'messages.mentions']) {
    const base = { roomId: 'room', ...(method === 'messages.thread' ? { messageId: 'source' } : {}) };
    assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params: base }), { method, params: { ...base, more: false } });
    for (const extra of [{ rootId: 'foreign' }, { personId: 'someone' }, { mentionedPeople: 'other' }, { url: 'https://evil.invalid' },
      { token: 'secret' }, { more: true }, { revision: 1 }, { more: true, revision: 0 }, { more: 'true' }]) {
      assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params: { ...base, ...extra } }));
    }
  }
});
test('remote thread revalidates exact source/root and retrieves one bounded page without mutating owners', async () => {
  const f = fixture();
  f.pages.push({ value: raw('source', 'root') }, { value: raw('root') },
    { value: { items: [raw('reply-1', 'root')] }, link: '<https://webexapis.com/v1/messages?roomId=room&parentId=root&max=50&beforeMessage=reply-1>; rel="next"' });
  const first = await f.thread(false, undefined, 'source', 'root');
  assert.equal(f.calls.length, 3, 'only source/root/first page, no automatic next page');
  assert.equal(first.rootId, 'root'); assert.equal(first.sourceId, 'source');
  assert.deepEqual(first.items.map(item => item.id), ['root', 'reply-1']);
  assert.equal(first.partial, true); assert.equal(first.more, true); assert.equal(first.coverage, 'room-thread');
  first.items[0]!.text = 'foreign local mutation';
  f.pages.push({ value: { items: [raw('reply-2', 'root')] } });
  const next = await f.thread(true, first.revision, 'source', 'root');
  assert.equal(f.calls.length, 4); assert.equal(next.items[0]!.text, 'Body root');
  assert.equal(next.partial, false); assert.equal(next.more, false);
  assert.equal(next.observedAt, first.observedAt);
});
test('selected-space mentions use authenticated me filter and retain inert content only, with no identity probe', async () => {
  const f = fixture();
  f.pages.push({ value: { items: [{ ...raw('mention'), html: '<b>hi</b><script>bad()</script><img src="https://evil.invalid">',
    files: ['https://example.invalid/private-file'], attachments: [{ content: { actions: [{ type: 'Action.Submit' }] } }],
    mentionedPeople: ['person-a'], accessToken: 'PRIVATE' }] } });
  const value = await f.mentions();
  assert.equal(value.coverage, 'room-mentions-me'); assert.equal(value.items.length, 1);
  assert.equal(value.items[0]!.fileCount, 1); assert.equal(value.items[0]!.contentPartial, true);
  const url = new URL(f.calls[0]!);
  assert.equal(url.pathname, '/v1/messages'); assert.equal(url.searchParams.get('roomId'), 'room');
  assert.equal(url.searchParams.get('mentionedPeople'), 'me'); assert.equal(url.searchParams.get('max'), '50');
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(value), /private-file|PRIVATE|accessToken|Action.Submit|mentionedPeople|authorId|<script>/);
});
test('wrong-room/parent/source/root and malformed/deleted data never produce a fabricated thread', async () => {
  for (const bad of [{ ...raw('root'), roomId: 'other' }, raw('foreign'), raw('root', 'parent'),
    { ...raw('root'), created: 'not-a-date' }, { ...raw('root'), errors: [] }]) {
    const f = fixture(); f.pages.push({ value: bad });
    await assert.rejects(f.thread()); assert.equal(f.calls.length, 1);
  }
  for (const item of [raw('reply', 'other-root'), raw('root'), { ...raw('reply', 'root'), roomId: 'other' }]) {
    const f = fixture(); f.pages.push({ value: raw('root') }, { value: { items: [item] } });
    await assert.rejects(f.thread()); assert.equal(f.calls.length, 2);
  }
  const f = fixture();
  f.pages.push({ value: raw('root') }, { value: { items: [raw('reply', 'root'), raw('reply', 'root')] } });
  await assert.rejects(f.thread());
});
test('message query links are bound to origin, exact room/filter/page size; hostile links never execute', async () => {
  const bad = ['https://evil.invalid/v1/messages?roomId=room&mentionedPeople=me&max=50',
    '/v1/people?roomId=room&mentionedPeople=me&max=50',
    '/v1/messages?roomId=other&mentionedPeople=me&max=50',
    '/v1/messages?roomId=room&mentionedPeople=someone&max=50',
    '/v1/messages?roomId=room&mentionedPeople=me&max=1000',
    '/v1/messages?roomId=room&mentionedPeople=me&max=50&parentId=foreign',
    '/v1/messages?roomId=room&roomId=room&mentionedPeople=me&max=50'];
  for (const link of bad) {
    const f = fixture(); f.pages.push({ value: { items: [raw('m')] }, link: `<${link}>; rel="next"` });
    await assert.rejects(f.mentions()); await assert.rejects(f.mentions(true, 1)); assert.equal(f.calls.length, 1);
  }
});
test('thread and mentions retain independent bounded slots, but a fresh thread revokes its old cursor', async () => {
  const f = fixture();
  f.pages.push({ value: raw('root') }, { value: { items: [raw('reply-1', 'root')] },
    link: '<https://webexapis.com/v1/messages?roomId=room&parentId=root&max=50&beforeMessage=reply-1>; rel="next"' });
  const first = await f.thread();
  f.pages.push({ value: { items: [raw('mention')] } });
  await f.mentions();
  f.pages.push({ value: { items: [raw('reply-2', 'root')] } });
  const next = await f.thread(true, first.revision);
  assert.deepEqual(next.items.map(item => item.id), ['root', 'reply-1', 'reply-2']);
  assert.equal(f.calls.length, 4);
  f.pages.push({ value: raw('another-root') }, { value: { items: [] } });
  await f.thread(false, undefined, 'another-root');
  await assert.rejects(f.thread(true, first.revision));
  assert.equal(f.calls.length, 6);
});
for (const status of [200, 302, 429]) test(`actual fixed public boundary: message query ${status} only makes accounted GETs`, async () => {
  const calls: { path: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ path: req.url!, body: Buffer.concat(chunks).toString() });
    assert.equal(req.method, 'GET'); assert.equal(req.headers.authorization, 'Bearer INERT');
    const url = new URL(req.url!, 'https://webexapis.com');
    const value = url.pathname === '/v1/messages/source' ? raw('source', 'root')
      : url.pathname === '/v1/messages/root' ? raw('root')
      : { items: [url.searchParams.has('parentId') ? raw('reply', 'root') : raw('mention')] };
    res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/replay' });
    res.end(JSON.stringify(value));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const rest = new PublicREST((options, listener) => {
    assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.protocol, 'https:');
    assert.equal(options.agent, false); assert.equal(options.method, 'GET');
    return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  });
  const queries = new MessageQueries(), signal = new AbortController().signal;
  try {
    const pending = queries.thread({ ...context, messageId: 'source', parentId: 'root' }, rest, () => 'INERT', signal);
    if (status === 200) {
      const result = await pending;
      assert.equal(result.rootId, 'root'); assert.equal(calls.length, 3);
      await queries.mentions(context, rest, () => 'INERT', signal); assert.equal(calls.length, 4);
    } else { await assert.rejects(pending); assert.equal(calls.length, 1); }
    assert.ok(calls.every(call => call.body === '' && call.path.startsWith('/v1/messages')));
    assert.equal(rest.busy(), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('query saturation, cycles and body clipping stay explicitly partial without hidden page drains', async () => {
  const f = fixture();
  for (let page = 0, revision: number | undefined; page < 5; page++) {
    f.pages.push({ value: { items: Array.from({ length: 50 }, (_, i) => raw('m-' + page + '-' + i)) },
      link: `<https://webexapis.com/v1/messages?roomId=room&mentionedPeople=me&max=50&beforeMessage=page-${page}>; rel="next"` });
    const value = await f.mentions(page > 0, revision);
    revision = value.revision; assert.equal(value.partial, true); assert.equal(value.more, page < 4);
    if (page === 4) { assert.equal(value.items.length, 250); assert.notEqual(value.limit, 'none'); }
  }
  assert.equal(f.calls.length, 5);
  const cyclic = fixture();
  cyclic.pages.push({ value: { items: [] }, link: '<https://webexapis.com/v1/messages?max=50&roomId=room&mentionedPeople=me>; rel="next"' });
  const cycle = await cyclic.mentions(); assert.equal(cycle.limit, 'cycle'); assert.equal(cycle.more, false); assert.equal(cycle.partial, true);
  const bytes = fixture();
  bytes.pages.push({ value: { items: Array.from({ length: 50 }, (_, i) => ({ ...raw('large-' + i), text: 'a'.repeat(11000) })) } });
  const clipped = await bytes.mentions(); assert.equal(clipped.limit, 'bytes'); assert.equal(clipped.partial, true);
  assert.equal(clipped.more, false); assert.ok(clipped.items.length < 50); assert.equal(clipped.items[0]!.contentPartial, true);
});
test('paging expires and cannot cross query revision, session, selection reset or physical cancellation', async () => {
  const f = fixture(), link = '<https://webexapis.com/v1/messages?roomId=room&mentionedPeople=me&max=50&beforeMessage=next>; rel="next"';
  f.pages.push({ value: { items: [raw('m')] }, link });
  const first = await f.mentions();
  await assert.rejects(f.mentions(true, first.revision - 1));
  f.setNow(130001); await assert.rejects(f.mentions(true, first.revision)); assert.equal(f.calls.length, 1);
  f.queries.reset(); await assert.rejects(f.mentions(true, first.revision));
  let release!: (value: PublicResponse) => void, calls = 0;
  const rest: ActionREST = { busy: () => false, async call() { calls++; return new Promise(resolve => { release = resolve; }); } };
  const abort = new AbortController();
  const pending = f.queries.mentions(context, rest, () => 'INERT', abort.signal);
  f.queries.reset(); abort.abort();
  await assert.rejects(f.queries.mentions({ ...context, sessionId: 'b'.repeat(32) }, rest, () => 'INERT', new AbortController().signal));
  release({ value: { items: [raw('late')] } }); await assert.rejects(pending); assert.equal(calls, 1);
});
test('message query refusal, missing grants and exact-message 404 never retry or restore old paging authority', async () => {
  for (const status of [401, 403, 404, 429]) {
    const queries = new MessageQueries(); let calls = 0;
    const rest: ActionREST = { busy: () => false, async call() { calls++; throw Object.assign(new Error('Refused'), { status }); } };
    await assert.rejects(queries.thread({ ...context, messageId: 'root' }, rest, () => 'INERT', new AbortController().signal));
    assert.equal(calls, 1);
    await assert.rejects(queries.thread({ ...context, messageId: 'root' }, rest, () => 'INERT', new AbortController().signal, true, 1));
    assert.equal(calls, 1);
  }
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined,
    { publicRequest: () => assert.fail('Unknown/expired grant must refuse before physical query') });
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const id = engine.snapshot().messages[0]!.id;
    Object.assign(engine, { mode: 'live', token: 'INERT', expiresAt: Date.now() + 60000, grantedScope: '' });
    await assert.rejects(engine.queryThread('demo-general', id), /unavailable/);
    await assert.rejects(engine.queryMentions('demo-general'), /unavailable/);
    Object.assign(engine, { grantedScope: 'spark:messages_read', expiresAt: 0 });
    await assert.rejects(engine.queryThread('demo-general', id), /unavailable/);
    await assert.rejects(engine.queryMentions('demo-general'), /unavailable/);
  } finally { engine.stop(); }
});
test('engine selected-room reads preserve history/notification/receipt owners and reset on away-and-return', async () => {
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const before = engine.snapshot();
    const value = await engine.queryThread('demo-general', before.messages[0]!.id);
    assert.equal(value.rootId, before.messages[0]!.id); assert.equal(value.sessionId, before.localContext!.sessionId);
    await engine.queryMentions('demo-general');
    assert.deepEqual(engine.snapshot().messages, before.messages, 'queries never seed/reorder main history or newest endpoints');
    assert.deepEqual(engine.snapshot().messageEvents, before.messageEvents, 'queries are not incoming notifications');
    await engine.select('demo-engineering'); await engine.select('demo-general');
    await assert.rejects(engine.queryThread('demo-general', before.messages[0]!.id, true, value.revision));
    await assert.rejects(engine.queryMentions('demo-engineering'), /unavailable|ready/);
  } finally { engine.stop(); }
});
