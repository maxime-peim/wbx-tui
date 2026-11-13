import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { configPath, defaults, galleryLayout, parseConfig, saveLayout, validAction, validateLayout } from '../src/config.js';
import { Keymap } from '../src/keys.js';
import { Workspace } from '../src/workspace.js';
import { UI } from '../src/ui.js';
import { KittyRenderer, blocks, placeholders } from '../src/render.js';
import { cleanText } from '../src/terminal.js';

test('configuration defaults to ~/.config/wbx-tui/config.json with explicit, environment and XDG precedence', () => {
  const previous = { WBX_CONFIG: process.env.WBX_CONFIG, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  try {
    delete process.env.WBX_CONFIG; delete process.env.XDG_CONFIG_HOME;
    assert.equal(configPath(), join(homedir(), '.config', 'wbx-tui', 'config.json'));
    process.env.XDG_CONFIG_HOME = '/tmp/opencode/test-xdg';
    assert.equal(configPath(), '/tmp/opencode/test-xdg/wbx-tui/config.json');
    process.env.WBX_CONFIG = '/tmp/opencode/override.json';
    assert.equal(configPath(), '/tmp/opencode/override.json');
    assert.equal(configPath('/tmp/opencode/explicit.json'), '/tmp/opencode/explicit.json');
  } finally {
    for (const key of ['WBX_CONFIG', 'XDG_CONFIG_HOME'] as const) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('configuration merges defaults and rejects unknown, unsafe, and unbounded values', () => {
  const config = parseConfig({ theme: { focus: '#abcdef' }, keybindings: { q: null, x: 'quit' }, fps: 24 });
  assert.equal(config.theme.focus, '#abcdef'); assert.equal(config.theme.background, defaults().theme.background);
  assert.equal(config.keybindings.q, null); assert.equal(config.fps, 24);
  for (const input of [{ extra: true }, { version: 2 }, { fps: NaN }, { demoParticipants: 13 }, { width: '80' },
    { theme: { focus: '\x1b[2J' } }, { keybindings: { x: 'exec rm -rf' } }, { keybindings: { x: [] } },
    { layouts: { broken: { source: 'mock-99' } } }, { layout: 'missing' }, { leader: '\n' },
    { layouts: { broken: { direction: 'vertical', ratio: 1, children: [{ source: 'video' }, { source: 'share' }] } } }]) {
    assert.throws(() => parseConfig(input), JSON.stringify(input));
  }
  assert.ok(validAction('source.set mock-12')); assert.ok(validAction('tmux.open mock-2'));
  assert.ok(!validAction('camera.toggle true')); assert.ok(!validAction('source.set arbitrary'));
});

test('key sequences, leaders, macros, unbinding, timeout, and prefix conflicts are deterministic', () => {
  const config = parseConfig({ leader: ',', keybindings: { q: null, x: ['pane.split.vertical', 'focus.previous'], '<leader> x': 'quit' } });
  const map = new Keymap(config);
  assert.deepEqual(map.feed('q'), []);
  assert.deepEqual(map.feed('<C-w>', 100), []); assert.deepEqual(map.feed('v', 200), ['pane.split.vertical']);
  assert.deepEqual(map.feed(',', 300), []); assert.deepEqual(map.feed('x', 400), ['quit']);
  assert.deepEqual(map.feed('x', 500), ['pane.split.vertical', 'focus.previous']);
  map.feed('<C-w>', 600); assert.deepEqual(map.feed('v', 2000), ['video.toggle']); // expired split prefix falls back to a normal, confirmation-gated action
  map.feed('<C-w>', 2100); assert.deepEqual(map.feed('<Esc>', 2200), ['quit']);
  assert.throws(() => new Keymap(parseConfig({ keybindings: { x: 'quit', 'x y': 'pause' } })), /Ambiguous/);
});

test('split layout tiles every cell without overlap even in tiny and odd terminals', () => {
  const w = new Workspace(defaults().layouts.gallery!);
  for (let width = 1; width < 100; width += 7) for (let height = 1; height < 50; height += 5) {
    const cells = new Set<string>();
    for (const pane of w.positions(width, height)) for (let x = pane.x; x < pane.x + pane.width; x++) for (let y = pane.y; y < pane.y + pane.height; y++) {
      const cell = `${x},${y}`; assert.ok(!cells.has(cell)); cells.add(cell);
      assert.ok(x >= 1 && x <= width && y >= 2 && y < height + 2);
    }
    assert.equal(cells.size, width * height);
  }
});

test('default galleries adapt from one to twelve generated participants', () => {
  for (let count = 1; count <= 12; count++) {
    const layout = galleryLayout(count); validateLayout(layout);
    const panes = new Workspace(layout).panes();
    assert.equal(panes.length, count); assert.equal(new Set(panes.map(pane => pane.source)).size, count);
  }
  assert.throws(() => galleryLayout(0));
});

test('focus, split, close, maximize, source changes, resizing and layout round-trip preserve identity', () => {
  const w = new Workspace(defaults().layouts.gallery!);
  const first = w.focus;
  w.direction('right', 120, 40); assert.equal(w.selected().source, 'mock-2');
  w.direction('down', 120, 40); assert.equal(w.selected().source, 'mock-4');
  w.direction('left', 120, 40); assert.equal(w.selected().source, 'mock-3');
  w.cycle(1); assert.equal(w.selected().source, 'mock-4');
  w.resize(.1); assert.ok(JSON.stringify(w.layout()).includes('0.4'));
  w.split('vertical', 'share'); assert.equal(w.panes().length, 5); assert.equal(w.selected().source, 'share');
  w.maximize(); assert.equal(w.positions(100, 30).length, 1);
  w.source('local'); assert.equal(w.selected().source, 'local');
  w.maximize(); w.close(); assert.equal(w.panes().length, 4); assert.equal(w.focus, first);
  const layout = w.layout(); assert.deepEqual(new Workspace(layout).layout(), layout);
  w.only(); w.close(); assert.equal(w.panes().length, 1);
  for (let i = 1; i < 16; i++) w.split('vertical', 'video');
  assert.throws(() => w.split('vertical', 'video'), /16/);
});

test('command mode never runs camera hotkeys while typing; help, completion, macros and reload are modal', () => {
  const effects: string[] = [], ui = new UI(defaults(), action => effects.push(action));
  ui.key(':'); for (const key of 'camera.toggle') ui.key(key);
  assert.deepEqual(effects, []); ui.key('<Esc>'); assert.deepEqual(effects, []);
  ui.key(':'); for (const key of 'theme forest') ui.key(key); ui.key('<Enter>');
  assert.equal(ui.config.theme.background, '#101c18'); assert.deepEqual(effects, []);
  ui.key(':'); for (const key of 'pane.max') ui.key(key); ui.key('<Tab>'); assert.equal(ui.input, 'pane.maximize');
  ui.key('<Enter>'); assert.equal(ui.workspace.maximized, true);
  ui.key('?'); assert.equal(ui.overlay, 'help'); ui.key('<Esc>'); assert.equal(ui.overlay, undefined);
  ui.key('c'); assert.deepEqual(effects, ['camera.toggle']);
  ui.reconfigure(parseConfig({ keybindings: { c: null, x: 'camera.toggle' } }));
  ui.key('c'); assert.equal(effects.length, 1); ui.key('x'); assert.equal(effects.length, 2);
  ui.dispatch('theme constructor'); assert.match(ui.notice, /Themes:/);
  ui.dispatch('quit please'); assert.equal(effects.length, 2);
  ui.key('quit'); assert.equal(effects.at(-1), 'quit');
});

test('explicit layout save is atomic, private, preserves unrelated customization and refuses invalid files', async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-config-test-'), path = join(dir, 'config.json');
  try {
    await writeFile(path, JSON.stringify({ fps: 23, keybindings: { q: null } }));
    await saveLayout(path, 'desk', defaults().layouts.speaker!);
    const saved = parseConfig(JSON.parse(await readFile(path, 'utf8')));
    assert.equal(saved.fps, 23); assert.equal(saved.keybindings.q, null); assert.equal(saved.layout, 'desk');
    assert.deepEqual(saved.layouts.desk, defaults().layouts.speaker); assert.equal((await stat(path)).mode & 0o777, 0o600);
    await writeFile(path, 'not json'); await assert.rejects(saveLayout(path, 'desk', { source: 'video' }));
    assert.equal(await readFile(path, 'utf8'), 'not json');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('independent pane graphics use local coordinates and never erase neighboring content', () => {
  assert.equal(cleanText('人物🙂 title', 5), '人物');
  assert.equal(cleanText('e\u0301x', 1), 'e\u0301');
  assert.ok(placeholders(42, 5, 2, 15, 8).includes('\x1b[8;15H'));
  const frame = { seq: 1, width: 2, height: 2, format: 'rgba' as const, data: new Uint8Array(16), capturedAt: 1, sourceFrame: 1 };
  const output = blocks(frame, { x: 20, y: 10 });
  assert.ok(output.startsWith('\x1b[10;20H')); assert.ok(!output.includes('[K'));
  const renderer = new KittyRenderer(false, 42);
  const draw = renderer.render(frame, { columns: 5, rows: 2, cellWidth: 1, cellHeight: 1 }, '/wbx-pixel-' + 'a'.repeat(32), { x: 15, y: 8 });
  assert.ok(!draw.output.includes('[2J')); assert.ok(draw.output.includes('[8;15H'));
});
