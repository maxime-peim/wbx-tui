import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESC, KittyRenderer, blocks, fit, passthrough, placeholders } from '../src/render.js';
import type { Frame } from '../src/protocol.js';
import { parseProbeResponse, cleanText, writeTerminal, askSecret } from '../src/terminal.js';
import { Writable, PassThrough } from 'node:stream';
import type { ReadStream } from 'node:tty';

test('tmux wrapping doubles every ESC and keeps payload bounded', () => {
  const command = `${ESC}_Gi=42;AAAA${ESC}\\`;
  assert.equal(passthrough(command, false), command);
  assert.equal(passthrough(command, true), `${ESC}Ptmux;${ESC}${ESC}_Gi=42;AAAA${ESC}${ESC}\\${ESC}\\`);
});
test('pixel renderer chunks payloads, uses placeholders, and only deletes its image', () => {
  const renderer = new KittyRenderer(true, 42);
  const frame: Frame = { seq: 1, sourceFrame: 1, width: 1280, height: 720, format: 'png', capturedAt: 0, data: new Uint8Array(10_000) };
  const size = { columns: 160, rows: 50, cellWidth: 8, cellHeight: 16 };
  const output = renderer.render(frame, size).output;
  assert.match(output, /a=t,f=100,i=42,N=1,q=1,m=1/);
  assert.match(output, /m=0/);
  assert.match(output, /U=1,i=42,p=1,c=160,r=45/);
  assert.ok(output.includes('\u{10eeee}'));
  const update = renderer.render(frame, size).output;
  assert.ok(!update.includes('\u{10eeee}')); // unchanged placement
  assert.match(update, /a=f,f=100,i=42,r=1,X=1,N=1,q=1,m=1/);
  assert.ok(!update.includes('a=t,') && !update.includes('a=p,') && !update.includes('\x1b[2J'));
  assert.equal((update.match(/a=f,/g) ?? []).length, 4); // every continuation chunk must be marked a=f
  assert.match(output, /C=1,q=1/); // graphics must not move tmux's physical cursor
  const deleted = renderer.clear();
  assert.match(deleted, /a=d,d=I,i=42/);
  assert.ok(!deleted.includes('d=A'));
  assert.ok(renderer.render(frame, size).output.includes('\u{10eeee}'));
});
test('placeholder rows follow the published diacritic order', () => {
  const text = placeholders(42, 2, 2);
  assert.ok(text.includes('\u{10eeee}\u0305\u0305\u0305\u{10eeee}'));
  assert.ok(text.includes('\u{10eeee}\u030d\u0305\u0305\u{10eeee}'));
  assert.throws(() => placeholders(0, 1, 1));
  assert.throws(() => placeholders(1, 1, 500));
});
test('blocks use separate top and bottom pixel colors without ANSI from the source', () => {
  const frame: Frame = { seq: 1, sourceFrame: 1, width: 1, height: 2, format: 'rgba', capturedAt: 0,
    data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]) };
  const output = blocks(frame);
  assert.match(output, /38;2;255;0;0m/); assert.match(output, /48;2;0;0;255m▀/);
  assert.throws(() => blocks({ ...frame, data: new Uint8Array(0) }));
});

