import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalDrafts, validLocalDrafts, type LocalDraft } from '../src/local-drafts.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation, parseEditorRequest } from '../src/editor-protocol.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
const profile = 'a'.repeat(64), other = 'b'.repeat(64);
const draft: LocalDraft = { roomId: 'room', text: '**Local 😀 draft**\nSecond line', format: 'markdown', uncertain: false };
async function fixture() {
  const base = await mkdtemp('/tmp/opencode/wbx-local-drafts-');
  return { base, store: new LocalDrafts(base), close: () => rm(base, { recursive: true, force: true }) };
}
test('private drafts survive fresh owners, isolate accounts and retain exact room/reply/format text', async () => {
  const f = await fixture();
  try {
    const initial = await f.store.load(profile);
    const items = [draft, { ...draft, parentId: 'root', text: 'Reply', uncertain: true }];
    const revision = await f.store.save(profile, initial.revision, items);
    assert.deepEqual(await new LocalDrafts(f.base).load(profile), { revision, items });
    assert.deepEqual((await f.store.load(other)).items, []);
    assert.equal((await lstat(f.store.directory)).mode & 0o777, 0o700);
    assert.equal((await lstat(join(f.store.directory, profile + '.json'))).mode & 0o777, 0o600);
    await f.store.save(profile, revision, []);
    assert.deepEqual((await new LocalDrafts(f.base).load(profile)).items, [], 'sent/cleared drafts cannot resurrect');
  } finally { await f.close(); }
});
test('stale concurrent writers cannot overwrite a newer editor draft', async () => {
  const f = await fixture();
  try {
    const initial = await f.store.load(profile);
    await f.store.save(profile, initial.revision, [draft]);
    await assert.rejects(f.store.save(profile, initial.revision, [{ ...draft, text: 'Older conflicting editor' }]));
    assert.deepEqual((await f.store.load(profile)).items, [draft]);
  } finally { await f.close(); }
});
test('draft storage refuses symlinks, unsafe modes and corrupt/unknown documents without replacing them', async () => {
  const f = await fixture();
  try {
    const initial = await f.store.load(profile);
    await f.store.save(profile, initial.revision, [draft]);
    const path = join(f.store.directory, profile + '.json');
    await chmod(path, 0o644); await assert.rejects(f.store.load(profile)); await chmod(path, 0o600);
    await writeFile(path, '{"version":99,"userWork":"retain"}');
    await assert.rejects(f.store.save(profile, initial.revision, []));
    assert.match(await readFile(path, 'utf8'), /retain/);
    await rm(path); await symlink(join(f.base, 'elsewhere'), path);
    await assert.rejects(f.store.load(profile));
    assert.equal((await lstat(path)).isSymbolicLink(), true);
  } finally { await f.close(); }
});
test('cancellation prevents a draft commit and removes only owned temporary files/locks', async () => {
  const f = await fixture();
  try {
    const initial = await f.store.load(profile);
    let checks = 0;
    await assert.rejects(f.store.save(profile, initial.revision, [draft], () => ++checks < 3));
    assert.deepEqual((await f.store.load(profile)).items, []);
    assert.deepEqual(await readdir(f.store.directory), []);
  } finally { await f.close(); }
});
test('draft documents and RPCs reject arbitrary paths/credentials, duplicates and oversized text', () => {
  assert.equal(validLocalDrafts([draft]), true);
  for (const value of [[draft, draft], [{ ...draft, token: 'SECRET' }], [{ ...draft, text: 'x'.repeat(65_537) }],
    [{ ...draft, format: 'html' }], [{ ...draft, roomId: '../file' }]]) assert.equal(validLocalDrafts(value), false);
  const parse = (method: string, params: object) => parseEditorOperation(parseEditorRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })));
  assert.throws(() => parse('drafts.open', { path: '/private' }));
  assert.throws(() => parse('drafts.save', { profile, revision: profile, items: [draft], path: '/private' }));
  assert.equal(parse('drafts.save', { profile, revision: profile, items: [draft] }).method, 'drafts.save');
});
test('demo draft RPCs require an opened exact profile and never issue transport actions', async () => {
  const f = await fixture();
  const engine = new EditorEngine(async () => { throw Error('NO BROWSER'); }, undefined, undefined, undefined, undefined, undefined,
    { localDrafts: f.store });
  try {
    await engine.start('demo');
    const open = await engine.openLocalDrafts();
    assert.equal(engine.snapshot().room, null);
    await assert.rejects(engine.saveLocalDrafts(other, open.revision, [draft]));
    const saved = await engine.saveLocalDrafts(open.profile, open.revision, [draft]);
    assert.equal(saved.sessionId, open.sessionId);
    assert.deepEqual((await engine.openLocalDrafts()).items, [draft]);
    const second = { ...draft, roomId: 'another-room', text: 'Another draft' };
    const appended = await engine.saveLocalDrafts(open.profile, saved.revision, [second]);
    assert.equal((await engine.openLocalDrafts()).items.length, 2, 'one bounded RPC patch never drops unopened drafts');
    await engine.saveLocalDrafts(open.profile, appended.revision, [{ ...draft, text: '' }]);
    assert.deepEqual((await engine.openLocalDrafts()).items, [second], 'empty patch removes only its exact destination');
    engine.stop();
    await assert.rejects(engine.openLocalDrafts());
  } finally { engine.stop(); await f.close(); }
});
test('live draft profiles require verified self identity and never cross accounts or add missing grants', async t => {
  const f = await fixture(), config = join(f.base, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic-only-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:people_read', 'spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'SYNTHETIC-NOT-A-REAL-TOKEN', expiresAt: Date.now() + 3600_000, scope: 'spark:people_read spark:rooms_read' };
  let account = 'account-A', identities = 0, forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  const engine = new EditorEngine(async () => { throw Error('NO BROWSER'); }, undefined, undefined, undefined, undefined, {
    create: () => { throw Error('SPACES CACHE NOT ENABLED'); },
    account: async () => { identities++; return account; },
  }, { localDrafts: f.store });
  try {
    await engine.start('live', config);
    const a = await engine.openLocalDrafts();
    await engine.saveLocalDrafts(a.profile, a.revision, [draft]);
    await engine.openLocalDrafts(); assert.equal(identities, 1, 'verified identity is shared within the session');
    assert.ok(!JSON.stringify(engine.snapshot()).includes(draft.text), 'draft text never enters ordinary state snapshots');
    engine.stop(); account = 'account-B';
    await engine.start('live', config);
    const b = await engine.openLocalDrafts();
    assert.notEqual(a.profile, b.profile); assert.deepEqual(b.items, []);
    await assert.rejects(engine.saveLocalDrafts(a.profile, a.revision, [draft]));
    engine.stop(); account = 'account-A'; access.scope = 'spark:rooms_read';
    await engine.start('live', config);
    await assert.rejects(engine.openLocalDrafts());
    assert.equal(identities, 2, 'missing People grant cannot trigger identity or storage restore');
    assert.equal(forbidden, 0);
  } finally { engine.stop(); await f.close(); }
});
