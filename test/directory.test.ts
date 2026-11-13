import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectorySearch, validDirectoryQuery } from '../src/directory-search.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import type { ActionREST, PublicResponse } from '../src/public-rest.js';

const session = 'a'.repeat(32);
const person = (id = 'person-a') => ({ id, displayName: 'Same Name', emails: ['private@example.invalid'],
  status: 'active', avatar: 'https://example.invalid/no-fetch', roles: ['not-authority'] });
function fixture() {
  let now = 10_000, next: PublicResponse = { value: { items: [person()] } };
  const calls: string[] = [], search = new DirectorySearch(() => now);
  const rest: ActionREST = { busy: () => false, async call(path, method, token, _signal, body) {
    assert.equal(method, 'GET'); assert.equal(token, 'INERT'); assert.equal(body, undefined);
    calls.push(path); return next;
  } };
  return { search, calls, rest, setNow: (value: number) => { now = value; },
    setNext: (value: PublicResponse) => { next = value; },
    run: (more = false, revision?: number) => search.search('Same', session, rest, () => 'INERT', new AbortController().signal, more, revision) };
}
test('directory prefix query and RPC admit finite non-enumerating explicit reads only', () => {
  for (const value of ['', 'a', ' a', 'a ', '*', 'x\nz', 'x\u202ey', '😀'.repeat(121), null, [], {}]) assert.equal(validDirectoryQuery(value), false, String(value));
  for (const query of ['Al', 'Álvaro', '张三', 'Same & Other', '😀😀']) {
    assert.equal(validDirectoryQuery(query), true);
    assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'people.search', params: { query } }),
      { method: 'people.search', params: { query, more: false } });
  }
  for (const params of [{ query: 'Al', orgId: 'foreign' }, { query: 'Al', token: 'secret' }, { query: 'Al', more: 'true' },
    { query: 'Al', more: true }, { query: 'Al', more: true, revision: 0 }, { query: 'Al', revision: 1 },
    { query: 'Al', presence: true }]) assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'people.search', params }));
});
test('directory projects identities only, permits duplicate labels and explicitly pages fixed privacy-bound queries', async () => {
  const f = fixture();
  f.setNext({ value: { items: [person(), person('person-b')] }, link: '<https://webexapis.com/v1/people?displayName=Same&max=50&after=one>; rel="next"' });
  const first = await f.run();
  assert.deepEqual(first.items, [{ personId: 'person-a', label: 'Same Name' }, { personId: 'person-b', label: 'Same Name' }]);
  assert.equal(first.coverage, 'directory-prefix'); assert.equal(first.sessionId, session);
  assert.equal(first.more, true); assert.equal(first.partial, true); assert.equal(f.calls.length, 1);
  first.items[0]!.personId = 'foreign';
  f.setNext({ value: { items: [person('person-c')] } });
  const next = await f.run(true, first.revision);
  assert.equal(next.items[0]!.personId, 'person-a'); assert.equal(next.items.length, 3);
  assert.equal(next.more, false); assert.equal(next.partial, false); assert.equal(f.calls.length, 2);
  for (const path of f.calls) {
    const url = new URL(path, 'https://webexapis.com');
    assert.equal(url.pathname, '/v1/people'); assert.equal(url.searchParams.get('displayName'), 'Same');
    assert.equal(url.searchParams.get('excludeStatus'), 'true'); assert.equal(url.searchParams.get('max'), '50');
  }
  assert.doesNotMatch(JSON.stringify(next), /private@|avatar|roles|status|emails/);
});
test('hostile, retargeted, duplicate and cyclic directory next links fail closed without following', async () => {
  const bad = ['https://evil.invalid/v1/people?displayName=Same&max=50', '/v1/rooms?displayName=Same&max=50',
    '/v1/people?displayName=Other&max=50', '/v1/people?displayName=Same&max=1000',
    '/v1/people?displayName=Same&max=50&excludeStatus=false', '/v1/people?displayName=Same&max=50&orgId=foreign',
    '/v1/people?displayName=Same&displayName=Same&max=50', '/v1/people?displayName=Same&max=50&after=' + 'x'.repeat(2049)];
  for (const link of bad) {
    const f = fixture(); f.setNext({ value: { items: [person()] }, link: `<${link}>; rel="next"` });
    await assert.rejects(f.run()); assert.equal(f.calls.length, 1);
    await assert.rejects(f.run(true, 1)); assert.equal(f.calls.length, 1);
  }
  const f = fixture(), link = '<https://webexapis.com/v1/people?displayName=Same&max=50&excludeStatus=true>; rel="next"';
  f.setNext({ value: { items: [person()] }, link });
  const value = await f.run(); assert.equal(value.more, false); assert.equal(value.partial, true);
  await assert.rejects(f.run(true, value.revision)); assert.equal(f.calls.length, 1);
});
test('directory refuses malformed identities, duplicate IDs, oversized pages and errors without retaining payloads', async () => {
  for (const value of [{ items: [person(), person()] }, { items: [person('me')] }, { items: [{ displayName: 'Missing ID' }] },
    { items: Array.from({ length: 51 }, (_, i) => person('p' + i)) }, { items: [person()], errors: [] }, { items: null }]) {
    const f = fixture(); f.setNext({ value }); await assert.rejects(f.run()); assert.equal(f.calls.length, 1);
  }
});
test('directory paging is revision/session/age bound and budget exhaustion remains partial', async () => {
  const f = fixture();
  for (let page = 0, revision: number | undefined; page < 5; page++) {
    f.setNext({ value: { items: Array.from({ length: 50 }, (_, i) => person(`p-${page}-${i}`)) },
      link: `<https://webexapis.com/v1/people?displayName=Same&max=50&after=page-${page + 1}>; rel="next"` });
    const value = await f.run(page > 0, revision);
    revision = value.revision; assert.equal(value.partial, true); assert.equal(value.more, page < 4);
    if (page === 4) { assert.equal(value.items.length, 250); await assert.rejects(f.run(true, revision)); }
  }
  assert.equal(f.calls.length, 5);
  const aged = fixture();
  aged.setNext({ value: { items: [person()] }, link: '<https://webexapis.com/v1/people?displayName=Same&max=50&after=two>; rel="next"' });
  const first = await aged.run();
  await assert.rejects(aged.run(true, first.revision - 1));
  aged.setNow(130_001); await assert.rejects(aged.run(true, first.revision));
  assert.equal(aged.calls.length, 1);
  aged.search.reset(); await assert.rejects(aged.run(true, first.revision));
});
test('reset/cancel prevents late directory reads from refilling a new session; physical admission survives reset', async () => {
  const search = new DirectorySearch();
  let release!: (result: PublicResponse) => void, count = 0;
  const rest: ActionREST = { busy: () => false, call: async () => { count++; return new Promise(resolve => { release = resolve; }); } };
  const abort = new AbortController(), pending = search.search('Same', session, rest, () => 'INERT', abort.signal);
  search.reset(); abort.abort();
  await assert.rejects(search.search('Other', 'b'.repeat(32), rest, () => 'INERT', new AbortController().signal));
  release({ value: { items: [person()] } }); await assert.rejects(pending); assert.equal(count, 1);
});
test('directory transport refusal/rate limit and grant loss never retry or preserve next-page eligibility', async () => {
  for (const status of [401, 403, 429]) {
    const f = fixture();
    let count = 0;
    const rest: ActionREST = { busy: () => false, async call() { count++; throw Object.assign(new Error('Refused'), { status }); } };
    await assert.rejects(f.search.search('Same', session, rest, () => 'INERT', new AbortController().signal));
    await assert.rejects(f.run(true, 1));
    assert.equal(count, 1); assert.equal(f.calls.length, 0);
  }
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined,
    { publicRequest: () => assert.fail('Missing/expired known grants must refuse before physical admission') });
  try {
    await engine.start('demo');
    Object.assign(engine, { mode: 'live', token: 'INERT', expiresAt: Date.now() + 60_000, grantedScope: '' });
    await assert.rejects(engine.searchDirectory('Same'), /unavailable/);
    Object.assign(engine, { grantedScope: 'spark:people_read', expiresAt: 0 });
    await assert.rejects(engine.searchDirectory('Same'), /unavailable/);
  } finally { engine.stop(); }
});
test('demo directory uses the existing session owner and cannot resume an earlier account query', async () => {
  const engine = new EditorEngine();
  try {
    await assert.rejects(engine.searchDirectory('Demo'));
    await engine.start('demo');
    const value = await engine.searchDirectory('Demo');
    assert.equal(value.sessionId, engine.snapshot().localContext!.sessionId);
    assert.equal(value.items.length, 2);
    assert.equal(value.items[0]!.label, value.items[1]!.label, 'same names retain distinct identities');
    assert.notEqual(value.items[0]!.personId, value.items[1]!.personId);
    engine.stop(); await engine.start('demo');
    await assert.rejects(engine.searchDirectory('Demo', true, value.revision));
  } finally { engine.stop(); }
});
