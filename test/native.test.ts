import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callIdentity } from '../src/call-launch.js';
import { fromTmuxLayout, layoutChecksum, nativeTree, tmuxLayout } from '../src/tmux-layout.js';
import { defaults, parseConfig, validateLayout } from '../src/config.js';
import { UI } from '../src/ui.js';
import { CallPanes } from '../src/call-panes.js';
import type { SourceInfo } from '../src/protocol.js';

test('call identifiers are deterministic, private, canonical, and distinguish meetings', () => {
  const a = callIdentity('live', 'https://example.webex.com/meet/alex');
  assert.deepEqual(callIdentity('live', 'https://example.webex.com/meet/alex/#fragment'), a);
  assert.notEqual(callIdentity('live', 'https://example.webex.com/meet/sam').name, a.name);
  assert.ok(!a.name.includes('alex')); assert.match(a.name, /^wbx-[a-f0-9]{16}$/);
  assert.equal(callIdentity('demo').name, 'wbx-demo'); assert.equal(callIdentity('demo', undefined, 'standup').name, 'wbx-standup');
  assert.throws(() => callIdentity('demo', undefined, 'bad;name'));
  assert.throws(() => callIdentity('live', 'https://evil.invalid/meet/alex'));
});
test('JSON layouts compile into real tmux geometry and save back using source IDs, not pane IDs', () => {
  const panes = [{ pane: '%4', source: 'video' as const }, { pane: '%7', source: 'mock-2' as const }, { pane: '%9', source: 'share' as const }];
  const tree = nativeTree({ direction: 'vertical', ratio: .65, children: [{ source: 'video' }, { source: 'mock-2' }] }, panes);
  const encoded = tmuxLayout(tree, 160, 48);
  assert.equal(encoded.slice(0, 4), layoutChecksum(encoded.slice(5)));
  const saved = fromTmuxLayout(encoded, panes); validateLayout(saved);
  const text = JSON.stringify(saved); assert.ok(text.includes('share')); assert.ok(!text.includes('%4'));
  assert.throws(() => fromTmuxLayout(encoded, panes.slice(0, 2)), /unmanaged/);
  assert.throws(() => tmuxLayout(tree, 2, 2), /too small/);
});
test('native UI delegates all window operations instead of drawing fake tmux splits', () => {
  const actions: string[] = [], ui = new UI(defaults(), action => actions.push(action), true);
  for (const action of ['pane.split.vertical', 'pane.maximize', 'focus.right', 'layout gallery', 'source.set share']) ui.dispatch(action);
  assert.equal(ui.workspace.panes().length, 1);
  assert.deepEqual(actions, ['pane.split.vertical', 'pane.maximize', 'focus.right', 'layout gallery', 'source.set share']);
  const chrome = ui.chrome('Native pane', ''); assert.ok(!chrome.includes('│')); assert.ok(!chrome.includes('NORMAL · 4 panes'));
});

