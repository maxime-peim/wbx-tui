import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, symlink, chmod, link } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalSections, SectionPreferences, SECTION_LIMITS, validSections, validSectionEdit } from '../src/local-sections.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
const one = () => [{ id: 'a'.repeat(24), name: 'Local <tag> 😀', collapsed: false, rooms: ['room'] }];
const key = 'a'.repeat(64);
test('local section semantic edits are revision-addressed, bounded and never change room identity', () => {
  const sections = new LocalSections(), edit = (value: Parameters<LocalSections['edit']>[0]) => sections.edit(value, sections.snapshot().revision, ['a', 'b']);
  assert.equal(sections.snapshot().items.length, 0);
  edit({ action: 'create', name: 'Work' }); edit({ action: 'create', name: 'Friends' });
  const [a, b] = sections.snapshot().items;
  assert.throws(() => edit({ action: 'create', name: 'work' }), /already/);
  edit({ action: 'assign', id: a!.id, roomId: 'a' }); edit({ action: 'assign', id: b!.id, roomId: 'a' });
  assert.deepEqual(sections.snapshot().items.map(item => item.rooms), [[], ['a']]);
  edit({ action: 'rename', id: a!.id, name: 'Renamed' }); edit({ action: 'toggle', id: a!.id });
  edit({ action: 'move', id: b!.id, position: 0 });
  assert.equal(sections.snapshot().items[0]!.id, b!.id);
  const before = sections.snapshot();
  assert.throws(() => sections.edit({ action: 'remove', id: a!.id }, 0, []), /changed/);
  assert.throws(() => edit({ action: 'assign', id: a!.id, roomId: 'not-listed' }), /listed/);
  assert.deepEqual(sections.snapshot(), before);
  edit({ action: 'remove', id: b!.id }); assert.deepEqual(sections.snapshot().items[0]!.rooms, []);
  const detached = sections.snapshot(); detached.items[0]!.rooms.push('corruption'); assert.deepEqual(sections.snapshot().items[0]!.rooms, []);
  const revision = sections.snapshot().revision; sections.clear(revision); assert.equal(sections.snapshot().revision, revision + 1);
  sections.reset(); assert.deepEqual(sections.snapshot(), { revision: 0, persistence: 'session', items: [] });
});
test('section documents reject duplicate IDs/names/assignments, unknown fields and Unicode/control limits', () => {
  assert.ok(validSections(one()));
  for (const value of [Array(33).fill(one()[0]), [{ ...one()[0], name: '\u202eHidden' }], [{ ...one()[0], name: '😀'.repeat(61) }],
    [{ ...one()[0], token: 'secret' }], [{ ...one()[0], rooms: ['a', 'a'] }], [{ ...one()[0], rooms: Array.from({ length: 501 }, (_, i) => 'id-' + i) }],
    [one()[0], { ...one()[0], id: 'b'.repeat(24), name: one()[0]!.name.toUpperCase() }]]) assert.equal(validSections(value), false);
  for (const value of [{ action: 'create', name: 'Name', token: 'secret' }, { action: 'move', id: 'a'.repeat(24), position: -1 },
    { action: 'assign', id: '', roomId: '../invalid' }]) assert.equal(validSectionEdit(value), false);
  assert.equal(validSectionEdit({ action: 'assign', id: '', roomId: 'room' }), true);
  const unicode = [{ ...one()[0]!, name: 'ΟΣ' }, { ...one()[0]!, id: 'b'.repeat(24), name: 'οσ', rooms: [] }];
  assert.ok(validSections(unicode), 'Unicode spelling stays exact; ASCII-only case uniqueness is identical across runtimes');
  assert.equal(validSections([unicode[0], { ...unicode[1]!, name: 'ΟΣ' }]), false);
});
test('preference files are explicit, private, versioned, bounded and isolated even at slot collisions', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-section-prefs-'), prefs = new SectionPreferences(directory);
  try {
    assert.equal(await prefs.load(key), undefined);
    await prefs.save(key, one());
    assert.equal((await stat(prefs.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(prefs.path(key))).mode & 0o777, 0o600);
    const text = await readFile(prefs.path(key), 'utf8');
    assert.deepEqual(JSON.parse(text), { version: 1, profile: key, items: one() });
    assert.deepEqual(await prefs.load(key), one());
    const collision = key.slice(0, -1) + 'b';
    assert.equal(prefs.path(collision), prefs.path(key)); assert.equal(await prefs.load(collision), undefined);
    await assert.rejects(prefs.save(collision, [{ ...one()[0]!, name: 'Other account' }]));
    assert.deepEqual(await prefs.load(key), one(), 'a save cannot overwrite another profile on collision');
    await prefs.clear(collision); assert.deepEqual(await prefs.load(key), one());
    await assert.rejects(prefs.save(key, one(), () => false));
    assert.deepEqual(await prefs.load(key), one());
    for (const value of [{ version: 2, profile: key, items: one() }, { version: 1, profile: key, items: one(), token: 'secret' }, { version: 1, profile: key, items: [{ ...one()[0], rooms: ['a', 'a'] }] }]) {
      await writeFile(prefs.path(key), JSON.stringify(value)); await assert.rejects(prefs.load(key));
      await assert.rejects(prefs.save(key, one()), 'corrupt or unknown-version user preferences require deliberate clear, not replacement');
    }
    await writeFile(prefs.path(key), 'x'.repeat(SECTION_LIMITS.bytes + 1)); await assert.rejects(prefs.load(key));
    await prefs.save(key, one()).then(() => assert.fail('unsafe/oversized target must not be overwritten'), () => {});
    await rm(prefs.path(key)); await prefs.save(key, one()); await prefs.clear(key);
    assert.equal(await prefs.load(key), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
for (const kind of ['symlink', 'hardlink', 'mode'] as const) test(`preferences reject ${kind} targets without following them`, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-section-unsafe-'), prefs = new SectionPreferences(directory);
  try {
    await prefs.save(key, one()); const original = prefs.path(key), other = join(directory, 'other');
    await writeFile(other, 'UNCHANGED', { mode: 0o600 });
    if (kind === 'mode') await chmod(original, 0o644);
    else { await rm(original); if (kind === 'symlink') await symlink(other, original); else await link(other, original); }
    await assert.rejects(prefs.load(key)); await assert.rejects(prefs.save(key, one())); await assert.rejects(prefs.clear(key));
    assert.equal(await readFile(other, 'utf8'), 'UNCHANGED');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('engine defaults stay unchanged; section operations are local and session-only without verified account identity', async t => {
  let network = 0; t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Network forbidden'); });
  const engine = new EditorEngine();
  try {
    await engine.startSession({ mode: 'demo' }); await engine.select('demo-general');
    assert.equal(engine.snapshot().sections, undefined);
    const before = engine.snapshot(), text = before.messages;
    engine.editSections({ action: 'create', name: 'Work' }, 0);
    const first = engine.snapshot().sections!;
    engine.editSections({ action: 'assign', id: first.items[0]!.id, roomId: 'demo-general' }, first.revision);
    await assert.rejects(engine.sectionPreferences('save', engine.snapshot().sections!.revision), /session-only/);
    assert.deepEqual(engine.snapshot().messages, text); assert.deepEqual(engine.snapshot().rooms, before.rooms);
    assert.equal(engine.snapshot().room!.id, 'demo-general'); assert.equal(network, 0);
    engine.stop(); assert.equal(engine.snapshot().sections, undefined);
    await engine.startSession({ mode: 'demo' }); assert.equal(engine.snapshot().sections, undefined);
  } finally { engine.stop(); }
});
test('section wire intents reject unknown fields, stale-format snapshots and bad revisions before side effects', () => {
  const request = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
  assert.equal(request('sections.edit', { revision: 0, edit: { action: 'create', name: 'Work' } }).method, 'sections.edit');
  for (const params of [{ revision: -1, edit: { action: 'create', name: 'Work' } }, { revision: 0, edit: { action: 'create', name: 'Work' }, path: '/private' },
    { revision: 0, edit: { action: 'assign', id: '', roomId: 'room', token: 'secret' } }]) assert.throws(() => request('sections.edit', params));
  assert.throws(() => request('sections.preferences', { revision: 0, action: 'save', key }));
});
test('engine preference I/O retains physical admission across reset and rejects old load completions', async t => {
  let resolve!: (value: ReturnType<typeof one>) => void, loads = 0;
  class DelayedPreferences extends SectionPreferences {
    override async load() { loads++; return new Promise<ReturnType<typeof one>>(yes => { resolve = yes; }); }
  }
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { sectionPreferences: new DelayedPreferences() });
  const internal = engine as unknown as { disk: { boundKey(): string | undefined } };
  let bound = key;
  // This preference-only fixture substitutes the verified binding, not cache
  // state. Real identity/restore workflows are covered by cache integration.
  t.mock.method(internal.disk, 'boundKey', () => bound);
  try {
    await engine.start('demo');
    engine.editSections({ action: 'create', name: 'Current session' }, 0);
    const pending = engine.sectionPreferences('load', 1);
    await assert.rejects(engine.sectionPreferences('save', 1), /active/);
    assert.throws(() => engine.editSections({ action: 'create', name: 'Unqueued' }, 1), /active/);
    engine.stop(); await engine.start('demo'); bound = key.slice(0, -1) + 'b';
    await assert.rejects(engine.sectionPreferences('load', 0), /active/);
    assert.equal(loads, 1);
    resolve(one()); await assert.rejects(pending, /invalidated/);
    assert.equal(engine.snapshot().sections, undefined, 'old profile cannot populate the replacement session');
    engine.editSections({ action: 'create', name: 'New session' }, 0);
    assert.equal(engine.snapshot().sections!.items[0]!.name, 'New session');
  } finally { engine.stop(); }
});
test('concurrent profile collisions cannot race past validation and replace each other', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-section-collision-');
  const first = new SectionPreferences(directory), second = new SectionPreferences(directory), other = key.slice(0, -1) + 'b';
  try {
    const results = await Promise.allSettled([first.save(key, one()), second.save(other, [{ ...one()[0]!, name: 'Other profile' }])]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const left = await first.load(key), right = await second.load(other);
    assert.notEqual(!!left, !!right);
    const owner = left ? key : other, before = await readFile(first.path(owner), 'utf8');
    await writeFile(first.path(owner) + '.lock', 'stale owned lock', { mode: 0o600 });
    await assert.rejects(first.save(owner, one()), 'stale/foreign locks never get automatically removed or bypassed');
    assert.equal(await readFile(first.path(owner), 'utf8'), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('engine explicit save/load/clear uses only its verified private profile key and leaves drafts/read data alone', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-section-engine-'), prefs = new SectionPreferences(directory);
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { sectionPreferences: prefs });
  const internal = engine as unknown as { disk: { boundKey(): string | undefined } };
  t.mock.method(internal.disk, 'boundKey', () => key);
  try {
    await engine.start('demo');
    engine.editSections({ action: 'create', name: 'Saved' }, 0);
    const messages = engine.snapshot().messages, rooms = engine.snapshot().rooms;
    await engine.sectionPreferences('save', 1); assert.equal(engine.snapshot().sections!.persistence, 'saved');
    const saved = engine.snapshot().sections!.items;
    engine.editSections({ action: 'rename', id: saved[0]!.id, name: 'Session-only' }, 1);
    await engine.sectionPreferences('load', 2);
    assert.equal(engine.snapshot().sections!.items[0]!.name, 'Saved');
    const revision = engine.snapshot().sections!.revision;
    await writeFile(prefs.path(key), '{"version":999}');
    await assert.rejects(engine.sectionPreferences('load', revision), /unavailable/);
    assert.equal(engine.snapshot().sections!.items[0]!.name, 'Saved');
    await rm(prefs.path(key)); await engine.sectionPreferences('save', revision);
    await engine.sectionPreferences('clear', revision);
    assert.deepEqual(engine.snapshot().sections!.items, []);
    assert.equal(engine.snapshot().sections!.revision, revision + 1);
    assert.deepEqual(engine.snapshot().messages, messages); assert.deepEqual(engine.snapshot().rooms, rooms);
    assert.equal(await prefs.load(key), undefined);
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});