type Pixel = readonly [number, number, number, number];
type Origin = { x: number; y: number };
function blockFrame(width: number, height: number, pixel: (x: number, y: number) => Pixel): Frame {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { seq: 1, sourceFrame: 1, width, height, format: 'rgba', capturedAt: 0, data };
}
// Reference formatting before color caching; compare interpreted cells, not just escape counts.
function uncachedBlocks(frame: Frame, origin?: Origin): string {
  const { width, height, data } = frame;
  let output = '';
  for (let y = 0; y < height; y += 2) {
    output += `${ESC}[${y / 2 + (origin?.y ?? 2)};${origin?.x ?? 1}H`;
    for (let x = 0; x < width; x++) {
      const top = (y * width + x) * 4, bottom = (Math.min(y + 1, height - 1) * width + x) * 4;
      output += `${ESC}[38;2;${data[top]};${data[top + 1]};${data[top + 2]}m`
        + `${ESC}[48;2;${data[bottom]};${data[bottom + 1]};${data[bottom + 2]}m▀`;
    }
    output += `${ESC}[0m${origin ? '' : `${ESC}[K`}`;
  }
  return output;
}
function blockScreen(output: string) {
  let x = 1, y = 1, foreground: string | null = 'inherited-fg', background: string | null = 'inherited-bg', resets = 0;
  const cells: { x: number; y: number; glyph: string; foreground: string | null; background: string | null }[] = [];
  const moves: Origin[] = [], erases: { x: number; y: number; foreground: string | null; background: string | null }[] = [];
  const csi = /\x1b\[([0-9;]*)([HmK])/y;
  for (let offset = 0; offset < output.length;) {
    if (output[offset] !== ESC) {
      assert.equal(output[offset], '▀', 'only one-column half-block glyphs are drawn');
      cells.push({ x, y, glyph: output[offset]!, foreground, background }); x++; offset++; continue;
    }
    csi.lastIndex = offset;
    const match = csi.exec(output);
    assert.ok(match, `unsupported control at offset ${offset}`); offset = csi.lastIndex;
    const values = match[1]!.split(';').map(Number);
    if (match[2] === 'H') {
      assert.equal(values.length, 2); [y, x] = values as [number, number]; moves.push({ x, y });
    } else if (match[2] === 'K') {
      assert.equal(match[1], ''); erases.push({ x, y, foreground, background });
    } else if (match[1] === '0') {
      foreground = background = null; resets++;
    } else {
      assert.equal(values.length, 5); assert.equal(values[1], 2);
      assert.ok(values.slice(2).every(value => value >= 0 && value <= 255));
      const color = values.slice(2).join(';');
      if (values[0] === 38) foreground = color;
      else { assert.equal(values[0], 48); background = color; }
    }
  }
  return { cells, moves, erases, resets, cursor: { x, y }, foreground, background };
}
function expectedBlockCells(frame: Frame, origin?: Origin) {
  const cells = [];
  for (let y = 0; y < frame.height; y += 2) for (let x = 0; x < frame.width; x++) {
    const top = (y * frame.width + x) * 4, bottom = (Math.min(y + 1, frame.height - 1) * frame.width + x) * 4;
    cells.push({ x: x + (origin?.x ?? 1), y: y / 2 + (origin?.y ?? 2), glyph: '▀',
      foreground: frame.data.subarray(top, top + 3).join(';'), background: frame.data.subarray(bottom, bottom + 3).join(';') });
  }
  return cells;
}
function noiseFrame(width: number, height: number): Frame {
  let seed = 123;
  return blockFrame(width, height, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return [(seed >>> 16) & 255, (seed >>> 8) & 255, seed & 255, seed >>> 24];
  });
}

test('blocks color caching preserves ANSI cell state, odd heights, cursor moves and row cleanup', () => {
  const frames = [
    blockFrame(1, 1, () => [0, 0, 0, 0]), blockFrame(1, 3, () => [255, 255, 255, 255]),
    blockFrame(11, 5, (x, y) => y % 2 ? [0, Math.floor(x / 3) * 64, 255, 128] : [Math.floor(x / 5) * 127, 32, 0, 255]),
    blockFrame(64, 9, (x, y) => [Math.floor(x / 4) % 2 ? 255 : 0, y * 17, 255, (x + y) % 2 ? 0 : 255]),
    noiseFrame(17, 7), noiseFrame(32, 10),
  ];
  for (const frame of frames) for (const origin of [undefined, { x: 7, y: 11 }, { x: 1, y: 1 }]) {
    const screen = blockScreen(blocks(frame, origin)), rows = Math.ceil(frame.height / 2);
    assert.deepEqual(screen, blockScreen(uncachedBlocks(frame, origin)));
    assert.deepEqual(screen.cells, expectedBlockCells(frame, origin));
    assert.equal(screen.cells.length, frame.width * rows);
    assert.equal(screen.resets, rows); assert.equal(screen.foreground, null); assert.equal(screen.background, null);
    assert.deepEqual(screen.moves, Array.from({ length: rows }, (_, y) => ({ x: origin?.x ?? 1, y: y + (origin?.y ?? 2) })));
    assert.deepEqual(screen.erases, origin ? [] : Array.from({ length: rows }, (_, y) => ({ x: frame.width + 1, y: y + 2, foreground: null, background: null })));
    assert.deepEqual(screen.cursor, { x: (origin?.x ?? 1) + frame.width, y: (origin?.y ?? 2) + rows - 1 });
  }
});

test('blocks reset row and call color state without clearing another pane', () => {
  const frame = blockFrame(5, 5, () => [0, 0, 0, 255]), left = { x: 3, y: 4 }, right = { x: 80, y: 12 };
  const first = blocks(frame, left), second = blocks(frame, right), screen = blockScreen(first + second);
  assert.deepEqual(screen, blockScreen(uncachedBlocks(frame, left) + uncachedBlocks(frame, right)));
  assert.deepEqual(screen.cells, [...expectedBlockCells(frame, left), ...expectedBlockCells(frame, right)]);
  assert.deepEqual(screen.erases, []);
  assert.equal((first.match(/\x1b\[(?:38|48);2;/g) ?? []).length, 6, 'both colors must be set again after each row reset');
  assert.equal((second.match(/\x1b\[(?:38|48);2;/g) ?? []).length, 6, 'a separate pane cannot inherit cached colors');
});

test('blocks deterministically reduce flat and chart bytes without inflating noisy output', () => {
  const palette: Pixel[] = [[216, 82, 89, 255], [237, 184, 83, 255], [100, 188, 128, 255],
    [68, 183, 209, 255], [99, 139, 221, 255], [184, 123, 216, 255]];
  const flat = blockFrame(160, 90, () => [18, 52, 86, 255]);
  const chart = blockFrame(160, 90, x => palette[Math.floor(x * palette.length / 160)]!);
  for (const [frame, runs] of [[flat, 1], [chart, 6]] as const) {
    const output = blocks(frame), reference = uncachedBlocks(frame), rows = Math.ceil(frame.height / 2);
    assert.ok(Buffer.byteLength(output) < Buffer.byteLength(reference) * 0.15, 'flat/chart output saves at least 85% of bytes');
    assert.equal((output.match(/\x1b\[(?:38|48);2;/g) ?? []).length, 2 * rows * runs);
    assert.equal((output.match(/▀/g) ?? []).length, frame.width * rows);
  }
  const noise = noiseFrame(160, 90);
  assert.equal(blocks(noise), uncachedBlocks(noise), 'fully changing adjacent colors need exactly the original sequences');
});

test('aspect ratio and no-upscaling are preserved', () => {
  assert.deepEqual(fit(1280, 720, 640, 480), [640, 360]);
  assert.deepEqual(fit(320, 180, 1280, 720), [320, 180]);
});
test('capability probes require matching IDs and valid cell sizes', () => {
  const response = `${ESC}_Gi=42;OK${ESC}\\${ESC}_Gi=43,e=T,U=1;OK${ESC}\\${ESC}_Gi=44,e=f,r=1,X=1;OK${ESC}\\${ESC}[6;20;10t`;
  assert.deepEqual(parseProbeResponse(response, 42), { kitty: true, placeholders: true, frameEditing: true, sharedMemory: false, measured: true, cellWidth: 10, cellHeight: 20 });
  assert.equal(parseProbeResponse(response, 99).kitty, false);
  assert.equal(parseProbeResponse(response + `${ESC}_Gi=45;EBADF${ESC}\\`, 42).sharedMemory, false);
  assert.equal(parseProbeResponse(response + `${ESC}_Gi=45;OK${ESC}\\`, 42).sharedMemory, true);
  assert.equal(parseProbeResponse(`${ESC}[6;0;0t`, 42).measured, false);
});
test('shared-memory pixel rendering emits only a protected object name, not pixel bytes', () => {
  const renderer = new KittyRenderer(true, 42);
  const name = '/wbx-pixel-' + 'a'.repeat(32);
  const frame: Frame = { seq: 1, sourceFrame: 1, width: 1280, height: 720, format: 'rgba', capturedAt: 0,
    data: new Uint8Array(1280 * 720 * 4) };
  const size = { columns: 160, rows: 50, cellWidth: 8, cellHeight: 16 };
  const first = renderer.render(frame, size, name).output;
  const update = renderer.render(frame, size, name).output;
  assert.match(first, /a=t,f=32,t=s,s=1280,v=720,i=42/);
  assert.match(update, /a=f,f=32,t=s,s=1280,v=720,i=42,r=1,X=1/);
  assert.ok(update.includes(Buffer.from(name).toString('base64')));
  assert.ok(update.length < 300, 'frame size must not inflate the terminal stream');
  assert.throws(() => renderer.render(frame, size, '/unrelated-file'));
});
test('terminal labels strip control sequences and writes honor completion', async () => {
  assert.equal(cleanText('safe\x1b\nname', 4), 'safe');
  let output = '';
  const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk; setImmediate(callback); } });
  await writeTerminal(stream, 'done'); assert.equal(output, 'done');
});
test('token input is hidden, bounded, and restores terminal mode on cancel', async () => {
  const input = new PassThrough() as unknown as ReadStream;
  let raw = false;
  input.setRawMode = value => { raw = value; return input; };
  let output = '';
  const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk; callback(); } });
  const secret = askSecret(input, stream);
  (input as unknown as PassThrough).write('sensitive-token\r');
  assert.equal(await secret, 'sensitive-token'); assert.ok(!output.includes('sensitive-token')); assert.equal(raw, false);
  const canceled = askSecret(input, stream);
  (input as unknown as PassThrough).write('\x03');
  await assert.rejects(canceled, /canceled/); assert.equal(raw, false);
});
