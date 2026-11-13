import { randomUUID } from 'node:crypto';
import stringWidth from 'string-width';
import { CHAT_TEXT_LIMIT, emptyChat, type ChatRequest, type ChatResult, type ChatSnapshot } from './chat-protocol.js';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function wrap(text: string, width: number): string[] {
  const lines = ['']; let cells = 0;
  for (const { segment } of graphemes.segment(text.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, ' '))) {
    if (segment === '\n') { lines.push(''); cells = 0; continue; }
    const size = stringWidth(segment);
    if (cells + size > width && cells) { lines.push(''); cells = 0; }
    lines[lines.length - 1] += segment; cells += size;
  }
  return lines;
}
/** Modal compose: text never goes through the global hotkey/action parser. */
export class ChatUI {
  onRequest?: (request: ChatRequest) => void;
  snapshot = emptyChat();
  view: 'rooms' | 'messages' = 'rooms';
  selected = 0;
  scroll = 0;
  draft = '';
  unread = 0;
  notice = '';
  private pending?: { id: string; room: string; text: string };
  private cache?: { snapshot: ChatSnapshot; width: number; lines: string[] };
  open(): void {
    this.unread = 0; this.view = this.snapshot.room ? 'messages' : 'rooms';
    if (this.snapshot.state === 'off' || this.snapshot.state === 'failed' && !this.snapshot.room) this.request('rooms');
  }
  disable(): void { this.request('close'); this.draft = ''; this.pending = undefined; }
  private request(action: 'rooms' | 'close' | 'refresh' | 'select' | 'send', roomId?: string): void {
    const requestId = randomUUID();
    const request: ChatRequest = action === 'rooms' || action === 'close' ? { type: 'chat', action, requestId }
      : action === 'send' ? { type: 'chat', action, roomId: roomId!, text: this.draft, requestId }
        : { type: 'chat', action, roomId: roomId!, requestId };
    if (action === 'send') this.pending = { id: requestId, room: roomId!, text: this.draft };
    this.notice = '';
    try {
      if (!this.onRequest) throw new Error('Messaging unavailable in this read-only view.');
      this.onRequest(request);
    } catch {
      if (action === 'send') this.pending = undefined;
      this.notice = 'Messaging request unavailable. Nothing was retried.';
    }
  }
  update(next: ChatSnapshot, visible: boolean): void {
    const before = this.snapshot;
    if (before.room?.id !== next.room?.id) {
      if (this.draft) this.notice = 'Space changed; unsent draft discarded to avoid sending to the wrong space.';
      this.draft = ''; this.scroll = 0; this.pending = undefined;
      if (next.room) this.view = 'messages';
    } else if (!visible && next.room) {
      const seen = new Set(before.messages.map(message => message.id));
      this.unread = Math.min(999, this.unread + next.messages.filter(message => !seen.has(message.id)).length);
    }
    this.snapshot = next;
    if (visible) this.unread = 0;
    this.selected = Math.min(this.selected, Math.max(0, next.rooms.length - 1));
  }
  result(result: ChatResult): void {
    const pending = this.pending;
    if (!pending || result.requestId !== pending.id || result.roomId !== pending.room) return;
    this.pending = undefined;
    if (result.status === 'sent') {
      if (this.snapshot.room?.id === pending.room && this.draft === pending.text) this.draft = '';
      this.notice = 'Sent to the selected Webex SPACE (not in-meeting chat).';
    } else this.notice = result.status === 'unknown' ? 'Delivery UNKNOWN. Check space history before an explicit retry; no automatic resend.'
      : `Not sent (${result.problem ?? 'failed'}). Draft retained.`;
  }
  key(key: string): void {
    if (key === '<Tab>') { this.view = 'rooms'; this.selected = 0; this.request('rooms'); return; }
    if (key === '<C-r>') { this.request(this.snapshot.room && this.view === 'messages' ? 'refresh' : 'rooms', this.snapshot.room?.id); return; }
    if (this.view === 'rooms') {
      if (key === 'j' || key === '<Down>') this.selected = Math.max(0, Math.min(this.snapshot.rooms.length - 1, this.selected + 1));
      else if (key === 'k' || key === '<Up>') this.selected = Math.max(0, this.selected - 1);
      else if (key === '<Enter>' && this.snapshot.state === 'ready') {
        const room = this.snapshot.rooms[this.selected]; if (room) this.request('select', room.id);
      }
      return;
    }
    if (key === '<Up>') { this.scroll++; return; }
    if (key === '<Down>') { this.scroll = Math.max(0, this.scroll - 1); return; }
    if (key === '<BS>') { this.draft = [...graphemes.segment(this.draft)].slice(0, -1).map(value => value.segment).join(''); return; }
    if (key === '<Enter>') {
      const room = this.snapshot.room;
      if (room && this.snapshot.state === 'ready' && this.draft.trim() && !this.pending && !this.snapshot.sending) this.request('send', room.id);
      return;
    }
    if (key && !/^<[^<>]+>$/.test(key) && !/[\x00-\x1f\x7f-\x9f]/.test(key) && this.draft.length + key.length <= CHAT_TEXT_LIMIT) this.draft += key;
  }
  lines(width: number, height: number): string[] {
    const s = this.snapshot, output = Array.from({ length: height }, () => '');
    output[0] = `${s.mode === 'demo' ? 'MOCK ' : ''}SPACE CHAT · NOT in-meeting chat · ${s.state}${s.sending ? ' · sending' : ''}${s.problem ? ` · ${s.problem}` : ''}`;
    if (height < 2) return output;
    if (this.view === 'rooms') {
      output[1] = 'Choose persistent Webex space: j/k or arrows · Enter open · Ctrl+r refresh';
      const count = Math.max(0, height - 3), start = Math.max(0, this.selected - count + 1);
      for (let i = 0; i < count; i++) {
        const room = s.rooms[start + i]; if (room) output[i + 2] = `${start + i === this.selected ? '>' : ' '} ${room.title} [${room.id.slice(-12)}]`;
      }
      if (height >= 3) output[height - 1] = s.rooms.length ? 'Opening a space does not send. Messages reach SPACE MEMBERS, not necessarily meeting attendees.' : 'No spaces loaded. Ctrl+r retries; token needs messaging read/write scopes.';
      return output;
    }
    output[1] = `TO SPACE: ${s.room?.title ?? '(none)'} · id ${s.room?.id ?? ''}`;
    if (height < 3) return output;
    output[2] = 'Enter SEND to this space · Tab spaces · arrows history · Ctrl+r refresh · Esc video';
    if (!this.cache || this.cache.snapshot !== s || this.cache.width !== width) {
      this.cache = { snapshot: s, width, lines: s.messages.flatMap(item =>
        [...wrap(`${item.created.slice(11, 19)} ${item.author}`, width), ...wrap(item.text, width), '']) };
    }
    const available = Math.max(0, height - 4), history = this.cache.lines;
    this.scroll = Math.min(this.scroll, Math.max(0, history.length - available));
    const start = Math.max(0, history.length - available - this.scroll);
    for (let row = 0; row < available; row++) output[row + 3] = history[start + row] ?? '';
    if (height >= 4) output[height - 1] = `> ${wrap(this.draft, Math.max(1, width - 2)).at(-1) ?? ''}${this.pending ? ' [pending]' : ''}`;
    return output;
  }
}
