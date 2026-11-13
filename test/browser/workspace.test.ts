import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaHost } from '../../src/host.js';
import { ViewerBroker, ViewerHost, serialCapture } from '../../src/viewer.js';
import type { Frame, Source, WorkerEvent } from '../../src/protocol.js';

const enabled = process.env.WBX_BROWSER_TEST === '1';
test('real Chrome: twelve distinct moving mock feeds and read-only viewers share one media worker without devices', {
  skip: !enabled, timeout: 15_000,
}, async () => {
  process.env.WBX_TEMP_DIR ??= '/tmp/opencode';
  const host = await MediaHost.open({ browserPath: process.env.WBX_BROWSER, headless: true });
  const capture = serialCapture((request, signal) => host.capture(request, signal));
  const broker = await ViewerBroker.open(capture);
  const events: WorkerEvent[] = [];
  host.on('event', event => { events.push(event); broker.publish(event); });
  const get = async (source: Source): Promise<Frame> => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await capture({ source, width: 320, height: 180, format: 'rgba' });
      if (result) return result;
      await delay(20);
    }
    throw new Error(`No mock frame: ${source}`);
  };
  try {
    await host.page.evaluate(() => {
      (window as any).deviceRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { (window as any).deviceRequests++; throw new Error('No devices in mock tests.'); };
    });
    host.send({ type: 'start', mode: 'demo', participants: 12 });
    const first = await get('video');
    const frames = await Promise.all(Array.from({ length: 11 }, (_, index) => get(`mock-${index + 2}`)));
    assert.equal(new Set(frames.map(frame => Buffer.from(frame.data).toString('base64'))).size, 11);
    const sources = events.find(event => event.type === 'sources' && event.sources.length === 16);
    assert.ok(sources && sources.type === 'sources');
    assert.equal(sources.sources.filter(source => source.kind === 'mock').length, 12);
    assert.match(sources.sources.find(source => source.id === 'mock-2')!.label, /Sam Rivera/);
    const viewer = await ViewerHost.open(broker.path);
    try {
      const a = await viewer.capture({ source: 'mock-2', width: 320, height: 180, format: 'rgba' });
      await delay(120);
      const b = await get('mock-2'), last = await get('video');
      assert.ok(b.sourceFrame > a!.sourceFrame); assert.notDeepEqual(a!.data, b.data); assert.ok(last.sourceFrame > first.sourceFrame);
      assert.equal(await host.page.evaluate(() => (window as any).deviceRequests), 0);
      assert.equal(await host.capture({ source: 'local', width: 80, height: 45, format: 'rgba' }), null);
    } finally { await viewer.close(); }
  } finally { await broker.close(); await host.close(); }
});

test('real PTY: modal keys, splits, maximize, themes, save, remap and atomic reload recovery', {
  skip: !enabled, timeout: 20_000,
}, async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-ui-test-'), path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ keybindings: { q: null, x: 'quit' } }));
  const child = spawn('script', ['-qefc', `${process.execPath} dist/cli.js demo --standalone --config '${path}' --headless --renderer blocks --duration 14`, '/dev/null'], {
    env: { ...process.env, TERM: 'xterm-256color', TMUX: '', WBX_TEMP_DIR: '/tmp/opencode' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
  const exited = new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  let cursor = 0;
  const expect = async (text: string, keys?: string) => {
    if (keys) child.stdin.write(keys);
    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      const found = output.indexOf(text, cursor);
      if (found >= 0) { cursor = found + text.length; return; }
      await delay(20);
    }
    throw new Error(`Missing UI text ${JSON.stringify(text)}; tail: ${output.slice(-1500)} ${errors}`);
  };
  try {
    await expect('NORMAL · 4 panes');
    await expect('NORMAL · 5 panes', '\x17v');
    await expect('NORMAL · 4 panes', '\x17c');
    await expect('/ MAX', ' m');
    await expect('KEYBINDINGS', '?');
    await expect('NORMAL · 4 panes', '\x1b'); // Esc dismisses help, not the meeting
    await expect('COMMANDS', ':');
    await expect('NORMAL · 3 panes', 'layout speaker\r');
    await expect('Saved layout desk', ':layout.save desk\r');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(saved.layout, 'desk'); assert.ok(saved.layouts.desk); assert.equal(saved.keybindings.q, null);
    await writeFile(path, '{"fps":0}');
    await expect('Invalid config', ' r');
    await writeFile(path, JSON.stringify({ theme: { accent: '#abcdef' }, keybindings: { q: null, x: 'quit', z: ['layout single', 'pane.maximize'] } }));
    await expect('Reloaded', ' r');
    await expect('NORMAL · 1 panes', 'qz'); // q is unbound; z macro works after reload
    child.stdin.write('x');
    assert.equal(await exited, 0, errors + output.slice(-2000));
    assert.ok(output.includes('\x1b[?1049l')); assert.ok(output.includes('"mockParticipants": 4'));
    assert.ok(!output.includes('wbx-proto:'));
  } finally { child.stdin.write('\x03'); await exited; await rm(dir, { recursive: true, force: true }); }
});
