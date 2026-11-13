import { randomInt } from 'node:crypto';
import type { Frame } from './protocol.js';

export const ESC = '\x1b';
export function passthrough(sequence: string, tmux: boolean): string {
  return tmux ? `${ESC}Ptmux;${sequence.replaceAll(ESC, ESC + ESC)}${ESC}\\` : sequence;
}
// Protocol-defined row diacritics, in order (not arbitrary combining marks).
// https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders
const marks = `0305 030D 030E 0310 0312 033D 033E 033F 0346 034A 034B 034C 0350 0351 0352 0357 035B
0363 0364 0365 0366 0367 0368 0369 036A 036B 036C 036D 036E 036F 0483 0484 0485 0486 0487
0592 0593 0594 0595 0597 0598 0599 059C 059D 059E 059F 05A0 05A1 05A8 05A9 05AB 05AC 05AF 05C4
0610 0611 0612 0613 0614 0615 0616 0617 0657 0658 0659 065A 065B 065D 065E 06D6 06D7 06D8
06D9 06DA 06DB 06DC 06DF 06E0 06E1 06E2 06E4 06E7 06E8 06EB 06EC 0730 0732 0733 0735 0736
073A 073D 073F 0740 0741 0743 0745 0747 0749 074A 07EB 07EC 07ED 07EE 07EF 07F0 07F1 07F3
0816 0817 0818 0819 081B 081C 081D 081E 081F 0820 0821 0822 0823 0825 0826 0827 0829 082A 082B
082C 082D 0951 0953 0954`.split(/\s+/).map(n => String.fromCodePoint(parseInt(n, 16)));
export const MAX_GRAPHIC_ROWS = marks.length;
export interface Geometry { columns: number; rows: number; cellWidth: number; cellHeight: number }
export interface KittyDraw { output: string; id: number; redraw: boolean }

export function fit(width: number, height: number, maxWidth: number, maxHeight: number): [number, number] {
  const ratio = Math.min(1, maxWidth / width, maxHeight / height);
  return [Math.max(1, Math.floor(width * ratio)), Math.max(1, Math.floor(height * ratio))];
}
export function placeholders(id: number, columns: number, rows: number, x = 1, y = 2): string {
  if (!Number.isInteger(id) || id < 1 || id > 0xffffff || columns < 1 || rows < 1 || rows > marks.length) {
    throw new Error('Invalid image placement.');
  }
  const color = `${ESC}[38;2;${id >>> 16};${(id >>> 8) & 255};${id & 255}m`;
  return Array.from({ length: rows }, (_, row) =>
    `${ESC}[${row + y};${x}H${color}\u{10eeee}${marks[row]}${marks[0]}${marks[0]}${'\u{10eeee}'.repeat(columns - 1)}`
  ).join('') + `${ESC}[0m`;
}
export class KittyRenderer {
  readonly id: number;
  private placement = '';
  private imageSize = '';
  constructor(readonly tmux: boolean, id = randomInt(1, 0x1000000)) { this.id = id; }
  clear(): string {
    this.placement = '';
    this.imageSize = '';
    // Never delete another pane/application's images.
    return passthrough(`${ESC}_Ga=d,d=I,i=${this.id},q=2${ESC}\\`, this.tmux);
  }
  render(frame: Frame, geometry: Geometry, sharedMemory?: string, origin?: { x: number; y: number }): KittyDraw {
    if (sharedMemory && !/^\/wbx-pixel-[0-9a-f]{32}$/.test(sharedMemory)) throw new Error('Invalid shared frame name.');
    if (frame.format !== 'png' && !sharedMemory) throw new Error('Inline Kitty renderer requires PNG.');
    const columns = Math.max(1, Math.min(geometry.columns, Math.ceil(frame.width / geometry.cellWidth)));
    const rows = Math.max(1, Math.min(geometry.rows - (origin ? 0 : 3), marks.length, Math.ceil(frame.height / geometry.cellHeight)));
    const imageSize = `${frame.width}x${frame.height}`;
    const fresh = this.imageSize !== imageSize;
    let output = '';
    if (fresh && this.imageSize) output += this.clear();
    this.imageSize = imageSize;
    if (sharedMemory) {
      const controls = `a=${fresh ? 't' : 'f'},f=${frame.format === 'rgba' ? 32 : 100},t=s,s=${frame.width},v=${frame.height},i=${this.id},${fresh ? '' : 'r=1,X=1,'}N=1,q=1`;
      output += passthrough(`${ESC}_G${controls};${Buffer.from(sharedMemory).toString('base64')}${ESC}\\`, this.tmux);
    } else {
      const base64 = Buffer.from(frame.data).toString('base64');
      for (let offset = 0; offset < base64.length; offset += 4096) {
        const first = offset === 0;
        const more = offset + 4096 < base64.length ? 1 : 0;
        // a=t replaces an image AND destroys its placements. Use it only once.
        // a=f,r=1 edits the existing root frame; X=1 avoids alpha accumulation.
        // Animation chunks must repeat a=f, unlike ordinary image chunks.
        const controls = first
          ? `a=${fresh ? 't' : 'f'},f=100,i=${this.id},${fresh ? '' : 'r=1,X=1,'}N=1,q=1,`
          : `${fresh ? '' : 'a=f,'}q=1,`;
        output += passthrough(`${ESC}_G${controls}m=${more};${base64.slice(offset, offset + 4096)}${ESC}\\`, this.tmux);
      }
    }
    const placement = `${columns}x${rows}@${origin?.x ?? 1},${origin?.y ?? 2}`;
    const redraw = placement !== this.placement;
    if (redraw) {
      output += passthrough(`${ESC}_Ga=p,U=1,i=${this.id},p=1,c=${columns},r=${rows},C=1,q=1${ESC}\\`, this.tmux);
      output += (origin ? '' : `${ESC}[2J`) + placeholders(this.id, columns, rows, origin?.x, origin?.y);
      this.placement = placement;
    }
    return { output, id: this.id, redraw };
  }
}
export function blocks(frame: Frame, origin?: { x: number; y: number }): string {
  if (frame.format !== 'rgba' || frame.data.length !== frame.width * frame.height * 4) throw new Error('Blocks require RGBA.');
  const { width, height, data } = frame;
  let output = '';
  for (let y = 0; y < height; y += 2) {
    output += `${ESC}[${y / 2 + (origin?.y ?? 2)};${origin?.x ?? 1}H`;
    // Each row ends with an SGR reset; never inherit colors across rows or panes.
    let foreground = -1, background = -1;
    for (let x = 0; x < width; x++) {
      const top = (y * width + x) * 4;
      const bottom = (Math.min(y + 1, height - 1) * width + x) * 4;
      const topColor = (data[top]! << 16) | (data[top + 1]! << 8) | data[top + 2]!;
      const bottomColor = (data[bottom]! << 16) | (data[bottom + 1]! << 8) | data[bottom + 2]!;
      if (topColor !== foreground) {
        output += `${ESC}[38;2;${data[top]};${data[top + 1]};${data[top + 2]}m`; foreground = topColor;
      }
      if (bottomColor !== background) {
        output += `${ESC}[48;2;${data[bottom]};${data[bottom + 1]};${data[bottom + 2]}m`; background = bottomColor;
      }
      output += '▀';
    }
    output += `${ESC}[0m${origin ? '' : `${ESC}[K`}`;
  }
  return output;
}