function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
class FakeTmux {
  commands: string[][] = [];
  panes = new Map([['%1', { pid: '101', source: '', marker: '', title: '' }]]);
  active = '%1'; next = 1;
  blockList?: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> };
  async run(...args: string[]): Promise<string> {
    this.commands.push(args);
    const target = args[args.indexOf('-t') + 1]!;
    if (args[0] === 'display-message') {
      if (args.at(-1) === '#{window_id} #{pane_pid} #{session_name}') return '@1 101 wbx-test';
      if (args.at(-1) === '#{pane_id}') return this.active;
      const pane = this.panes.get(target);
      return pane ? `@1|${pane.pid}|${pane.marker}|${pane.source}` : '';
    }
    if (args[0] === 'list-panes') {
      const block = this.blockList; this.blockList = undefined;
      if (block) { block.entered.resolve(); await block.release.promise; }
      return [...this.panes].map(([id, pane]) => args.at(-1) === '#{pane_id}' ? id : `${id}|${pane.pid}|${pane.marker}|${pane.source}`).join('\n');
    }
    if (args[0] === 'split-window') {
      const id = `%${++this.next}`, pid = String(100 + this.next);
      this.panes.set(id, { pid, source: '', marker: '', title: '' }); return `${id} ${pid}`;
    }
    const pane = this.panes.get(target);
    if (args[0] === 'set-option' && pane) {
      if (args.at(-2) === '@wbx_source') pane.source = args.at(-1)!;
      if (args.at(-2) === '@wbx_owner') pane.marker = args.at(-1)!;
    }
    if (args[0] === 'select-pane' && pane) {
      if (args.includes('-T')) pane.title = args.at(-1)!; else this.active = target;
    }
    if (args[0] === 'kill-pane') { this.panes.delete(target); this.active = '%1'; }
    return '';
  }
}
function paneFixture() {
  const tmux = new FakeTmux(), controls: string[] = [];
  const context = { ...callIdentity('demo', undefined, 'test'), marker: 'test-owner' };
  const panes = new CallPanes({ context, socket: '/unused/frames.sock', configPath: '/unused/config.json',
    config: defaults(), pixelTransport: 'inline', tmux, control: action => controls.push(action) });
  return { panes, tmux, controls };
}
test('native meeting appearance inherits tmux by default; engine border/status styling requires explicit opt-in', async () => {
  assert.deepEqual(defaults().tmux, { appearance: 'inherit' });
  assert.deepEqual(parseConfig({ tmux: {} }).tmux, { appearance: 'inherit' });
  for (const tmux of ['theme', null, { appearance: 'invalid' }, { status: 'on' }]) assert.throws(() => parseConfig({ tmux }));
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux } = paneFixture();
  try {
    await panes.start();
    assert.ok(!tmux.commands.some(args => args[0] === 'set-option' && args.some(arg => /^(status(?:-|$)|pane-(?:active-)?border)/.test(arg))), 'default never overrides tmux appearance');
    tmux.commands = [];
    const config = defaults(); config.theme.focus = '#abcdef';
    await panes.reconfigure(config);
    assert.ok(!tmux.commands.some(args => args[0] === 'set-option'), 'theme reload still leaves inherited tmux untouched');
    config.tmux.appearance = 'theme'; await panes.reconfigure(config);
    assert.ok(tmux.commands.some(args => args.includes('pane-active-border-style') && args.at(-1)?.includes('#abcdef')));
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
test('native source storms coalesce, retain latest labels, cache tags, and cannot delay validated media/leave controls', async () => {
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux, controls } = paneFixture();
  const info = (label: string): SourceInfo[] => [{ id: 'video', kind: 'video', label, available: true }];
  try {
    await panes.start(); tmux.commands = [];
    const gate = { entered: deferred(), release: deferred() }; tmux.blockList = gate;
    const first = panes.sync(info('initial')); await gate.entered.promise;
    for (let i = 0; i < 1000; i++) assert.equal(panes.sync(info(`latest ${i}`)), first);
    const focus = panes.action('source.set video');
    await panes.action('microphone.toggle'); await panes.action('quit');
    assert.deepEqual(controls, ['microphone.toggle', 'quit'], 'media controls bypass the blocked membership queue');
    tmux.panes.get('%1')!.marker = 'foreign';
    await assert.rejects(panes.action('video.toggle'), /not from a managed pane/);
    tmux.panes.get('%1')!.marker = 'test-owner';
    gate.release.resolve(); await first; await focus;
    assert.equal(tmux.panes.get('%1')!.title, 'latest 999');
    assert.equal(tmux.commands.filter(args => args[0] === 'list-panes').length, 3, 'two snapshots and one action, not 1000 snapshots');
    assert.equal(tmux.commands.filter(args => args[0] === 'set-option').length, 0, 'source/ownership tags do not repeat');
    assert.equal(tmux.commands.filter(args => args.includes('-T')).length, 2);
    tmux.commands = [];
    await panes.sync(info('latest 999'));
    assert.deepEqual(tmux.commands.map(args => args[0]), ['list-panes'], 'unchanged snapshot performs one ownership census only');
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
test('native camera-off members retain panes; dismissal follows identity, never kills or retags foreign panes', async () => {
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux } = paneFixture();
  const primary: SourceInfo = { id: 'video', kind: 'video', label: 'Alex', available: true };
  const peer: SourceInfo = { id: 'remote-2', kind: 'video', label: 'Sam · camera off', available: false, present: true, generation: 1 };
  try {
    await panes.start(); await panes.sync([primary, peer]);
    const before = panes.snapshot().panes.find(pane => pane.source === 'remote-2')!;
    assert.ok(before, 'present member without a live camera gets a real pane');
    await panes.sync([primary, { ...peer, available: true }]);
    assert.equal(panes.snapshot().panes.find(pane => pane.source === 'remote-2')!.pane, before.pane);
    await panes.action('source.set remote-2'); await panes.action('pane.close');
    await panes.sync([primary, peer]); await panes.sync([primary, { ...peer, available: true }]);
    assert.equal(panes.snapshot().panes.length, 1, 'same person stays dismissed through camera changes');
    await panes.sync([primary, { ...peer, label: 'New participant', generation: 2 }]);
    const replacement = panes.snapshot().panes.find(pane => pane.source === 'remote-2')!;
    assert.notEqual(replacement.pane, before.pane, 'new person reusing a slot is not dismissed');
    tmux.panes.get(replacement.pane)!.marker = 'foreign'; tmux.commands = [];
    await panes.sync([primary]);
    assert.ok(tmux.panes.has(replacement.pane));
    assert.ok(!tmux.commands.some(args => ['kill-pane', 'set-option', 'select-pane'].includes(args[0]!) && args.includes(replacement.pane)));
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
test('participant/share changes never change any geometry while foreign panes share the window', async () => {
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux } = paneFixture();
  const primary: SourceInfo = { id: 'video', kind: 'video', label: 'Alex', available: true };
  const peer: SourceInfo = { id: 'remote-2', kind: 'video', label: 'Sam', available: true, present: true };
  const share: SourceInfo = { id: 'share', kind: 'share', label: 'Received share', available: true };
  try {
    await panes.start(); await panes.sync([primary, peer]);
    tmux.panes.set('%99', { pid: '999', marker: 'foreign', source: '', title: 'Unrelated editor' });
    tmux.commands = [];
    await panes.sync([{ ...primary, label: 'New speaker' }, share]);
    const geometry = ['select-layout', 'resize-pane', 'swap-pane', 'split-window', 'kill-pane', 'join-pane', 'move-pane'];
    assert.ok(!tmux.commands.some(args => geometry.includes(args[0]!)), 'both arrival and departure geometry are deferred');
    assert.equal(tmux.panes.get('%99')!.title, 'Unrelated editor');
    assert.equal(tmux.panes.get('%1')!.title, 'New speaker', 'owned metadata still updates');
    assert.equal(panes.snapshot().panes.length, 2, 'departed owned pane is retained rather than expanding its foreign neighbour');
    await assert.rejects(panes.action('layout gallery'), /unmanaged panes/);
    assert.ok(!tmux.commands.some(args => geometry.includes(args[0]!)));
    tmux.panes.delete('%99'); await panes.sync([primary, share]);
    assert.ok(panes.snapshot().panes.some(view => view.source === 'share'), 'automatic lifecycle resumes when the window is exclusively owned');
    assert.ok(!panes.snapshot().panes.some(view => view.source === 'remote-2'));
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
test('closing panes bounds a stalled census and invalidates its later geometry work', { timeout: 2500 }, async () => {
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux } = paneFixture();
  try {
    await panes.start();
    const gate = { entered: deferred(), release: deferred() }; tmux.blockList = gate;
    const sync = panes.sync([{ id: 'share', label: 'Share', kind: 'share', available: true }]);
    await gate.entered.promise; await panes.close(); tmux.commands = [];
    gate.release.resolve(); await sync;
    assert.ok(!tmux.commands.some(args => ['select-layout', 'split-window', 'kill-pane'].includes(args[0]!)));
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
test('automatic departure rechecks foreign membership after asynchronous pane ownership validation', async () => {
  const old = process.env.TMUX_PANE; process.env.TMUX_PANE = '%1';
  const { panes, tmux } = paneFixture();
  const primary: SourceInfo = { id: 'video', label: 'Alex', kind: 'video', available: true };
  try {
    await panes.start(); await panes.sync([primary, { id: 'share', label: 'Share', kind: 'share', available: true }]);
    const share = panes.snapshot().panes.find(view => view.source === 'share')!;
    const run = tmux.run.bind(tmux);
    tmux.run = async (...args: string[]) => {
      const result = await run(...args);
      if (args[0] === 'display-message' && args.includes(share.pane)) tmux.panes.set('%99', { pid: '999', marker: 'foreign', source: '', title: 'New editor' });
      return result;
    };
    tmux.commands = []; await panes.sync([primary]);
    assert.ok(tmux.panes.has(share.pane));
    assert.ok(!tmux.commands.some(args => ['kill-pane', 'select-layout', 'resize-pane', 'swap-pane'].includes(args[0]!)));
  } finally { await panes.close(); if (old === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = old; }
});
