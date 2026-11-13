import { randomInt } from 'node:crypto';
import { emitKeypressEvents, createInterface } from 'node:readline';
import type { ReadStream, WriteStream } from 'node:tty';
import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { ESC, passthrough, type Geometry } from './render.js';
import { TerminalInput, type CellSize, type GraphicsReply } from './terminal-input.js';
import stringWidth from 'string-width';

export interface Capabilities {
  kitty: boolean; placeholders: boolean; frameEditing: boolean; sharedMemory: boolean; tmux: boolean;
  cellWidth: number; cellHeight: number; measured: boolean;
}
export function parseProbeResponse(text: string, id: number) {
  const replies = [...text.matchAll(/\x1b_G([^;]*);([^\x1b]*)\x1b\\/g)];
  const kitty = replies.some(([, controls, result]) => controls!.split(',').includes(`i=${id}`) && result === 'OK');
  const placeholders = replies.some(([, controls, result]) => controls!.split(',').includes(`i=${id + 1}`)
    && controls!.split(',').includes('U=1') && result === 'OK');
  const frameEditing = replies.some(([, controls, result]) => controls!.split(',').includes(`i=${id + 2}`)
    && controls!.split(',').includes('r=1') && result === 'OK');
  const sharedMemory = replies.some(([, controls, result]) => controls!.split(',').includes(`i=${id + 3}`) && result === 'OK');
  const cell = /\x1b\[6;(\d+);(\d+)t/.exec(text);
  const height = Number(cell?.[1]), width = Number(cell?.[2]);
  const measured = width >= 1 && width <= 100 && height >= 1 && height <= 200;
  return { kitty, placeholders, frameEditing, sharedMemory, measured, cellWidth: measured ? width : 8, cellHeight: measured ? height : 16 };
}
export interface ReplyRelay {
  send(reply: GraphicsReply): void; listen(listener: (reply: GraphicsReply) => void): () => void;
  sendCell?(size: CellSize): void; listenCell?(listener: (size: CellSize) => void): () => void;
}
export async function probe(input = process.stdin, output = process.stdout, tmux = !!process.env.TMUX, memoryName?: string, relay?: ReplyRelay): Promise<Capabilities> {
  const id = randomInt(1, 0xffff00);
  const previousRaw = input.isRaw;
  input.setRawMode(true); input.resume();
  let received = '';
  return new Promise(resolve => {
    const parser = new TerminalInput(() => {}, reply => relay?.send(reply), size => relay?.sendCell?.(size));
    const off = relay?.listen(reply => { if (received.length < 16_384) received += `${ESC}_G${reply.controls ?? `i=${reply.id}`};${reply.result}${ESC}\\`; });
    const offCell = relay?.listenCell?.(size => { if (received.length < 16_384) received += `${ESC}[6;${size.height};${size.width}t`; });
    const collect = (chunk: Buffer) => {
      if (received.length < 16_384) received += chunk.toString('utf8');
      if (relay) parser.push(chunk.toString('utf8'));
    };
    input.on('data', collect);
    const pixel = `${ESC}_Ga=q,i=${id},f=24,s=1,v=1;AAAA${ESC}\\`;
    const placeholder = `${ESC}_Ga=q,i=${id + 1},e=T,U=1,f=24,s=1,v=1;AAAA${ESC}\\`;
    const editing = `${ESC}_Ga=q,i=${id + 2},e=f,r=1,X=1,f=24,s=1,v=1;AAAA${ESC}\\`;
    const memory = memoryName ? passthrough(`${ESC}_Ga=q,i=${id + 3},t=s,f=32,s=1,v=1;${Buffer.from(memoryName).toString('base64')}${ESC}\\`, tmux) : '';
    output.write(passthrough(pixel, tmux) + passthrough(placeholder, tmux) + passthrough(editing, tmux) + memory + passthrough(`${ESC}[16t`, tmux));
    setTimeout(() => {
      off?.(); offCell?.(); parser.close(); input.off('data', collect); input.setRawMode(previousRaw ?? false); input.pause();
      resolve({ ...parseProbeResponse(received, id), tmux });
    }, 650);
  });
}
export function geometry(output: Pick<WriteStream, 'columns' | 'rows'>, caps: Capabilities): Geometry {
  return { columns: Math.max(1, output.columns || 80), rows: Math.max(5, output.rows || 24),
    cellWidth: caps.cellWidth, cellHeight: caps.cellHeight };
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function cleanText(text: string, length: number): string {
  let output = '', cells = 0;
  for (const { segment } of graphemes.segment(text.replace(/[\x00-\x1f\x7f-\x9f]/g, ' '))) {
    const width = stringWidth(segment);
    if (cells + width > length) break;
    output += segment; cells += width;
  }
  return output;
}
export async function writeTerminal(output: NodeJS.WritableStream, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Terminal output stalled.')), 5000);
    output.write(text, error => { clearTimeout(timer); error ? reject(error) : resolve(); });
  });
}
export class Terminal {
  onPaste?: (text: string) => void;
  forwardReply?: (reply: GraphicsReply) => void;
  forwardCell?: (size: CellSize) => void;
  private previousRaw = false;
  private handler?: (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string }) => void;
  private pasting = false;
  private keyboard = new PassThrough();
  private decoder = new StringDecoder('utf8');
  private parser = new TerminalInput(text => {
    // TerminalInput has already resolved a bare Escape after its short timeout.
    // Do not let readline wait another 500ms and merge the next ':' into Alt+:.
    if (text === ESC) this.handler?.(text, { name: 'escape', sequence: ESC });
    else this.keyboard.write(text);
  }, reply => this.reply(reply), size => this.forwardCell?.(size), text => this.onPaste?.(text));
  private collect = (chunk: Buffer) => this.parser.push(this.decoder.write(chunk));
  private fence = randomInt(0x1000000, 0xffffffff);
  private pending?: { id: number; imageId: number; resolve(): void; reject(error: Error): void };
  constructor(readonly input: ReadStream = process.stdin, readonly output: WriteStream = process.stdout) {}
  async open(onKey: (key: string) => void, structured = false): Promise<void> {
    this.previousRaw = this.input.isRaw ?? false;
    this.input.setRawMode(true); this.input.resume();
    emitKeypressEvents(this.keyboard);
    this.handler = (text, key) => {
      if (key.name === 'paste-start' || key.sequence === '\x1b[200~') { this.pasting = true; return; }
      if (key.name === 'paste-end' || key.sequence === '\x1b[201~') { this.pasting = false; return; }
      if (key.ctrl && key.name === 'c') { onKey('quit'); return; }
      // Pasted text must never activate a camera (or other global controls).
      if (this.pasting) return;
      if (!structured) { onKey(key.name === 'escape' ? 'quit' : text); return; }
      const names: Record<string, string> = { escape: 'Esc', return: 'Enter', backspace: 'BS', tab: key.shift ? 'S-Tab' : 'Tab',
        up: 'Up', down: 'Down', left: 'Left', right: 'Right', delete: 'Del', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
      onKey(key.ctrl ? `<C-${key.name}>` : key.meta ? `<M-${key.name}>` : names[key.name ?? ''] ? `<${names[key.name! ]}>` : text);
    };
    this.keyboard.on('keypress', this.handler);
    this.input.on('data', this.collect);
    await this.write(`${ESC}[?1049h${ESC}[?25l${ESC}[?7l${ESC}[?2004h${ESC}[2J`);
  }
  write(text: string): Promise<void> { return writeTerminal(this.output, text); }
  private reply(reply: GraphicsReply): void {
    this.forwardReply?.(reply);
    this.receiveReply(reply);
  }
  receiveReply(reply: GraphicsReply): void {
    const pending = this.pending;
    if (!pending) return; // including a late response from another attached tmux client
    if (reply.id === pending.id && reply.result === 'OK') pending.resolve();
    else if (reply.id === pending.id || (reply.id === pending.imageId && reply.result !== 'OK')) {
      const code = /^[A-Z][A-Z0-9_]*/.exec(reply.result)?.[0] ?? 'ERROR';
      pending.reject(new PixelRenderError(`Kitty rejected the video update (${code}). Use t/b, or g to retry.`));
    }
  }
  async writeGraphics(text: string, imageId: number, tmux: boolean, signal?: AbortSignal): Promise<{ writtenAt: number; acknowledgedAt: number; bytes: number }> {
    if (this.pending) throw new Error('A terminal frame is already in flight.');
    if (signal?.aborted) throw new Error('Terminal frame canceled.');
    const id = this.fence = this.fence >= 0xffffffff ? 0x1000000 : this.fence + 1;
    // A unique 1-pixel query is a processing fence AFTER the image update. A
    // plain stdout callback only reaches tmux's queue, not the outer terminal.
    // Unique IDs prevent an old second client's ACK from advancing a new frame.
    const fence = passthrough(`${ESC}_Ga=q,i=${id},f=24,s=1,v=1;AAAA${ESC}\\`, tmux);
    let cleanup = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    let timeout = () => {};
    const acknowledged = new Promise<number>((resolve, reject) => {
      timeout = () => reject(new PixelRenderError('Kitty acknowledgment timed out. Video paused; use t/b, or g to retry.'));
      const cancel = () => { completed = true; reject(new Error('Terminal frame canceled.')); };
      cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending = undefined; };
      this.pending = { id, imageId, resolve: () => { completed = true; resolve(Date.now()); },
        reject: error => { completed = true; reject(error); } };
      signal?.addEventListener('abort', cancel, { once: true });
    });
    void acknowledged.catch(() => {}); // a terminal error can precede write completion
    try {
      await this.write(text + fence);
      const writtenAt = Date.now();
      // Encoding and stdout delivery are not part of the terminal's response
      // deadline. An error is recoverable and must not terminate a live meeting.
      if (!completed) timer = setTimeout(timeout, 3000);
      const acknowledgedAt = await acknowledged;
      return { writtenAt, acknowledgedAt, bytes: Buffer.byteLength(text + fence) };
    } catch (error) {
      if (error instanceof Error && error.message === 'Terminal output stalled.') {
        throw new PixelRenderError('Terminal output stalled. Video paused; use t/b, or g to retry.');
      }
      throw error;
    } finally { cleanup(); }
  }
  async close(cleanup = ''): Promise<void> {
    if (this.handler) this.keyboard.off('keypress', this.handler);
    this.input.off('data', this.collect); this.parser.close(); this.keyboard.destroy();
    this.pending?.reject(new Error('Terminal closed.'));
    this.input.setRawMode(this.previousRaw); this.input.pause();
    await this.write(`${cleanup}${ESC}[0m${ESC}[0 q${ESC}[?2004l${ESC}[?7h${ESC}[?25h${ESC}[?1049l`);
  }
}
export class PixelRenderError extends Error {}
export function askMeeting(): Promise<string> {
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve, reject) => {
    let answered = false;
    reader.question('Webex meeting HTTPS link: ', answer => { answered = true; reader.close(); resolve(answer.trim()); });
    reader.on('close', () => { if (!answered) reject(new Error('Meeting input canceled.')); });
  });
}
export function askSecret(input: ReadStream = process.stdin, output: NodeJS.WritableStream = process.stderr,
  prompt = 'Short-lived Webex developer token (hidden; never saved): ', signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('Token input canceled.'));
  output.write(prompt);
  const previousRaw = input.isRaw ?? false;
  input.setRawMode(true); input.resume();
  return new Promise((resolve, reject) => {
    let secret = '';
    const cleanup = () => { input.off('data', data); input.off('end', ended); signal?.removeEventListener('abort', ended); input.setRawMode(previousRaw); input.pause(); output.write('\n'); };
    const ended = () => { cleanup(); reject(new Error('Token input canceled.')); };
    const data = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8').replace(/\x1b\[20[01]~/g, '')) {
        if (char === '\x03' || char === '\x04' || char === '\x1b') { ended(); return; }
        if (char === '\r' || char === '\n') { cleanup(); secret.trim() ? resolve(secret.trim()) : reject(new Error('Token is empty.')); return; }
        if (char === '\x7f' || char === '\b') secret = secret.slice(0, -1);
        else if (char >= ' ' && char <= '~') secret += char;
        if (secret.length > 8192) { cleanup(); reject(new Error('Token is too long.')); return; }
      }
    };
    input.on('data', data); input.once('end', ended); signal?.addEventListener('abort', ended, { once: true });
  });
}
