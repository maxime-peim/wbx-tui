import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, themes, type Theme } from './config.js';
import { messageGeometry, type MessagingUI } from './messaging-ui.js';
import { userName, validMessageAction, type Panel } from './messaging-config.js';
import type { ExtensionAPI, ExtensionContext, ExtensionEvent, ExtensionHandler, ExtensionOptions } from './extension-api.js';

const EVENTS: ExtensionEvent[] = ['ready', 'room.changed', 'messages.changed', 'mode.changed', 'draft.changed', 'focus.changed', 'config.reloaded', 'unload', 'quit'];
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('User configuration deadline.')), ms); })]); }
  finally { clearTimeout(timer); }
}
let generation = 0;
/** Explicitly trusted Node code, not a sandbox or a network/plugin installer. */
export class ExtensionHost {
  private active = true;
  private commands = new Map<string, ExtensionHandler>();
  private hooks = new Map<ExtensionEvent, Set<ExtensionHandler>>();
  private panels = new Map<string, (context: ExtensionContext, width: number, height: number) => string[]>();
  private palettes = new Map<string, Theme>();
  private cleanups: (() => void | Promise<void>)[] = [];
  private busy = new Set<ExtensionHandler>();
  private statusRenderer?: (context: ExtensionContext) => { left: string; right?: string };
  private tabRenderer?: (context: ExtensionContext) => string;
  private keySequence = 0;
  private rendering = false;
  private last?: { room?: string; mode: string; focus: Panel; messages: unknown; revision?: number };
  readonly api: ExtensionAPI;
  constructor(private ui: MessagingUI, private invalidate: () => void) {
    this.api = Object.freeze({
      version: 1 as const,
      context: () => this.context(),
      configure: (options: ExtensionOptions) => this.configure(options),
      keymap: { set: (mode: 'normal' | 'insert', sequence: string, action: string | string[] | ExtensionHandler | null) => {
        this.assertActive();
        let rhs = action;
        if (typeof action === 'function') {
          const name = `user.__key_${++this.keySequence}` as const; this.addCommand(name, action); rhs = name;
        }
        if (!['normal', 'insert'].includes(mode)) throw new Error('Unknown mapping mode.');
        this.configure({ messaging: { keybindings: { [mode]: { [sequence]: rhs } } } });
      } },
      commands: { add: (name: `user.${string}`, handler: ExtensionHandler) => this.addCommand(name, handler) },
      events: { on: (event: ExtensionEvent, handler: ExtensionHandler) => {
        this.assertActive();
        if (!EVENTS.includes(event) || typeof handler !== 'function' || [...this.hooks.values()].reduce((sum, set) => sum + set.size, 0) >= 128) throw new Error('Invalid or excessive event handlers.');
        if (!this.hooks.has(event)) this.hooks.set(event, new Set());
        this.hooks.get(event)!.add(handler); return () => { this.hooks.get(event)?.delete(handler); };
      } },
      panels: { add: (name: `user.${string}`, render: (context: ExtensionContext, width: number, height: number) => string[]) => {
        this.assertActive(); if (!userName(name) || typeof render !== 'function' || this.panels.size >= 16) throw new Error('Invalid or excessive user panels.');
        this.panels.set(name, render); this.invalidate();
      } },
      layouts: { add: (name: string, layout: import('./messaging-config.js').MessageLayout) => {
        this.configure({ messaging: { layouts: { [name]: layout } } });
      }, use: (name: string) => this.action(`layout ${name}`) },
      themes: { add: (name: string, colors: Partial<Theme>) => {
        this.assertActive(); if (!/^[A-Za-z0-9_-]{1,40}$/.test(name) || this.palettes.size >= 32) throw new Error('Invalid or excessive themes.');
        this.palettes.set(name, parseConfig({ theme: { ...this.ui.config.theme, ...colors } }).theme);
      }, use: (name: string) => {
        const theme = this.theme(name) ?? (Object.hasOwn(themes, name) ? themes[name] : undefined);
        if (!theme) throw new Error('Unknown theme.'); this.configure({ theme });
      } },
      ui: { statusline: (render: NonNullable<ExtensionHost['statusRenderer']>) => {
        this.assertActive(); if (typeof render !== 'function') throw new Error('Invalid status renderer.'); this.statusRenderer = render; this.invalidate();
      }, tabline: (render: NonNullable<ExtensionHost['tabRenderer']>) => {
        this.assertActive(); if (typeof render !== 'function') throw new Error('Invalid tab renderer.'); this.tabRenderer = render; this.invalidate();
      } },
      action: (action: string) => this.action(action),
      focus: (panel: Panel) => {
        this.assertActive();
        if (!messageGeometry(this.ui.layout, 80, 24).some(pane => pane.panel === panel)) throw new Error('Panel is not in this layout.');
        if (this.ui.mode === 'insert' && panel !== 'compose') this.ui.mode = 'normal';
        this.ui.focus = panel; this.invalidate();
      },
      notify: (message: string) => {
        this.assertActive(); if (typeof message !== 'string') throw new Error('Notification must be text.'); this.ui.notice = message.slice(0, 1000); this.invalidate();
      },
      onCleanup: (cleanup: () => void | Promise<void>) => {
        this.assertActive(); if (typeof cleanup !== 'function' || this.cleanups.length >= 128) throw new Error('Invalid or excessive cleanups.'); this.cleanups.push(cleanup);
      },
    });
    ui.extensions = this;
  }
  private assertActive(): void {
    if (!this.active) throw new Error('User configuration is unloaded.');
    if (this.rendering) throw new Error('Render callbacks must be pure.');
  }
  context(): ExtensionContext {
    const { room, messages } = this.ui.store;
    return freeze({ mode: this.ui.mode, focus: this.ui.focus, layout: this.ui.layoutName,
      ...(room ? { room: { id: room.id, title: room.title, type: room.type } } : {}),
      messages: messages.slice(-50).map(message => ({ ...message })),
      draft: { text: this.ui.draft?.text ?? '', cursor: this.ui.draft?.cursor ?? 0 } });
  }
  private configure(options: ExtensionOptions): void {
    this.assertActive();
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['leader', 'theme', 'messaging'].includes(key))) throw new Error('Only appearance, keymaps and layouts belong in executable configuration.');
    const current = this.ui.config, incoming = options.messaging;
    const next = parseConfig({ ...current, ...options, theme: { ...current.theme, ...options.theme }, messaging: {
      ...current.messaging, ...incoming, layouts: { ...current.messaging.layouts, ...incoming?.layouts },
      keybindings: { normal: { ...current.messaging.keybindings.normal, ...incoming?.keybindings?.normal },
        insert: { ...current.messaging.keybindings.insert, ...incoming?.keybindings?.insert } },
    } });
    this.ui.configure(next); if (incoming?.layout) this.ui.action(`layout ${incoming.layout}`); this.invalidate();
  }
  private action(action: string): void {
    this.assertActive(); if (!validMessageAction(action)) throw new Error('Unknown action.'); this.ui.action(action); this.invalidate();
  }
  private addCommand(name: string, handler: ExtensionHandler): void {
    this.assertActive(); if (!userName(name) || typeof handler !== 'function' || this.commands.size >= 128) throw new Error('Invalid or excessive user commands.');
    this.commands.set(name, handler);
  }
  commandNames(): string[] { return [...this.commands.keys()].filter(name => !name.startsWith('user.__key_')); }
  run(action: string): boolean {
    const [name] = action.trim().split(/\s+/); if (!userName(name)) return false;
    const handler = this.commands.get(name);
    if (!handler || !this.active) this.ui.notice = 'User command unavailable. Load its trusted --init module.';
    else this.invoke(handler, action.trim().slice(name.length).trim());
    return true;
  }
  private invoke(handler: ExtensionHandler, args = ''): void {
    if (!this.active || this.busy.has(handler)) return;
    this.busy.add(handler); const context = this.context();
    void Promise.resolve().then(() => { if (this.active) return handler(context, args); }).catch(() => {
      if (this.active) this.ui.notice = 'User extension callback failed. Provider details were not logged.';
    }).finally(() => { this.busy.delete(handler); if (this.active) this.invalidate(); });
  }
  emit(event: ExtensionEvent): void { for (const handler of this.hooks.get(event) ?? []) this.invoke(handler); }
  start(): void { this.sync(); this.emit('ready'); }
  sync(): void {
    if (!this.active) return;
    const next = { room: this.ui.store.room?.id, mode: this.ui.mode, focus: this.ui.focus, messages: this.ui.store.messages, revision: this.ui.draft?.revision };
    const before = this.last; this.last = next;
    if (!before) return;
    if (next.room !== before.room) this.emit('room.changed');
    if (next.messages !== before.messages) this.emit('messages.changed');
    if (next.mode !== before.mode) this.emit('mode.changed');
    if (next.focus !== before.focus) this.emit('focus.changed');
    if (next.revision !== before.revision) this.emit('draft.changed');
  }
  theme(name: string): Theme | undefined { return this.palettes.get(name); }
  themeNames(): string[] { return [...this.palettes.keys()]; }
  panel(name: string, width: number, height: number): string[] | undefined {
    const renderer = this.panels.get(name); if (!renderer) return;
    try {
      this.rendering = true;
      const lines = renderer(this.context(), width, height);
      if (!Array.isArray(lines) || lines.length > 200 || lines.some(line => typeof line !== 'string' || line.length > 4000)) throw new Error();
      return lines.slice(0, height);
    } catch { this.panels.delete(name); this.ui.notice = 'User panel failed and was disabled.'; return ['User panel failed.']; }
    finally { this.rendering = false; }
  }
  statusline(): { left: string; right?: string } | undefined {
    if (!this.statusRenderer) return;
    try {
      this.rendering = true;
      const value = this.statusRenderer(this.context());
      if (!value || typeof value.left !== 'string' || value.left.length > 4000 || value.right !== undefined && (typeof value.right !== 'string' || value.right.length > 4000)) throw new Error();
      return value;
    } catch { this.statusRenderer = undefined; this.ui.notice = 'User status line failed and was disabled.'; }
    finally { this.rendering = false; }
  }
  tabline(): string | undefined {
    if (!this.tabRenderer) return;
    try { this.rendering = true; const value = this.tabRenderer(this.context()); if (typeof value !== 'string' || value.length > 4000) throw new Error(); return value; }
    catch { this.tabRenderer = undefined; this.ui.notice = 'User tab line failed and was disabled.'; }
    finally { this.rendering = false; }
  }
  async load(path: string, timeoutMs = 5000): Promise<void> {
    const before = { config: this.ui.config, layout: structuredClone(this.ui.layout), name: this.ui.layoutName, focus: this.ui.focus };
    try {
      if (++generation > 100) throw new Error('Restart after 100 init reloads.');
      const file = resolve(path), info = await stat(file);
      if (!info.isFile() || info.size > 128_000 || !['.mjs', '.js', '.cjs'].includes(extname(file))) throw new Error('Init must be a bounded local JavaScript module.');
      await bounded((async () => {
        const module = await import(`${pathToFileURL(file).href}?wbx=${generation}`); this.assertActive();
        if (typeof module.default !== 'function') throw new Error('Init must export a setup function.');
        const cleanup = await module.default(this.api);
        if (typeof cleanup === 'function') {
          if (this.active) this.cleanups.push(cleanup); else await cleanup();
        }
      })(), timeoutMs);
    } catch {
      await this.dispose('failed'); this.ui.configure(before.config); this.ui.layout = before.layout; this.ui.layoutName = before.name; this.ui.focus = before.focus;
      throw new Error('Trusted init failed or timed out; application configuration was restored. No extension error details were logged.');
    }
  }
  async dispose(reason: 'quit' | 'reload' | 'failed' = 'quit'): Promise<void> {
    if (!this.active) return;
    const context = this.context(), hooks = [...(this.hooks.get('unload') ?? []), ...(reason === 'quit' ? this.hooks.get('quit') ?? [] : [])];
    this.active = false; if (this.ui.extensions === this) this.ui.extensions = undefined;
    this.commands.clear(); this.panels.clear(); this.palettes.clear(); this.statusRenderer = undefined; this.tabRenderer = undefined; this.hooks.clear();
    const work = [...hooks.map(handler => () => handler(context, reason)), ...this.cleanups.reverse()]; this.cleanups = [];
    await bounded(Promise.allSettled(work.map(cleanup => Promise.resolve().then(cleanup))), 2000).catch(() => {});
  }
}
