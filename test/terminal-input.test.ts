import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import type { ReadStream, WriteStream } from 'node:tty';
import { TerminalInput, graphicsReply, type GraphicsReply } from '../src/terminal-input.js';
import { Terminal, PixelRenderError } from '../src/terminal.js';

const reply = (id: number, result = 'OK') => `\x1b_Gi=${id};${result}\x1b\\`;
test('fragmented graphics replies are consumed, never interpreted as Escape/q keyboard input', () => {
  const keys: string[] = [], replies: GraphicsReply[] = [];
  const input = new TerminalInput(text => keys.push(text), value => replies.push(value));
  input.push('p\x1b'); input.push('_Gi=123,'); input.push('r=1;O'); input.push('K\x1b'); input.push('\\t');
  assert.deepEqual(keys, ['p', 't']); assert.deepEqual(replies, [{ id: 123, result: 'OK', controls: 'i=123,r=1' }]);
  assert.equal(graphicsReply('\x1b_Gi=4294967296;OK\x1b\\'), undefined);
  input.close();
});
test('the acknowledgment deadline starts after output delivery, not during a slow write', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const input = new PassThrough() as unknown as ReadStream;
  input.setRawMode = () => input;
  let complete: (() => void) | undefined;
  const output = new Writable({ write(chunk, _encoding, callback) {
    if (chunk.toString().startsWith('pixels')) complete = callback;
    else callback();
  } });
  const term = new Terminal(input, output as unknown as WriteStream);
  await term.open(() => {});
  try {
    let settled = false;
    const update = term.writeGraphics('pixels', 42, false).catch(error => { settled = true; throw error; });
    void update.catch(() => {});
    t.mock.timers.tick(4000);
    await Promise.resolve();
    assert.equal(settled, false, 'a slow write must not consume the response deadline');
    complete!();
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(3001);
    await assert.rejects(update, error => error instanceof PixelRenderError);
  } finally { await term.close(); t.mock.timers.reset(); }
});
test('a bare Escape remains a usable key', async () => {
  const keys: string[] = [];
  const input = new TerminalInput(text => keys.push(text), () => {});
  input.push('\x1b');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(keys, ['\x1b']); input.close();
});
test('fragmented window/device reports never execute t/c hotkeys; real arrows still work', () => {
  const keys: string[] = [], cells: { width: number; height: number }[] = [];
  const input = new TerminalInput(text => keys.push(text), () => {}, size => cells.push(size));
  input.push('p\x1b['); input.push('6;18;'); input.push('9t\x1b[?1;2c\x1b[A');
  assert.deepEqual(keys, ['p', '\x1b[A']); assert.deepEqual(cells, [{ width: 9, height: 18 }]);
  input.push('\x1b[6;9999;9999t'); assert.equal(cells.length, 1);
  input.close();
});
test('oversized or unterminated terminal replies stay bounded and are not keyboard commands', () => {
  let keys = '';
  const input = new TerminalInput(text => { keys += text; }, () => {});
  input.push('\x1b_G' + 'q'.repeat(8192)); input.push('p');
  assert.equal(keys, 'p'); input.close();
});

function terminal() {
  const input = new PassThrough() as unknown as ReadStream;
  input.setRawMode = () => input;
  let written = '';
  const output = new Writable({ write(chunk, _encoding, callback) { written += chunk.toString(); callback(); } });
  const term = new Terminal(input, output as unknown as WriteStream);
  return { term, input: input as unknown as PassThrough, get fence() {
    return Number([...written.matchAll(/a=q,i=(\d+),/g)].at(-1)?.[1]);
  } };
}
test('pasted text cannot activate camera or other global controls', async () => {
  const f = terminal(), keys: string[] = [];
  await f.term.open(key => keys.push(key));
  try {
    f.input.write('\x1b[200~camera c q a\n');
    f.input.write('more c\x1b[201~');
    assert.deepEqual(keys, []);
    f.input.write('c'); assert.deepEqual(keys, ['c']);
  } finally { await f.term.close(); }
});
test('fragmented bracketed paste reaches its literal handler without executing Ctrl+C, Enter, commands or terminal reports', async () => {
  const f = terminal(), keys: string[] = [], pasted: string[] = [];
  f.term.onPaste = text => pasted.push(text);
  await f.term.open(key => keys.push(key), true);
  try {
    f.input.write('\x1b[200'); f.input.write('~q\x03\r:quit\x1b[31m'); f.input.write('界\n\x1b[20'); f.input.write('1~i');
    assert.deepEqual(pasted, ['q\x03\r:quit\x1b[31m界\n']); assert.deepEqual(keys, ['i']);
    f.input.write('\x1b[200~' + 'x'.repeat(100_000) + '\x1b[201~'); assert.equal(pasted[1]!.length, 65_536);
  } finally { await f.term.close(); }
});
test('structured Escape resolves promptly and cannot swallow the next command key', async () => {
  const f = terminal(), keys: string[] = [];
  await f.term.open(key => keys.push(key), true);
  try {
    f.input.write('\x1b');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(keys, ['<Esc>']);
    f.input.write(':\x17v\x1b[A');
    assert.deepEqual(keys, ['<Esc>', ':', '<C-w>', 'v', '<Up>']);
  } finally { await f.term.close(); }
});
test('pixel writes wait for the outer terminal, and stale/duplicate client ACKs cannot advance the next frame', async () => {
  const f = terminal(); const keys: string[] = [];
  await f.term.open(key => keys.push(key));
  try {
    let done = false;
    const first = f.term.writeGraphics('pixels', 42, true).then(value => { done = true; return value; });
    const firstId = f.fence;
    await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false);
    await assert.rejects(f.term.writeGraphics('more', 42, true), /in flight/);
    f.input.write('p' + reply(firstId));
    const result = await first;
    assert.ok(result.bytes > 6); assert.ok(result.acknowledgedAt > 0);
    assert.deepEqual(keys, ['p']);
    done = false;
    const second = f.term.writeGraphics('next pixels', 42, true).then(() => { done = true; });
    const secondId = f.fence;
    assert.notEqual(firstId, secondId);
    f.input.write(reply(firstId)); // another attached tmux client replies late
    await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false);
    f.input.write(reply(secondId)); await second;
    assert.deepEqual(keys, ['p']);
  } finally { await f.term.close(); }
});
test('canceling or rejecting a terminal update releases the in-flight slot', async () => {
  const f = terminal(); await f.term.open(() => {});
  try {
    const abort = new AbortController();
    const first = f.term.writeGraphics('pixels', 42, false, abort.signal);
    abort.abort(); await assert.rejects(first, /canceled/);
    const failed = f.term.writeGraphics('pixels', 42, false);
    f.input.write(reply(42, 'ENOSPC: cache is full'));
    await assert.rejects(failed, /ENOSPC/);
    const next = f.term.writeGraphics('pixels', 42, false);
    f.input.write(reply(f.fence)); await next;
  } finally { await f.term.close(); }
});
