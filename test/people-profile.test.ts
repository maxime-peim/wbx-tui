import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readPersonProfile, parsePersonProfile, PROFILE_LIMITS } from '../src/people-profile.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { PublicREST, type ActionREST, type PublicResponse } from '../src/public-rest.js';

const sessionId = 'a'.repeat(32), personId = 'person-a';
const raw = { id: personId, displayName: 'Same Name', firstName: 'Same', lastName: 'Name',
  department: 'Research', title: 'Engineer', timezone: 'Europe/Paris',
  emails: ['PRIVATE@example.invalid'], avatar: 'https://example.invalid/AVATAR',
  status: 'DoNotDisturb', customStatus: 'PRIVATE STATUS', lastActivity: '2026-11-15T10:00:00.000Z',
  phoneNumbers: ['PRIVATE PHONE'], roles: ['ADMIN'], licenses: ['PRIVATE'], addresses: [{}],
  manager: 'PRIVATE MANAGER', orgId: 'PRIVATE ORG', accessToken: 'PRIVATE TOKEN' };
test('text profile parser and RPC admit only one exact person ID, not names/emails/actor/URL/admin fields', () => {
  assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'people.profile', params: { personId } }),
    { method: 'people.profile', params: { personId } });
  for (const id of ['', 'me', 'Same Name', 'p@example.invalid', '../other', null, [], {}]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'people.profile', params: { personId: id } }));
  }
  for (const extra of [{ actorId: 'other' }, { token: 'secret' }, { callingData: true }, { orgId: 'other' },
    { url: 'https://evil.invalid' }, { fields: ['status'] }, { more: true }]) {
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'people.profile', params: { personId, ...extra } }));
  }
});
test('profile projects only six documented inert fields, never private/presence/avatar/admin data or authority', () => {
  const value = parsePersonProfile(raw, personId, sessionId, 10000)!;
  assert.deepEqual(value, { sessionId, personId, coverage: 'person-text', observedAt: 10000, partial: false,
    fields: { displayName: 'Same Name', firstName: 'Same', lastName: 'Name', department: 'Research', title: 'Engineer', timezone: 'Europe/Paris' } });
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE|AVATAR|ADMIN|avatar|emails|status|Status|roles|licenses|phone|lastActivity|orgId|accessToken/);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= PROFILE_LIMITS.dtoBytes);
  value.fields.displayName = 'Changed locally'; assert.equal(raw.displayName, 'Same Name');
});
test('profile field sanitation, clipping and policy-missing data remain partial and cannot invent presence', () => {
  const value = parsePersonProfile({ id: personId, displayName: '  A\nB\u202e  ', title: repeatEmoji(3000),
    department: { role: 'ADMIN' }, timezone: null }, personId, sessionId, 10000)!;
  assert.equal(value.fields.displayName, 'A B'); assert.equal([...value.fields.title!].length, 120);
  assert.equal(value.fields.department, undefined); assert.equal(value.fields.timezone, undefined);
  assert.equal(value.partial, true);
  assert.deepEqual(parsePersonProfile({ id: personId }, personId, sessionId, 10000)!.fields, {});
  assert.equal(parsePersonProfile({ id: personId }, personId, sessionId, 10000)!.partial, true);
  const largest = parsePersonProfile({ id: 'p'.repeat(512), ...Object.fromEntries(
    ['displayName', 'firstName', 'lastName', 'department', 'title', 'timezone'].map(key => [key, repeatEmoji(120)])) },
    'p'.repeat(512), sessionId, 10000)!;
  assert.ok(Buffer.byteLength(JSON.stringify(largest)) <= PROFILE_LIMITS.dtoBytes);
});
function repeatEmoji(length: number) { return '😀'.repeat(length); }
test('wrong identities, malformed errors and invalid session/clock are rejected before profile projection', () => {
  for (const value of [null, [], {}, { ...raw, id: 'other' }, { ...raw, errors: [] }]) {
    assert.equal(parsePersonProfile(value, personId, sessionId, 10000), undefined);
  }
  assert.equal(parsePersonProfile(raw, 'me', sessionId, 10000), undefined);
  assert.equal(parsePersonProfile(raw, personId, 'foreign', 10000), undefined);
  for (const now of [-1, Infinity, NaN, 1.2]) assert.equal(parsePersonProfile(raw, personId, sessionId, now), undefined);
});
test('explicit profile read makes exactly one GET, checks ownership after response and never caches/retries', async () => {
  let calls = 0, current = true;
  const rest: ActionREST = { busy: () => false, async call(path, method, token, _signal, body) {
    calls++; assert.equal(path, '/v1/people/person-a'); assert.equal(method, 'GET'); assert.equal(token, 'INERT');
    assert.equal(body, undefined); return { value: raw };
  } };
  const check = () => { if (!current) throw new Error('Invalidated'); return 'INERT'; };
  const result = await readPersonProfile(personId, sessionId, rest, check, new AbortController().signal, () => 10000);
  assert.equal(result.personId, personId); assert.equal(calls, 1);
  await readPersonProfile(personId, sessionId, rest, check, new AbortController().signal, () => 10001);
  assert.equal(calls, 2, 'a deliberate refresh is a new GET, not a cache assertion');
  let release!: (value: PublicResponse) => void;
  const slow: ActionREST = { busy: () => false, call: async () => new Promise(resolve => { release = resolve; }) };
  const pending = readPersonProfile(personId, sessionId, slow, check, new AbortController().signal);
  current = false; release({ value: raw }); await assert.rejects(pending);
});
for (const status of [200, 302, 401, 403, 404, 429]) test(`fixed public profile read ${status}: one physical GET, no redirect/refresh/retry or URL fetch`, async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++; assert.equal(req.method, 'GET'); assert.equal(req.url, '/v1/people/person-a');
    assert.equal(req.headers.authorization, 'Bearer INERT');
    const chunks = []; for await (const chunk of req) chunks.push(chunk); assert.equal(Buffer.concat(chunks).length, 0);
    res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://evil.invalid/AVATAR' });
    res.end(JSON.stringify(raw));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const rest = new PublicREST((options, listener) => {
    assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.protocol, 'https:'); assert.equal(options.agent, false);
    return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  });
  try {
    const pending = readPersonProfile(personId, sessionId, rest, () => 'INERT', new AbortController().signal);
    if (status === 200) assert.equal((await pending).fields.department, 'Research'); else await assert.rejects(pending);
    assert.equal(calls, 1); assert.equal(rest.busy(), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('engine profile reads are independent of selected-peer presence and cannot borrow missing/expired grants', async () => {
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined,
    { publicRequest: () => assert.fail('Unknown/expired grant must refuse before profile GET') });
  try {
    await assert.rejects(engine.personProfile(personId));
    await engine.start('demo');
    const before = engine.snapshot();
    const profile = await engine.personProfile(personId);
    assert.equal(profile.sessionId, before.localContext!.sessionId);
    assert.equal(profile.personId, personId); assert.equal(profile.coverage, 'person-text');
    assert.deepEqual(engine.snapshot(), before, 'explicit profile does not publish/enrich presence/history/notifications');
    Object.assign(engine, { mode: 'live', token: 'INERT', expiresAt: Date.now() + 60000, grantedScope: '' });
    await assert.rejects(engine.personProfile(personId), /unavailable/);
    Object.assign(engine, { grantedScope: 'spark:people_read', expiresAt: 0 });
    await assert.rejects(engine.personProfile(personId), /unavailable/);
  } finally { engine.stop(); }
});
test('profile cancellation and grant/session replacement discard late data without refilling any cache', async () => {
  let calls = 0, release!: (value: PublicResponse) => void;
  const rest: ActionREST = { busy: () => false, async call() {
    calls++; return new Promise(resolve => { release = resolve; });
  } };
  const early = new AbortController(); early.abort();
  await assert.rejects(readPersonProfile(personId, sessionId, rest, () => 'INERT', early.signal));
  assert.equal(calls, 0, 'pre-canceled reads do not submit');
  const late = new AbortController();
  const pending = readPersonProfile(personId, sessionId, rest, () => 'INERT', late.signal);
  late.abort(); release({ value: raw }); await assert.rejects(pending);
  assert.equal(calls, 1);
  const engine = new EditorEngine();
  try {
    await engine.start('demo');
    Object.assign(engine, { actionREST: rest });
    const oldSession = engine.snapshot().localContext!.sessionId;
    const old = engine.personProfile(personId);
    engine.stop(); await engine.start('demo');
    const before = engine.snapshot();
    assert.notEqual(before.localContext!.sessionId, oldSession);
    release({ value: raw }); await assert.rejects(old);
    assert.deepEqual(engine.snapshot(), before, 'late profile cannot publish into a replacement session');
    Object.assign(engine, { mode: 'live', token: 'INERT', expiresAt: Date.now() + 60000, grantedScope: 'spark:people_read' });
    const revoked = engine.personProfile(personId);
    Object.assign(engine, { grantedScope: '' });
    release({ value: raw }); await assert.rejects(revoked);
    assert.equal(calls, 3, 'no auth recovery, replay, cache refill or automatic re-read');
  } finally { engine.stop(); }
});
