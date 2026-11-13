import { randomUUID } from 'node:crypto';
import stringWidth from 'string-width';
import { Keymap } from './keys.js';
import { cleanText } from './terminal.js';
import { themes, type Config, type Theme } from './config.js';
import { MESSAGE_ACTIONS, validMessageAction, type MessageLayout, type Panel } from './messaging-config.js';
import { messageText } from './messaging-api.js';
import type { Delivery, MessagingStore } from './messaging-store.js';
import type { ExtensionHost } from './extensions.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const segments = (text: string) => [...segmenter.segment(text)].map(value => value.segment);
export function wrapMessage(text: string, width: number): string[] {
  const lines = ['']; let cells = 0;
  for (const { segment: part } of segmenter.segment(messageText(text, 10_100))) {
    if (part === '\n') { lines.push(''); cells = 0; continue; }
    const size = stringWidth(part);
    if (cells + size > width && cells) { lines.push(''); cells = 0; }
    lines[lines.length - 1] += part; cells += size;
  }
  return lines;
}
/** In-memory destination-bound, grapheme-aware multiline editor. No executable text. */
export class MessageDraft {
  text = '';
  cursor = 0; // grapheme index, never a UTF-16 half-surrogate
  revision = 0;
  clear(): void { this.text = ''; this.cursor = 0; this.revision++; }
  insert(text: string): void {
    text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\t/g, '  ')
      .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '');
    const parts = segments(this.text), accepted: string[] = []; let remaining = 1000 - this.text.length;
    for (const part of segments(text)) { if (part.length > remaining) break; accepted.push(part); remaining -= part.length; }
    const prefix = parts.slice(0, this.cursor).join('') + accepted.join('');
    parts.splice(this.cursor, 0, ...accepted); this.text = parts.join('');
    this.cursor = Math.min(segments(this.text).length, segments(prefix).length);
    if (accepted.length) this.revision++;
  }
  edit(action: string): void {
    const parts = segments(this.text), lineStart = this.cursor ? parts.lastIndexOf('\n', this.cursor - 1) + 1 : 0;
    const end = parts.indexOf('\n', this.cursor), lineEnd = end < 0 ? parts.length : end;
    if (action === 'left') this.cursor = Math.max(0, this.cursor - 1);
    else if (action === 'right') this.cursor = Math.min(parts.length, this.cursor + 1);
    else if (action === 'home') this.cursor = lineStart;
    else if (action === 'end') this.cursor = lineEnd;
    else if (action === 'up' && lineStart) {
      const before = lineStart > 1 ? parts.lastIndexOf('\n', lineStart - 2) + 1 : 0;
      this.cursor = before + Math.min(this.cursor - lineStart, lineStart - before - 1);
    } else if (action === 'down' && lineEnd < parts.length) {
      const after = parts.indexOf('\n', lineEnd + 1);
      this.cursor = lineEnd + 1 + Math.min(this.cursor - lineStart, (after < 0 ? parts.length : after) - lineEnd - 1);
    } else if (action === 'newline') this.insert('\n');
    else if (action === 'backspace' && this.cursor) { parts.splice(--this.cursor, 1); this.text = parts.join(''); this.revision++; }
    else if (action === 'delete' && this.cursor < parts.length) { parts.splice(this.cursor, 1); this.text = parts.join(''); this.revision++; }
  }
}
export interface MessageRect { panel: Panel; x: number; y: number; width: number; height: number }
export function messageGeometry(layout: MessageLayout, width: number, height: number, x = 0, y = 1): MessageRect[] {
  if ('panel' in layout) return [{ panel: layout.panel, x, y, width, height }];
  const vertical = layout.direction === 'vertical', size = vertical ? width : height;
  const first = Math.max(1, Math.min(size - 1, Math.floor(size * layout.ratio)));
  return [...messageGeometry(layout.children[0], vertical ? first : width, vertical ? height : first, x, y),
    ...messageGeometry(layout.children[1], vertical ? width - first : width, vertical ? height : height - first,
      vertical ? x + first : x, vertical ? y : y + first)];
}
type Role = keyof Theme;
interface BufferLine { text: string; role?: Role; number?: number; selected?: boolean; cursor?: number }
class Canvas {
  private cells: { text: string; role: Role; background: Role; bold: boolean }[][];
  private cursor?: { x: number; y: number; insert: boolean };
  constructor(readonly width: number, readonly height: number) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ text: ' ', role: 'foreground', background: 'background', bold: false })));
  }
  put(x: number, y: number, text: string, role: Role = 'foreground', max = this.width - x, background: Role = 'background', bold = false): void {
    if (y < 0 || y >= this.height) return;
    for (const part of segments(cleanText(text, Math.max(0, max)))) {
      const size = stringWidth(part); if (!size) continue;
      if (x < 0 || x + size > this.width) break;
      this.cells[y]![x] = { text: part, role, background, bold };
      for (let offset = 1; offset < size; offset++) this.cells[y]![x + offset] = { text: '', role, background, bold };
      x += size;
    }
  }
  caret(x: number, y: number, insert: boolean): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.cursor = { x, y, insert };
  }
  plain(): string[] { return this.cells.map(row => row.map(cell => cell.text).join('')); }
  ansi(theme: Theme): string {
    const color = (value: string, background = false) => `\x1b[${background ? 48 : 38};2;${value.slice(1).match(/../g)!.map(part => parseInt(part, 16)).join(';')}m`;
    return color(theme.background, true) + this.cells.map((row, index) => {
      let style = '', line = `\x1b[${index + 1};1H`;
      for (const cell of row) {
        const next = `${cell.role}:${cell.background}:${cell.bold}`;
        if (next !== style) { line += color(theme[cell.role]) + color(theme[cell.background], true) + `\x1b[${cell.bold ? 1 : 22}m`; style = next; }
        line += cell.text;
      }
      return line;
    }).join('') + '\x1b[0m' + (this.cursor ? `\x1b[${this.cursor.insert ? 6 : 2} q\x1b[${this.cursor.y + 1};${this.cursor.x + 1}H\x1b[?25h` : '\x1b[?25l');
  }
}
export class MessagingUI {
  extensions?: ExtensionHost;
  mode: 'normal' | 'insert' | 'command' | 'search' = 'normal';
  focus: Panel = 'rooms';
  selectedRoom = 0;
  selectedMessage = -1;
  notice = '';
  auth = '';
  help = false;
  helpScroll = 0;
  maximized = false;
  command = '';
  query = '';
  roomFilter = '';
  layout: MessageLayout;
  layoutName: string;
  onExternal = (_action: string) => {};
  private normal!: Keymap;
  private insert!: Keymap;
  private columns = 80;
  private rows = 24;
  private drafts = new Map<string, MessageDraft>();
  private pending?: { requestId: string; roomId: string; draft: MessageDraft; text: string; revision: number };
  private history: string[] = [];
  private historyIndex = 0;
  private completions: string[] = [];
  private completionIndex = 0;
  private messageScroll = 0;
  private cachedHistory?: { messages: MessagingStore['messages']; width: number; lines: { text: string; index: number; header?: boolean }[] };
  constructor(readonly store: MessagingStore, public config: Config) {
    this.layoutName = config.messaging.layout;
    this.layout = structuredClone(config.messaging.layouts[this.layoutName]!);
    this.configure(config);
    store.onDelivery = result => this.delivered(result);
  }
  configure(config: Config): void {
    this.normal = new Keymap({ leader: config.leader, keybindings: config.messaging.keybindings.normal });
    this.insert = new Keymap({ leader: config.leader, keybindings: config.messaging.keybindings.insert });
    this.config = config;
  }
  get draft(): MessageDraft | undefined {
    const id = this.store.room?.id; if (!id) return;
    if (!this.drafts.has(id)) {
      if (this.drafts.size >= 100) {
        const empty = [...this.drafts].find(([, draft]) => !draft.text); if (empty) this.drafts.delete(empty[0]);
        else { this.notice = '100 in-memory drafts reached. Clear a draft before composing in another space.'; return; }
      }
      this.drafts.set(id, new MessageDraft());
    }
    return this.drafts.get(id);
  }
  get dirty(): boolean { return !!this.pending || [...this.drafts.values()].some(draft => !!draft.text); }
  get visibleRooms() { return this.store.rooms.filter(room => room.title.toLocaleLowerCase().includes(this.roomFilter.toLocaleLowerCase())); }
  private delivered(result: Delivery): void {
    const pending = this.pending;
    if (!pending || result.requestId !== pending.requestId || result.roomId !== pending.roomId) return;
    this.pending = undefined;
    if (result.status === 'sent' && pending.draft.text === pending.text && pending.draft.revision === pending.revision) pending.draft.clear();
    this.notice = result.message;
    if (result.status === 'sent' && this.store.room?.id === result.roomId) this.selectedMessage = -1;
  }
  paste(text: string): void {
    if (this.mode === 'insert') { this.draft?.insert(text); this.notice = 'Pasted as literal draft text; Ctrl+s explicitly sends.'; }
    else this.notice = 'Paste ignored outside Insert mode.';
  }
  key(key: string): void {
    if (key === 'quit') { this.onExternal('quit.force'); return; } // physical Ctrl+C is reserved
    if (this.help) {
      if (key === '<Esc>' || key === '?' || key === 'q') this.help = false;
      else if (['j', '<Down>', '<C-d>', '<PageDown>'].includes(key)) this.helpScroll += key === 'j' || key === '<Down>' ? 1 : 10;
      else if (['k', '<Up>', '<C-u>', '<PageUp>'].includes(key)) this.helpScroll = Math.max(0, this.helpScroll - (key === 'k' || key === '<Up>' ? 1 : 10));
      return;
    }
    if (this.mode === 'command' || this.mode === 'search') { this.promptKey(key); return; }
    if (this.mode === 'normal' && key === '<Esc>') { this.normal.pending = []; this.notice = ''; return; }
    const actions = (this.mode === 'insert' ? this.insert : this.normal).feed(key);
    if (actions.length) { for (const action of actions) this.action(action); return; }
    if (this.mode === 'insert' && key && !/^<[^<>]+>$/.test(key) && !/[\x00-\x1f\x7f-\x9f]/.test(key)) this.draft?.insert(key);
  }
  private promptKey(key: string): void {
    if (key === '<Esc>') { this.mode = 'normal'; this.command = ''; return; }
    if (key === '<Enter>') {
      const value = this.command.trim(), mode = this.mode; this.mode = 'normal'; this.command = '';
      if (mode === 'search') {
        this.query = value;
        if (this.focus === 'rooms') { this.roomFilter = value; this.selectedRoom = 0; }
        else this.find(1);
      } else if (value) {
        this.history = [...this.history.filter(item => item !== value), value].slice(-50); this.historyIndex = this.history.length;
        const aliases: Record<string, string> = { q: 'quit', 'q!': 'quit.force', w: 'send', bnext: 'focus.next', bprevious: 'focus.previous',
          'wincmd h': 'focus.left', 'wincmd j': 'focus.down', 'wincmd k': 'focus.up', 'wincmd l': 'focus.right' };
        const numbers: Record<string, 'relative' | 'absolute' | 'off'> = { 'set number': 'absolute', 'set relativenumber': 'relative', 'set nonumber': 'off' };
        if (Object.hasOwn(numbers, value)) { this.config = { ...this.config, messaging: { ...this.config.messaging, lineNumbers: numbers[value]! } }; return; }
        const action = aliases[value] ?? value.replace(/^colorscheme\s+/, 'theme ');
        if (validMessageAction(action)) this.action(action); else this.notice = 'Unknown command. Press : then Tab for completion, or ? for help.';
      }
      return;
    }
    if (key === '<Tab>' && this.mode === 'command') {
      if (!this.completions.length) {
        this.completions = [...MESSAGE_ACTIONS.filter(action => !['layout', 'layout.save', 'theme'].includes(action)), ...(this.extensions?.commandNames() ?? []), 'set number', 'set relativenumber', 'set nonumber', 'bnext', 'bprevious',
          ...Object.keys(this.config.messaging.layouts).map(name => `layout ${name}`), ...[...new Set([...Object.keys(themes), ...(this.extensions?.themeNames() ?? [])])].flatMap(name => [`theme ${name}`, `colorscheme ${name}`])]
          .filter(action => action.startsWith(this.command)); this.completionIndex = 0;
      }
      if (this.completions.length) this.command = this.completions[this.completionIndex++ % this.completions.length]!;
      return;
    }
    this.completions = [];
    if (key === '<BS>') this.command = segments(this.command).slice(0, -1).join('');
    else if (key === '<Up>' && this.mode === 'command') this.command = this.history[this.historyIndex = Math.max(0, this.historyIndex - 1)] ?? '';
    else if (key === '<Down>' && this.mode === 'command') this.command = this.history[this.historyIndex = Math.min(this.history.length, this.historyIndex + 1)] ?? '';
    else if (key && !/^<[^<>]+>$/.test(key) && !/[\x00-\x1f\x7f-\x9f]/.test(key) && this.command.length < 160) this.command += key;
  }
  action(action: string): void {
    if (this.extensions?.run(action)) return;
    const [name, argument] = action.trim().split(/\s+/);
    if (name?.startsWith('user.')) { this.notice = 'User command is not registered. Load its trusted --init module.'; return; }
    if (name === 'normal') { this.mode = 'normal'; return; }
    if (name === 'insert') {
      if (!this.store.room) { this.notice = 'Open a space before composing.'; return; }
      this.focus = 'compose'; this.mode = 'insert'; return;
    }
    if (name?.startsWith('edit.')) { if (this.focus === 'compose') this.draft?.edit(name.slice(5)); return; }
    if (name === 'command' || name === 'search') { this.mode = name; this.command = ''; this.completions = []; return; }
    if (name === 'help') { this.help = true; this.helpScroll = 0; return; }
    if (name === 'send') {
      const draft = this.draft, room = this.store.room;
      if (!draft?.text.trim() || !room || this.pending) { this.notice = 'Nothing sent: choose a space, enter text, and wait for pending delivery.'; return; }
      const requestId = randomUUID(); this.pending = { requestId, roomId: room.id, draft, text: draft.text, revision: draft.revision };
      void this.store.send(requestId, room.id, draft.text); return;
    }
    if (name === 'draft.clear') { this.draft?.clear(); return; }
    if (name === 'delivery.resolve') { this.store.resolveDelivery(); this.notice = 'Delivery warning acknowledged. Any next send is an explicit new attempt.'; return; }
    if (name === 'layout') {
      if (!argument || !Object.hasOwn(this.config.messaging.layouts, argument)) { this.notice = 'Unknown messaging layout.'; return; }
      this.layoutName = argument; this.layout = structuredClone(this.config.messaging.layouts[argument]!); this.maximized = false; return;
    }
    if (name === 'pane.maximize') { this.maximized = !this.maximized; return; }
    if (['pane.grow', 'pane.shrink', 'pane.widen', 'pane.narrow'].includes(name!)) { this.resize(name!); return; }
    if (name?.startsWith('focus.')) { this.navigate(name.slice(6)); return; }
    if (name === 'open') {
      if (this.focus === 'rooms') {
        const room = this.visibleRooms[this.selectedRoom]; if (room) { this.focus = 'messages'; this.selectedMessage = -1; this.messageScroll = 0; void this.store.select(room.id); }
      } else if (this.focus === 'compose') this.action('insert');
      return;
    }
    if (name === 'refresh') { void (this.focus === 'rooms' ? this.store.loadRooms() : this.store.refresh()); return; }
    if (name === 'rooms.refresh') { void this.store.loadRooms(this.store.moreRooms); return; }
    if (name === 'history.older') { void this.store.refresh(true); return; }
    if (name === 'search.next' || name === 'search.previous') { this.find(name === 'search.next' ? 1 : -1); return; }
    if (name === 'scroll.up' || name === 'scroll.down') { this.messageScroll = Math.max(0, this.messageScroll + (name === 'scroll.up' ? 5 : -5)); return; }
    if (name?.startsWith('move.') || name?.startsWith('page.')) {
      if (this.focus === 'compose') {
        const draft = this.draft; if (!draft) return;
        if (name === 'move.first') draft.cursor = 0;
        else if (name === 'move.last') draft.cursor = segments(draft.text).length;
        else for (let i = 0; i < (name.startsWith('page.') ? 10 : 1); i++) draft.edit(name.endsWith('up') ? 'up' : 'down');
        return;
      }
      const count = this.focus === 'rooms' ? this.visibleRooms.length : this.store.messages.length;
      const current = this.focus === 'rooms' ? this.selectedRoom : this.selectedMessage < 0 ? count - 1 : this.selectedMessage;
      const next = name === 'move.first' ? 0 : name === 'move.last' ? count - 1 : current + (name.endsWith('up') ? -1 : 1) * (name.startsWith('page.') ? 10 : 1);
      if (this.focus === 'rooms') this.selectedRoom = Math.max(0, Math.min(count - 1, next));
      else if (this.focus === 'messages') { this.selectedMessage = name === 'move.last' ? -1 : Math.max(0, Math.min(count - 1, next)); this.messageScroll = 0; }
      return;
    }
    this.onExternal(action);
  }
  private find(direction: number): void {
    const messages = this.store.messages, start = this.selectedMessage < 0 ? messages.length - 1 : this.selectedMessage;
    if (!this.query || !messages.length) return;
    for (let offset = 1; offset <= messages.length; offset++) {
      const index = (start + direction * offset + messages.length) % messages.length;
      if (`${messages[index]!.author} ${messages[index]!.text}`.toLocaleLowerCase().includes(this.query.toLocaleLowerCase())) { this.selectedMessage = index; this.messageScroll = 0; return; }
    }
    this.notice = 'Pattern not found in loaded history.';
  }
  private navigate(direction: string): void {
    const panes = messageGeometry(this.layout, this.columns, this.rows - 3), current = panes.find(pane => pane.panel === this.focus)!;
    if (['rooms', 'messages', 'compose', 'info'].includes(direction)) { if (panes.some(pane => pane.panel === direction)) this.focus = direction as Panel; return; }
    if (!current) { this.focus = panes[0]!.panel; return; }
    if (direction === 'next' || direction === 'previous') { this.focus = panes[(panes.indexOf(current) + (direction === 'next' ? 1 : panes.length - 1)) % panes.length]!.panel; return; }
    const cx = current.x + current.width / 2, cy = current.y + current.height / 2;
    const candidates = panes.filter(pane => pane !== current).map(pane => ({ pane, dx: pane.x + pane.width / 2 - cx, dy: pane.y + pane.height / 2 - cy }))
      .filter(p => direction === 'left' ? p.dx < 0 : direction === 'right' ? p.dx > 0 : direction === 'up' ? p.dy < 0 : p.dy > 0)
      .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
    if (candidates[0]) this.focus = candidates[0].pane.panel;
  }
  private resize(action: string): void {
    const direction = action === 'pane.widen' || action === 'pane.narrow' ? 'vertical' : 'horizontal';
    const contains = (layout: MessageLayout): boolean => 'panel' in layout ? layout.panel === this.focus : layout.children.some(contains);
    const resize = (layout: MessageLayout): boolean => {
      if ('panel' in layout) return false;
      const index = layout.children.findIndex(contains); if (index < 0) return false;
      if (resize(layout.children[index]!)) return true;
      if (layout.direction !== direction) return false;
      const sign = (action === 'pane.shrink' || action === 'pane.narrow' ? -1 : 1) * (index === 0 ? 1 : -1);
      layout.ratio = Math.max(.1, Math.min(.9, Math.round((layout.ratio + .05 * sign) * 100) / 100)); return true;
    };
    resize(this.layout);
  }
  private panelLines(panel: Panel, width: number, height: number): BufferLine[] {
    const s = this.store;
    if (panel.startsWith('user.')) return (this.extensions?.panel(panel, width, height) ?? ['User panel unavailable. Load its trusted --init module.']).map(text => ({ text }));
    if (panel === 'rooms') {
      const rooms = this.visibleRooms; this.selectedRoom = Math.max(0, Math.min(this.selectedRoom, rooms.length - 1));
      const start = Math.max(0, this.selectedRoom - height + 2);
      return [{ text: this.roomFilter ? `/${this.roomFilter} · ${rooms.length} matches` : `${s.rooms.length} spaces${s.moreRooms ? '+' : ''} · Enter opens`, role: 'muted' },
        ...rooms.slice(start, start + Math.max(0, height - 1)).map((room, index) => ({ text: `${s.room?.id === room.id ? '●' : ' '} ${room.title}`,
          number: start + index + 1, selected: start + index === this.selectedRoom,
          role: (start + index === this.selectedRoom ? 'accent' : 'foreground') as Role }))];
    }
    if (panel === 'compose') {
      const draft = this.draft, text = draft?.text ?? '', cursor = draft?.cursor ?? 0, parts = segments(text);
      const lines: BufferLine[] = [{ text: '', number: 1 }]; let cells = 0, lineNumber = 1, cursorRow = 0;
      const newline = (number?: number) => { lines.push({ text: '', ...(number === undefined ? {} : { number }) }); cells = 0; };
      for (let index = 0; index <= parts.length; index++) {
        const part = parts[index], size = part && part !== '\n' ? stringWidth(part) : 0;
        if (cells + size > width || index === cursor && cells === width) newline();
        if (index === cursor) { lines[lines.length - 1]!.cursor = cells; lines[lines.length - 1]!.selected = true; cursorRow = lines.length - 1; }
        if (part === undefined) break;
        if (part === '\n') { newline(++lineNumber); continue; }
        lines[lines.length - 1]!.text += part; cells += size;
      }
      const start = Math.max(0, cursorRow - height + 3);
      return [{ text: `TO: ${s.room?.title ?? '(open a space first)'} · ${text.length}/1000`, role: 'accent' },
        { text: `${this.pending ? 'Sending · ' : ''}${s.room && s.uncertain.has(s.room.id) ? 'UNKNOWN delivery · :delivery.resolve' : this.mode === 'insert' ? 'Enter newline · Ctrl+s SEND · Esc normal' : 'i compose · Ctrl+s SEND · draft stays in memory'}`, role: 'muted' },
        ...lines.slice(start, start + Math.max(0, height - 2))];
    }
    if (panel === 'info') return [
      { text: 'DESTINATION', role: 'accent' }, { text: s.room?.title ?? 'No space selected' }, ...wrapMessage(s.room?.id ?? '', width).map(text => ({ text, role: 'muted' as Role })),
      { text: s.room?.type === 'direct' ? 'Direct conversation' : 'Persistent group space' }, { text: 'NOT in-meeting chat', role: 'warning' },
      { text: `${s.messages.length}/500 messages loaded` }, { text: `${s.moreHistory ? ':history.older for more' : 'No older page loaded/available'}` },
      { text: ':rooms.refresh for more spaces' }, { text: 'Poll: selected space, 4s' }, { text: 'Drafts: memory only' }, { text: 'No automatic POST retries' },
    ];
    if (!s.room) return [{ text: 'Select a space with j/k and Enter.', role: 'muted' }, { text: 'No meeting or media session is created.' }, { text: 'Press ? for keys and commands.' }];
    if (!s.messages.length) return [{ text: s.loading ? 'Loading messages…' : 'No text messages loaded. i to compose.', role: 'muted' }];
    const selected = this.selectedMessage < 0 ? s.messages.length - 1 : Math.min(this.selectedMessage, s.messages.length - 1);
    if (this.cachedHistory?.messages !== s.messages || this.cachedHistory.width !== width) this.cachedHistory = { messages: s.messages, width,
      lines: s.messages.flatMap((message, index) => [
        { text: `${message.created.slice(0, 16).replace('T', ' ')} ${message.author}`, header: true, index },
        ...wrapMessage(message.text, width).map(text => ({ text, index })), { text: '', index },
      ]) };
    const all = this.cachedHistory.lines;
    const end = this.selectedMessage < 0 ? all.length : all.reduce((last, line, index) => line.index === selected ? index + 1 : last, 0);
    this.messageScroll = Math.min(this.messageScroll, Math.max(0, end - height));
    const start = Math.max(0, end - height - this.messageScroll);
    return all.slice(start, start + height).map((line, index) => ({ text: line.text, number: start + index + 1, selected: !!line.header && line.index === selected,
      role: line.header ? line.index === selected ? 'accent' : 'muted' : 'foreground' }));
  }
  screen(columns: number, rows: number): { ansi: string; lines: string[] } {
    this.columns = Math.max(1, columns); this.rows = Math.max(1, rows);
    const canvas = new Canvas(this.columns, this.rows), store = this.store;
    canvas.put(0, 0, ' '.repeat(this.columns), 'muted', this.columns, 'border');
    const tabs: [Panel, string][] = [['rooms', 'spaces'], ['messages', store.room?.title ?? '[Messages]'], ['compose', `draft${this.draft?.text ? ' [+]' : ''}`]];
    let tabX = 0;
    for (const [panel, label] of tabs) {
      const tab = ` ${tabs.findIndex(item => item[0] === panel) + 1} ${cleanText(label, 25)} `;
      if (tabX + stringWidth(tab) > this.columns - 18) break;
      canvas.put(tabX, 0, tab, panel === this.focus ? 'accent' : 'muted', stringWidth(tab), panel === this.focus ? 'background' : 'border', panel === this.focus); tabX += stringWidth(tab);
    }
    const auth = cleanText(this.auth || 'WBX', Math.max(0, this.columns - tabX - 1));
    const customTabline = this.extensions?.tabline();
    if (customTabline !== undefined) {
      const available = Math.max(0, this.columns - stringWidth(auth) - 2);
      canvas.put(0, 0, ' '.repeat(available), 'muted', available, 'border'); canvas.put(0, 0, customTabline, 'accent', available, 'border');
    }
    canvas.put(this.columns - stringWidth(auth) - 1, 0, auth, 'muted', stringWidth(auth), 'border');
    if (this.columns < 24 || this.rows < 8) {
      canvas.put(0, 2, 'Terminal too small.', 'warning'); canvas.put(0, 3, 'Resize or Ctrl+C quits.');
    } else if (this.help) {
      const lines = [ 'NORMAL · INSERT · COMMAND · SEARCH', 'j/k move · gg/G first/last · Ctrl+u/d pages · Enter open space',
        'i compose · Enter inserts newline · Ctrl+s sends to named space', 'Esc normal (never quits) · q refuses unsaved drafts · :q! discards',
        'Tab / Shift+Tab focus · Ctrl+w h/j/k/l directional focus', 'Ctrl+w + / - height · Ctrl+w > / < width · Ctrl+w o zoom',
        '/ filter spaces or search loaded messages · n/N next/previous hit', 'Ctrl+y/e or PageUp/Down scroll wrapped message lines', ':layout mail|stacked|detailed · :layout.save NAME · :theme forest',
        ':reload · :auth.refresh · :history.older · :rooms.refresh', ':draft.clear · :delivery.resolve (after checking unknown delivery)',
        'Config: messaging.keybindings.normal/insert · messaging.layouts', 'Theme: shared theme #RRGGBB colors · leader: shared config leader',
        'Effective NORMAL mappings:', ...Object.entries(this.config.messaging.keybindings.normal).filter(([, action]) => action !== null).map(([key, value]) => `${key} → ${Array.isArray(value) ? value.join('; ') : value}`),
        'Effective INSERT mappings:', ...Object.entries(this.config.messaging.keybindings.insert).filter(([, action]) => action !== null).map(([key, value]) => `${key} → ${Array.isArray(value) ? value.join('; ') : value}`),
      ];
      this.helpScroll = Math.min(this.helpScroll, Math.max(0, lines.length - this.rows + 3));
      lines.slice(this.helpScroll, this.helpScroll + this.rows - 3).forEach((line, index) => canvas.put(1, index + 1, line, index === 0 ? 'accent' : 'foreground'));
    } else {
      let panes = messageGeometry(this.layout, this.columns, Math.max(1, this.rows - 3));
      if (!panes.some(pane => pane.panel === this.focus)) this.focus = 'rooms';
      const focused = panes.find(pane => pane.panel === this.focus)!;
      if (this.maximized || this.columns < 60 || this.rows < 18 || focused.width < 12 || focused.height < 4) panes = [{ panel: this.focus, x: 0, y: 1, width: this.columns, height: this.rows - 3 }];
      for (const pane of panes) {
        const { x, y, width, height } = pane; if (width < 3 || height < 3) continue;
        const active = pane.panel === this.focus, separator = x + width < this.columns ? 1 : 0, bodyWidth = width - separator;
        const gutter = this.config.messaging.lineNumbers !== 'off' && pane.panel !== 'info' && bodyWidth >= 16 ? 5 : 0;
        const bodyHeight = height - 1, lines = this.panelLines(pane.panel, Math.max(1, bodyWidth - gutter), bodyHeight);
        const selected = lines.find(line => line.selected)?.number;
        for (let index = 0; index < bodyHeight; index++) {
          const line = lines[index], row = y + index;
          if (separator) canvas.put(x + width - 1, row, '│', 'border');
          if (!line) { canvas.put(x, row, '~', 'muted'); continue; }
          const highlight = active && !!line.selected;
          if (highlight) canvas.put(x, row, ' '.repeat(bodyWidth), 'foreground', bodyWidth, 'border');
          if (gutter && line.number !== undefined) {
            const number = this.config.messaging.lineNumbers === 'relative' && selected !== undefined && line.number !== selected ? Math.abs(line.number - selected) : line.number;
            canvas.put(x, row, String(number).padStart(gutter - 1) + ' ', highlight ? 'accent' : 'muted', gutter, highlight ? 'border' : 'background');
          }
          canvas.put(x + gutter, row, line.text, line.role, bodyWidth - gutter, highlight ? 'border' : 'background');
          if (active && line.selected && this.mode === 'normal') canvas.caret(x + gutter + (line.cursor ?? 0), row, false);
          if (active && pane.panel === 'compose' && line.cursor !== undefined && this.mode === 'insert') canvas.caret(x + gutter + line.cursor, row, true);
        }
        const filename = pane.panel === 'rooms' ? 'wbx://spaces' : pane.panel === 'info' ? 'wbx://info' : `wbx://${pane.panel}/${store.room?.title ?? '[No space]'}`;
        canvas.put(x, y + height - 1, ' '.repeat(width), active ? 'foreground' : 'muted', width, 'border');
        canvas.put(x, y + height - 1, ` ${filename}${pane.panel === 'compose' && this.draft?.text ? ' [+]' : ''}`, active ? 'accent' : 'muted', width, 'border', active);
      }
    }
    canvas.put(0, this.rows - 2, ' '.repeat(this.columns), 'foreground', this.columns, 'border');
    const mode = ` ${this.mode.toUpperCase()} `;
    canvas.put(0, this.rows - 2, mode, 'background', mode.length, this.mode === 'insert' ? 'focus' : 'accent', true);
    canvas.put(mode.length, this.rows - 2, ` ${this.focus}  ${this.layoutName}${this.maximized ? ' [zoom]' : ''}  ${this.normal.hint() || ''}`, 'foreground', Math.max(0, this.columns - mode.length - 21), 'border');
    const prefix = segments(this.draft?.text ?? '').slice(0, this.draft?.cursor ?? 0).join('');
    const position = this.focus === 'compose' ? `${prefix.split('\n').length}:${segments(prefix.split('\n').at(-1) ?? '').length + 1}` : this.focus === 'rooms' ? `${this.selectedRoom + 1}:1` : `${Math.max(1, this.selectedMessage < 0 ? store.messages.length : this.selectedMessage + 1)}:1`;
    const location = `utf-8  ${position}   ${this.messageScroll ? '↑' : 'All'} `;
    if (this.columns >= 40) canvas.put(this.columns - stringWidth(location), this.rows - 2, location, 'muted', stringWidth(location), 'border');
    const customStatus = this.extensions?.statusline();
    if (customStatus) {
      canvas.put(0, this.rows - 2, ' '.repeat(this.columns), 'foreground', this.columns, 'border');
      const right = cleanText(customStatus.right ?? '', Math.max(0, this.columns - 2));
      canvas.put(0, this.rows - 2, customStatus.left, 'accent', Math.max(0, this.columns - stringWidth(right) - 1), 'border');
      canvas.put(this.columns - stringWidth(right), this.rows - 2, right, 'muted', stringWidth(right), 'border');
    }
    canvas.put(0, this.rows - 1, this.mode === 'command' || this.mode === 'search' ? `${this.mode === 'command' ? ':' : '/'}${this.command}▏`
      : this.help ? ' j/k or Ctrl+u/d scroll help · Esc closes' : ` ${this.notice || store.notice || (this.mode === 'insert' ? '-- INSERT --' : 'Press ? for help')}`, this.notice || store.notice ? 'warning' : 'muted');
    if (this.mode === 'command' || this.mode === 'search') canvas.caret(Math.min(this.columns - 1, stringWidth(this.command) + 1), this.rows - 1, true);
    return { ansi: canvas.ansi(this.config.theme), lines: canvas.plain() };
  }
}
