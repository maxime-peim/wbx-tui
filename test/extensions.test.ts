import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { defaults, parseConfig } from '../src/config.js';
import { MessagingStore } from '../src/messaging-store.js';
import { demoMessageAPI } from '../src/messaging-api.js';
import { MessagingUI } from '../src/messaging-ui.js';
import { ExtensionHost } from '../src/extensions.js';
import type { ExtensionEvent } from '../src/extension-api.js';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture() {
  const config = parseConfig({ oauth: { clientId: 'synthetic-public-id-not-for-plugins', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } });
  const store = new MessagingStore(demoMessageAPI(), 0), ui = new MessagingUI(store, config);
  let invalidations = 0; const host = new ExtensionHost(ui, () => { invalidations++; });
  await store.loadRooms();
  return { store, ui, host, api: host.api, get invalidations() { return invalidations; }, async close() { await host.dispose(); store.close(); } };
}
test('function keymaps, custom commands/arguments, macros, palette registration and validated option changes are programmable', async () => {
  const f = await fixture();
  try {
    let args = '', calls = 0;
    f.api.commands.add('user.greet', (_context, value) => { args = value; calls++; });
    f.api.keymap.set('normal', '<leader> H', () => { calls++; });
    f.ui.key(' '); f.ui.key('H'); await tick(); assert.equal(calls, 1);
    f.ui.key(':'); for (const char of 'user.greet hello world') f.ui.key(char); f.ui.key('<Enter>'); await tick();
    assert.equal(args, 'hello world'); assert.equal(calls, 2);
    f.api.keymap.set('normal', 'M', ['focus.rooms', 'move.down', 'open']); f.ui.key('M'); await tick(); assert.equal(f.store.room?.id, 'demo-engineering');
    f.api.themes.add('personal', { accent: '#abcdef' }); f.api.themes.use('personal'); assert.equal(f.ui.config.theme.accent, '#abcdef');
    const before = f.ui.config;
    assert.throws(() => f.api.configure({ messaging: { keybindings: { normal: { g: 'open' } } } })); assert.equal(f.ui.config, before);
    assert.throws(() => f.api.configure({ oauth: {} } as any));
  } finally { await f.close(); }
});
test('extension contexts are immutable snapshots, omit OAuth/transport details and cannot mutate the core message/draft state', async () => {
  const f = await fixture();
  try {
    await f.store.select('demo-general'); f.ui.action('insert'); f.ui.paste('private local draft');
    const context = f.api.context(); assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(context.messages)); assert.ok(Object.isFrozen(context.messages[0]));
    assert.throws(() => { (context.room as any).title = 'changed'; }); assert.notEqual(f.store.room?.title, 'changed');
    assert.ok(!JSON.stringify(context).includes('synthetic-public-id')); assert.ok(!('oauth' in context)); assert.ok(!('token' in context)); assert.ok(!('store' in context));
    assert.equal(context.draft.text, 'private local draft');
  } finally { await f.close(); }
});
test('custom panels/layouts and status/tab lines render bounded plain text, without executing returned terminal escapes', async () => {
  const f = await fixture();
  try {
    f.api.panels.add('user.notes', () => ['Notes from a module', '\x1b[2Jdo not execute']);
    f.api.layouts.add('custom', { direction: 'vertical', ratio: .75, children: [structuredClone(defaults().messaging.layouts.mail!), { panel: 'user.notes' }] });
    f.api.layouts.use('custom'); f.api.focus('user.notes');
    f.api.ui.statusline(context => ({ left: `CUSTOM STATUS ${context.focus}`, right: 'CUSTOM RIGHT' }));
    f.api.ui.tabline(() => 'CUSTOM BUFFER LINE');
    const screen = f.ui.screen(160, 40); assert.ok(screen.lines.join('\n').includes('Notes from a module')); assert.ok(screen.lines.at(-2)!.includes('CUSTOM STATUS user.notes'));
    assert.ok(screen.lines.at(-2)!.endsWith('CUSTOM RIGHT')); assert.ok(screen.lines[0]!.startsWith('CUSTOM BUFFER LINE')); assert.ok(!screen.ansi.includes('\x1b[2J'));
    f.api.configure({ messaging: { layout: 'mail' } }); assert.equal(f.ui.layoutName, 'mail');
  } finally { await f.close(); }
});
test('hooks track state changes, dispose subscriptions/resources exactly once, and leave core controls working after unload', async () => {
  const f = await fixture(), events: string[] = []; let cleaned = 0;
  try {
    for (const name of ['ready', 'room.changed', 'messages.changed', 'mode.changed', 'draft.changed', 'focus.changed', 'quit'] as ExtensionEvent[]) f.api.events.on(name, () => { events.push(name); });
    f.api.onCleanup(() => { cleaned++; }); f.host.start(); await tick();
    await f.store.select('demo-general'); f.ui.action('insert'); f.ui.paste('draft'); f.host.sync(); await tick();
    assert.ok(['ready', 'room.changed', 'messages.changed', 'mode.changed', 'draft.changed', 'focus.changed'].every(name => events.includes(name)));
    const count = events.length; f.host.sync(); await tick(); assert.equal(events.length, count);
    await f.host.dispose(); await f.host.dispose(); assert.equal(cleaned, 1); assert.equal(events.filter(name => name === 'quit').length, 1);
    assert.equal(f.ui.extensions, undefined); assert.throws(() => f.api.notify('late')); f.ui.action('user.no-longer-loaded'); assert.match(f.ui.notice, /not registered/);
  } finally { await f.close(); }
});
test('failing callbacks do not expose provider errors, and impure/invalid renderers disable without recursive redraws', async () => {
  const f = await fixture();
  try {
    f.api.commands.add('user.fail', () => { throw new Error('private-secret-provider-body'); }); f.ui.action('user.fail'); await tick();
    assert.ok(!f.ui.notice.includes('private-secret')); assert.match(f.ui.notice, /callback failed/);
    f.api.ui.statusline(() => { f.api.notify('recursive'); return { left: 'bad' }; });
    f.ui.screen(100, 24); assert.match(f.ui.notice, /status line failed/); assert.equal(f.host.statusline(), undefined);
    f.api.panels.add('user.bad', () => new Array(201).fill('too much')); assert.deepEqual(f.host.panel('user.bad', 10, 10), ['User panel failed.']);
  } finally { await f.close(); }
});
test('module reload emits unload but never pretends that the application quit', async () => {
  const f = await fixture(), events: string[] = [];
  f.api.events.on('quit', () => { events.push('quit'); }); f.api.events.on('unload', (_context, reason) => { events.push(reason); });
  await f.host.dispose('reload'); assert.deepEqual(events, ['reload']); await f.close();
});
test('explicit local modules load with cache-busted top-level reload, execute cleanup, and roll back a failed setup without losing drafts', async () => {
  const f = await fixture(), dir = await mkdtemp('/tmp/opencode/wbx-init-'), path = join(dir, 'init.mjs'), marker = join(dir, 'cleanup');
  try {
    await f.store.select('demo-general'); f.ui.action('insert'); f.ui.paste('keep this draft');
    await writeFile(path, `import {writeFile} from 'node:fs/promises'; export default api => {api.configure({leader:','});api.commands.add('user.version',()=>api.notify('v1'));return ()=>writeFile(${JSON.stringify(marker)},'cleaned');};`);
    await f.host.load(path); f.ui.action('user.version'); await tick(); assert.equal(f.ui.notice, 'v1');
    await f.host.dispose(); assert.equal(await readFile(marker, 'utf8'), 'cleaned');
    const second = new ExtensionHost(f.ui, () => {});
    await writeFile(path, `export default api => {api.commands.add('user.version',()=>api.notify('v2'));};`);
    await second.load(path); f.ui.action('user.version'); await tick(); assert.equal(f.ui.notice, 'v2'); await second.dispose();
    const third = new ExtensionHost(f.ui, () => {}), before = f.ui.config;
    await writeFile(path, `export default api => {api.configure({leader:';'});throw new Error('private-token-body');};`);
    await assert.rejects(third.load(path), error => error instanceof Error && !error.message.includes('private-token'));
    assert.equal(f.ui.config, before); assert.equal(f.ui.draft?.text, 'keep this draft'); assert.equal(f.ui.extensions, undefined);
    assert.throws(() => parseConfig({ init: path }), /Unknown/);
  } finally { await f.close(); await rm(dir, { recursive: true, force: true }); }
});
test('timed-out async setup rolls back, rejects late API mutations and executes late-returned cleanup', async () => {
  const f = await fixture(), dir = await mkdtemp('/tmp/opencode/wbx-init-timeout-'), path = join(dir, 'init.mjs'), marker = join(dir, 'cleanup');
  try {
    await writeFile(path, `import {appendFile} from 'node:fs/promises'; export default async api => {api.configure({leader:','});await new Promise(r=>setTimeout(r,60));try{api.notify('late mutation');}catch{} return ()=>appendFile(${JSON.stringify(marker)},'cleaned');};`);
    const before = f.ui.config;
    await assert.rejects(f.host.load(path, 20), /restored/); assert.equal(f.ui.config, before); assert.equal(f.ui.extensions, undefined);
    for (let i = 0; i < 100 && !await readFile(marker, 'utf8').catch(() => ''); i++) await delay(10);
    assert.equal(await readFile(marker, 'utf8'), 'cleaned'); assert.notEqual(f.ui.notice, 'late mutation');
  } finally { await f.close(); await rm(dir, { recursive: true, force: true }); }
});
