import { ACTIONS, themes, validAction, type Config } from './config.js';
import { Keymap } from './keys.js';
import { Workspace, type PositionedPane, type Rect } from './workspace.js';
import { ESC, type Geometry } from './render.js';
import { cleanText } from './terminal.js';
import type { SourceInfo } from './protocol.js';
import stringWidth from 'string-width';
import { ChatUI } from './chat-ui.js';

export const color = (hex: string, background = false) => `${ESC}[${background ? 48 : 38};2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`;
export function content(pane: PositionedPane): Rect {
  return { x: pane.x + 1, y: pane.y + 1, width: Math.max(0, pane.width - 2), height: Math.max(0, pane.height - 2) };
}
export class UI {
  workspace: Workspace;
  keys: Keymap;
  overlay: 'help' | 'command' | 'participants' | 'chat' | undefined;
  readonly chat = new ChatUI();
  input = '';
  scroll = 0;
  notice = '';
  sources: SourceInfo[] = [];
  size: Geometry = { columns: 80, rows: 24, cellWidth: 8, cellHeight: 16 };
  revision = 0;
  layoutName: string;
  constructor(public config: Config, private effect: (action: string) => void, readonly native = false) {
    this.layoutName = config.layout;
    this.keys = new Keymap(config); this.workspace = new Workspace(native ? { source: 'video' } : config.layouts[config.layout]!);
  }
  reconfigure(config: Config): void {
    const keys = new Keymap(config); // validate before replacing any working state
    this.config = config; this.keys = keys; this.revision++;
  }
  dispatch(action: string): void {
    action = action.trim();
    if (!validAction(action)) { this.notice = `Unknown action: ${action}`; return; }
    this.notice = '';
    const [name, arg] = action.split(/\s+/), w = this.workspace;
    if (this.native && (name?.startsWith('focus.') || name?.startsWith('pane.') || name?.startsWith('source.')
      || ['layout', 'layout.save', 'tmux.open', 'theme'].includes(name!))) { this.effect(action); return; }
    if (name === 'focus.next' || name === 'focus.previous') w.cycle(name === 'focus.next' ? 1 : -1);
    else if (name?.startsWith('focus.')) w.direction(name.slice(6), this.size.columns, this.size.rows - 3);
    else if (name === 'source.set') w.source(arg as SourceInfo['id']);
    else if (name === 'source.next') {
      const sources = this.sources.filter(source => source.available || source.id === 'video' || source.id === 'share');
      if (sources.length) w.source(sources[(sources.findIndex(source => source.id === w.selected().source) + 1) % sources.length]!.id);
    } else if (name?.startsWith('pane.split.')) {
      const sources = this.sources.filter(source => source.available), used = w.panes().map(pane => pane.source);
      w.split(name.endsWith('vertical') ? 'vertical' : 'horizontal', sources.find(source => !used.includes(source.id))?.id ?? w.selected().source);
    } else if (name === 'pane.close') w.close();
    else if (name === 'pane.only') w.only();
    else if (name === 'pane.maximize') w.maximize();
    else if (name === 'pane.grow' || name === 'pane.shrink') w.resize(name === 'pane.grow' ? .05 : -.05);
    else if (name === 'layout') {
      const names = Object.keys(this.config.layouts), next = arg ?? names[(names.indexOf(this.layoutName) + 1) % names.length]!;
      if (!Object.hasOwn(this.config.layouts, next)) { this.notice = `Unknown layout: ${next}`; return; }
      w.load(this.config.layouts[next]!); this.layoutName = next; this.notice = `Layout: ${next}`;
    } else if (name === 'theme') {
      const theme = Object.hasOwn(themes, arg ?? 'midnight') ? themes[arg ?? 'midnight'] : undefined;
      if (!theme) { this.notice = `Themes: ${Object.keys(themes).join(', ')}`; return; }
      this.config.theme = { ...theme }; this.revision++;
    } else if (name === 'chat') {
      this.overlay = 'chat'; this.revision++; this.chat.open();
    } else if (name === 'chat.close') { this.chat.disable(); this.overlay = undefined; this.revision++; }
    else if (name === 'help' || name === 'command' || name === 'participants') {
      this.overlay = name; this.input = ''; this.scroll = 0; this.revision++;
    } else this.effect(action);
  }
  key(key: string): void {
    if (key === 'quit') { this.effect('quit'); return; } // Ctrl+C always exits
    if (this.overlay === 'chat') {
      if (key === '<Esc>') { this.overlay = undefined; this.revision++; }
      else this.chat.key(key);
      return;
    }
    if (this.overlay === 'help' || this.overlay === 'participants') {
      if (key === 'j' || key === '<Down>') this.scroll++;
      else if (key === 'k' || key === '<Up>') this.scroll = Math.max(0, this.scroll - 1);
      else { this.overlay = undefined; this.revision++; }
      return;
    }
    if (this.overlay === 'command') {
      if (key === '<Esc>') { this.overlay = undefined; this.revision++; }
      else if (key === '<BS>') this.input = this.input.slice(0, -1);
      else if (key === '<Tab>') {
        const matches = this.completions(); if (matches[0]) this.input = matches[0];
      } else if (key === '<Enter>') {
        const action = this.input.trim(); this.overlay = undefined; this.revision++;
        try { this.dispatch(action); } catch (error) { this.notice = (error as Error).message; }
      } else if (/^[\x20-\x7e]$/.test(key) && this.input.length < 160) this.input += key;
      return;
    }
    for (const action of this.keys.feed(key)) {
      try { this.dispatch(action); } catch (error) { this.notice = (error as Error).message; }
    }
  }
  completions(): string[] {
    return [...ACTIONS.filter(action => !['layout', 'theme', 'source.set'].includes(action)),
      ...Object.keys(this.config.layouts).map(name => `layout ${name}`),
      ...Object.keys(themes).map(name => `theme ${name}`), ...this.sources.map(source => `source.set ${source.id}`)]
      .filter(action => action.startsWith(this.input));
  }
  line(x: number, y: number, text: string, width: number, foreground = this.config.theme.foreground): string {
    const safe = cleanText(text, width);
    return `${ESC}[${y};${x}H${color(this.config.theme.background, true)}${color(foreground)}${safe}${' '.repeat(Math.max(0, width - stringWidth(safe)))}`;
  }
  fill(rect: Rect, text = ''): string {
    return Array.from({ length: rect.height }, (_, row) => this.line(rect.x, rect.y + row, row === Math.floor(rect.height / 2) ? text : '', rect.width, this.config.theme.muted)).join('');
  }
  chrome(header: string, notice: string): string {
    const { columns, rows } = this.size, theme = this.config.theme, w = this.workspace;
    let output = this.line(1, 1, header, columns, theme.accent);
    for (const pane of this.native ? [] : w.positions(columns, rows - 3)) {
      const focused = pane.id === w.focus, tint = focused ? theme.focus : theme.border;
      const source = this.sources.find(source => source.id === pane.source);
      const label = `${focused ? '>' : ' '} ${pane.title ?? source?.label ?? pane.source} ${focused ? '[focus]' : ''}`;
      output += this.line(pane.x, pane.y, label, pane.width, focused ? theme.focus : theme.muted);
      if (pane.height > 1) output += this.line(pane.x, pane.y + pane.height - 1, '─'.repeat(pane.width), pane.width, tint);
      for (let row = 1; row < pane.height - 1; row++) {
        output += this.line(pane.x, pane.y + row, '│', 1, tint);
        if (pane.width > 1) output += this.line(pane.x + pane.width - 1, pane.y + row, '│', 1, tint);
      }
    }
    const message = (this.overlay === 'chat' ? this.chat.notice : '') || this.notice || notice;
    output += this.line(1, rows - 1, message, columns, /fail|invalid|paused|denied|refused|unknown/i.test(message) ? theme.warning : theme.muted);
    const modified = JSON.stringify(w.layout()) !== JSON.stringify(this.config.layouts[this.layoutName]);
    const footer = this.overlay === 'chat' ? 'SPACE CHAT · Enter sends · Tab spaces · Ctrl+r refresh · Esc back · Ctrl+C quit'
      : this.overlay === 'help' || this.overlay === 'participants' ? 'HELP / ROSTER · j/k scroll · any other key closes'
      : this.overlay === 'command' ? 'COMMAND · Tab complete · Enter run · Esc cancel'
       : this.keys.hint() || (this.native ? `TMUX · : commands  ? keys  x space chat${this.chat.unread ? ` (${this.chat.unread})` : ''}  Tab next pane  Ctrl+w splits`
        : `NORMAL · ${w.panes().length} panes · ${this.layoutName}${modified ? '*' : ''}${w.maximized ? ' / MAX' : ''} · : commands  ? keys  Tab focus  Ctrl+w splits`);
    output += this.line(1, rows, footer, columns, theme.accent);
    if (this.overlay) {
      const lines = this.overlay === 'chat' ? this.chat.lines(columns, Math.max(1, rows - 3)) : this.overlay === 'participants'
        ? ['PARTICIPANTS · j/k scroll · any other key closes', ...this.sources.filter(source => source.kind === 'video' || source.kind === 'mock')
          .map(source => `${source.id.padEnd(12)} ${source.label} ${source.available ? '' : source.present ? '(camera off / waiting)' : '(waiting)'}`)]
        : this.overlay === 'help'
        ? ['KEYBINDINGS · j/k scroll · any other key closes', 'Ctrl+C always exits. Pasted text never runs commands.',
          ...Object.entries(this.config.keybindings).filter(([, action]) => action !== null).map(([key, action]) => `${key.padEnd(20)} ${Array.isArray(action) ? action.join(' → ') : action}`),
          '', 'SOURCES · :source.set <id>', ...this.sources.map(source => `${source.id}: ${source.label} ${source.available ? '' : '(waiting/off)'}`)]
        : ['COMMANDS · Tab complete · Enter run · Esc cancel', `:${this.input}`, '', ...this.completions()];
      const height = Math.max(1, rows - 3);
      this.scroll = Math.min(this.scroll, Math.max(0, lines.length - height));
      for (let row = 0; row < height; row++) output += this.line(1, row + 2, lines[this.scroll + row] ?? '', columns, row === 0 ? theme.accent : theme.foreground);
    }
    return output + `${ESC}[0m`;
  }
}
