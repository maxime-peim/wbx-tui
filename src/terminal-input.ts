/** Keep Kitty's APC replies out of the keyboard parser, even across read chunks. */
export interface GraphicsReply { id: number; result: string; controls?: string }
export interface CellSize { width: number; height: number }
export function graphicsReply(sequence: string): GraphicsReply | undefined {
  const match = /^\x1b_G([^;]*);([^\x1b]*)\x1b\\$/.exec(sequence);
  const id = match?.[1]?.split(',').find(field => /^i=\d+$/.test(field));
  if (!id || !match) return;
  const number = Number(id.slice(2));
  if (!Number.isInteger(number) || number < 1 || number > 0xffffffff) return;
  return { id: number, result: match[2]!.slice(0, 256), ...(match[1] !== `i=${number}` ? { controls: match[1] } : {}) };
}
export class TerminalInput {
  private buffer = '';
  private timer?: ReturnType<typeof setTimeout>;
  private pasting = false;
  private paste = '';
  constructor(private text: (text: string) => void, private reply: (reply: GraphicsReply) => void,
    private cell: (size: CellSize) => void = () => {}, private onPaste: (text: string) => void = () => {}) {}
  push(chunk: string): void {
    clearTimeout(this.timer);
    this.buffer += chunk;
    while (this.buffer) {
      if (this.pasting) {
        const end = this.buffer.indexOf('\x1b[201~');
        if (end < 0) {
          // Retain only a possible fragmented end marker; bound pasted data.
          const take = Math.max(0, this.buffer.length - 5);
          this.paste += this.buffer.slice(0, take).slice(0, Math.max(0, 65_536 - this.paste.length));
          this.buffer = this.buffer.slice(take); return;
        }
        this.paste += this.buffer.slice(0, end).slice(0, Math.max(0, 65_536 - this.paste.length));
        this.buffer = this.buffer.slice(end + 6); this.pasting = false;
        const pasted = this.paste; this.paste = ''; this.onPaste(pasted); continue;
      }
      if (this.buffer.startsWith('\x1b[200~')) {
        this.buffer = this.buffer.slice(6); this.pasting = true; continue;
      }
      if (this.buffer.startsWith('\x1b[')) {
        const sequence = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(this.buffer)?.[0];
        if (!sequence) { if (this.buffer.length > 4096) this.buffer = ''; break; }
        this.buffer = this.buffer.slice(sequence.length);
        const size = /^\x1b\[6;(\d+);(\d+)t$/.exec(sequence);
        if (size) {
          const height = Number(size[1]), width = Number(size[2]);
          if (width >= 1 && width <= 100 && height >= 1 && height <= 200) this.cell({ width, height });
        } else if (/^\x1b\[[\d;]*[ABCDHFZPQRS~]$/.test(sequence)) this.text(sequence);
        // Device/window reports (e.g. CSI ... t or ... c) are not hotkeys.
        continue;
      }
      if (this.buffer.startsWith('\x1b_G')) {
        const end = this.buffer.indexOf('\x1b\\', 3);
        if (end < 0) {
          if (this.buffer.length > 4096) this.buffer = ''; // bounded malformed control reply
          break;
        }
        const parsed = graphicsReply(this.buffer.slice(0, end + 2));
        if (parsed) this.reply(parsed);
        this.buffer = this.buffer.slice(end + 2);
        continue;
      }
      const starts = [this.buffer.indexOf('\x1b_G'), this.buffer.indexOf('\x1b[')].filter(index => index >= 0);
      const start = starts.length ? Math.min(...starts) : -1;
      if (start >= 0) {
        this.text(this.buffer.slice(0, start)); this.buffer = this.buffer.slice(start);
        continue;
      }
      const suffix = ['\x1b_G', '\x1b_', '\x1b'].find(prefix => this.buffer.endsWith(prefix)) ?? '';
      const text = this.buffer.slice(0, this.buffer.length - suffix.length);
      if (text) this.text(text);
      this.buffer = suffix;
      break;
    }
    if (this.buffer) {
      this.timer = setTimeout(() => {
        // A bare Escape is a key; an incomplete graphics reply is never keys.
        if (this.buffer === '\x1b') this.text(this.buffer);
        this.buffer = '';
      }, this.buffer === '\x1b' ? 30 : 500);
    }
  }
  close(): void { clearTimeout(this.timer); this.buffer = ''; this.paste = ''; this.pasting = false; }
}
