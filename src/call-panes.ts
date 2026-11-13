import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaults, saveLayout, type Config, type Layout } from './config.js';
import { fromTmuxLayout, nativeTree, tmuxLayout } from './tmux-layout.js';
import { Tmux, cliPath, quote } from './tmux.js';
import type { CallContext } from './call-launch.js';
import type { Source, SourceInfo } from './protocol.js';
import { cleanupAll, deadline } from './lifecycle.js';
import { paneAction, type NativePaneIntent } from './native-panes.js';

interface View { pane: string; source: Source; pid: string; owner: boolean; generation?: number }
const wanted = (source: SourceInfo) => source.available || source.present === true;
export interface PaneOptions {
  context: CallContext; socket: string; configPath: string; config: Config;
  renderer?: 'auto' | 'kitty' | 'blocks'; pixelTransport: string;
  viewerArgs?: string[];
  control(action: string): void;
  resetDisplay?(): void;
  presentation?(renderer: 'kitty' | 'blocks'): void;
  tmux?: Pick<Tmux, 'run'>;
}
/** All geometry and focus below are tmux operations, not a virtual split tree. */
export class CallPanes {
  private tmux: Pick<Tmux, 'run'>;
  private views = new Map<string, View>();
  private tags = new Map<string, { source: Source; label: string }>();
  private dismissed = new Map<Source, number>();
  private sources: SourceInfo[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private pendingSources?: SourceInfo[];
  private syncing?: Promise<void>;
  private checkingClients = false;
  private closing = false;
  private closingResult?: Promise<void>;
  private owner!: string;
  private window!: string;
  private exclusiveWindow = false;
  private clientSignature = '';
  private watch?: ReturnType<typeof setInterval>;
  private appearance = new Map<string, { window: boolean; option: string; value: string }>();
  layoutName: string;
  constructor(private options: PaneOptions) { this.layoutName = options.config.layout; this.tmux = options.tmux ?? new Tmux(); }
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work); this.tail = next.catch(() => {}); return next;
  }
  async start(): Promise<void> {
    const pane = process.env.TMUX_PANE;
    if (!pane || !/^%\d+$/.test(pane)) throw new Error('Call worker must run in its tmux owner pane.');
    this.owner = pane;
    const [window, pid, session] = (await this.tmux.run('display-message', '-p', '-t', pane, '#{window_id} #{pane_pid} #{session_name}')).split(' ');
    if (session !== this.options.context.name) throw new Error('Call worker is in the wrong tmux session.');
    this.window = window!;
    this.views.set(pane, { pane, pid: pid!, source: 'video', owner: true });
    await this.tag(pane, 'video', 'Remote video / call owner');
    await this.style();
    await this.tmux.run('set-option', '-t', `=${session}`, '@wbx_state', 'running');
    await this.tmux.run('set-option', '-t', `=${session}`, '@wbx_media_pid', String(process.pid));
    await this.tmux.run('set-option', '-t', `=${session}`, '@wbx_media_pane', this.owner);
    await this.tmux.run('set-option', '-t', `=${session}`, '@wbx_broker', this.options.socket);
    this.clientSignature = await this.clients();
    this.watch = setInterval(() => {
      if (this.checkingClients || this.closing) return;
      this.checkingClients = true;
      void this.queue(async () => {
        if (this.closing) return;
        const signature = await this.clients();
        if (signature !== this.clientSignature) {
          this.clientSignature = signature;
          if (signature) this.options.resetDisplay?.();
        }
      }).catch(() => {}).finally(() => { this.checkingClients = false; });
    }, 750);
  }
  private async clients(): Promise<string> {
    // PTY names can be reused and client_created has one-second granularity.
    // A newly attached terminal must always receive fresh image allocations.
    return this.tmux.run('list-clients', '-t', `=${this.options.context.name}`, '-F', '#{client_pid}:#{client_name}:#{client_created}:#{client_termname}');
  }
  private async tag(pane: string, source: Source, label: string): Promise<void> {
    const view = this.views.get(pane); if (view) view.generation = this.sources.find(info => info.id === source)?.generation;
    const title = (node: Layout | undefined): string | undefined => !node ? undefined : 'source' in node
      ? node.source === source ? node.title : undefined : title(node.children[0]) ?? title(node.children[1]);
    const custom = title(this.options.config.layouts[this.layoutName]);
    if (custom) label = `${custom} · ${label}`;
    label = label.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replaceAll('#', '＃');
    const previous = this.tags.get(pane);
    if (!previous || previous.source !== source) {
      await this.tmux.run('set-option', '-p', '-t', pane, '@wbx_source', source);
      await this.tmux.run('set-option', '-p', '-t', pane, '@wbx_owner', this.options.context.marker);
    }
    if (!previous || previous.label !== label) await this.tmux.run('select-pane', '-t', pane, '-T', label);
    this.tags.set(pane, { source, label });
  }
  async style(): Promise<void> {
    const session = `=${this.options.context.name}`;
    if (this.options.config.tmux.appearance === 'inherit') {
      // Only undo overrides this owner applied, and never discard a user's
      // subsequent local customization. Unset restores the server's inheritance.
      for (const { window, option, value } of this.appearance.values()) {
        const scope = window ? ['-w'] : [], target = window ? this.window : session;
        if (await this.tmux.run('show-options', ...scope, '-qv', '-t', target, option) === value.trim()) {
          await this.tmux.run('set-option', ...scope, '-u', '-t', target, option);
        }
      }
      this.appearance.clear(); return;
    }
    const set = async (window: boolean, option: string, value: string) => {
      await this.tmux.run('set-option', ...(window ? ['-w'] : []), '-t', window ? this.window : session, option, value);
      this.appearance.set(`${window}:${option}`, { window, option, value });
    };
    const t = this.options.config.theme;
    await set(true, 'pane-border-status', 'top');
    await set(true, 'pane-border-format', ' #{pane_index}: #{pane_title} ');
    await set(true, 'pane-border-style', `fg=${t.muted},bg=${t.background}`);
    await set(true, 'pane-active-border-style', `fg=${t.focus},bg=${t.background}`);
    await set(false, 'status-style', `fg=${t.accent},bg=${t.background}`);
    await set(false, 'status-left', `${this.options.context.name} `);
    await set(false, 'status-left-length', '80');
    await set(false, 'status', 'on');
  }
  private async stillOwned(view: View): Promise<boolean> {
    const info = await this.tmux.run('display-message', '-p', '-t', view.pane,
      '#{window_id}|#{pane_pid}|#{@wbx_owner}|#{@wbx_source}').catch(() => '');
    return info === `${this.window}|${view.pid}|${this.options.context.marker}|${view.source}`;
  }
  private async activeViews(): Promise<View[]> {
    const panes = new Set((await this.tmux.run('list-panes', '-t', this.window, '-F',
      '#{pane_id}|#{pane_pid}|#{@wbx_owner}|#{@wbx_source}')).split('\n'));
    for (const view of [...this.views.values()]) if (!panes.has(`${view.pane}|${view.pid}|${this.options.context.marker}|${view.source}`)) {
      this.views.delete(view.pane); this.tags.delete(view.pane);
      if (!view.owner) this.dismissed.set(view.source, view.generation ?? 0);
    }
    this.exclusiveWindow = panes.size === this.views.size && this.views.size > 0;
    return [...this.views.values()];
  }
  private async open(source: Source, direction = 'vertical', target = this.owner, automatic = false, valid = () => true): Promise<string | undefined> {
    if (this.views.size >= 16) throw new Error('Maximum 16 call panes.');
    const args = [process.execPath, cliPath(), 'view', '--session', this.options.socket, '--source', source, '--native-view', '--call-id', this.options.context.name.slice(4),
      '--pixel-transport', this.options.pixelTransport, ...(this.options.viewerArgs ?? [])];
    if (this.options.renderer) args.push('--renderer', this.options.renderer);
    else if (this.options.config.renderer === 'browser') args.push('--renderer', 'blocks');
    if (await access(this.options.configPath).then(() => true, () => false)) args.push('--config', resolve(this.options.configPath));
    if (this.closing || !valid()) throw new Error('Call/pane selection changed.');
    if (automatic) {
      await this.activeViews();
      if (this.closing || !this.exclusiveWindow) return;
    }
    const command = 'exec ' + args.map(quote).join(' ');
    const info = await this.tmux.run('split-window', '-d', direction === 'vertical' ? '-h' : '-v', '-t', target, '-P', '-F', '#{pane_id} #{pane_pid}', command);
    const [pane, pid] = info.split(' ');
    if (!/^%\d+$/.test(pane!) || !/^\d+$/.test(pid!)) throw new Error('Invalid new tmux pane identity.');
    this.views.set(pane!, { pane: pane!, pid: pid!, source, owner: false });
    const label = this.sources.find(info => info.id === source)?.label ?? source;
    await this.tag(pane!, source, label);
    // A physical split may finish after close's bounded queue drain. Its exact
    // creation receipt must still reach the same guarded child cleanup.
    if (this.closing) { await this.closeView(this.views.get(pane!)!); return; }
    return pane!;
  }
  private async arrange(name = this.layoutName, valid = () => true): Promise<void> {
    const views = await this.activeViews();
    if (!views.length || this.closing || !valid()) throw new Error('Call/pane selection changed.');
    if (!this.exclusiveWindow) throw new Error('Layout unchanged: this window contains unmanaged panes.');
    const configured = this.options.config.layouts[name];
    if (!configured) throw new Error(`Unknown layout: ${name}`);
    const builtin = JSON.stringify(configured) === JSON.stringify(defaults().layouts[name]);
    if (builtin && ['gallery', 'speaker', 'presentation', 'single'].includes(name)) {
      await this.tmux.run('select-layout', '-t', this.window, name === 'gallery' || name === 'single' ? 'tiled' : 'main-vertical');
      if (name === 'single') {
        await this.activeViews();
        if (this.closing || !valid() || !this.exclusiveWindow) throw new Error('Call/pane selection changed.');
        await this.tmux.run('resize-pane', '-t', this.owner, '-Z');
      }
      if (name === 'presentation') {
        const share = views.find(view => view.source === 'share');
        const first = (await this.tmux.run('list-panes', '-t', this.window, '-F', '#{pane_id}')).split('\n')[0];
        await this.activeViews();
        if (this.closing || !valid() || !this.exclusiveWindow) throw new Error('Call/pane selection changed.');
        if (share && share.pane !== first && views.some(view => view.pane === first)) await this.tmux.run('swap-pane', '-d', '-s', share.pane, '-t', first!);
      }
    } else {
      const [width, height] = (await this.tmux.run('display-message', '-p', '-t', this.window, '#{window_width} #{window_height}')).split(' ').map(Number);
      await this.activeViews();
      if (this.closing || !valid() || !this.exclusiveWindow) throw new Error('Call/pane selection changed.');
      await this.tmux.run('select-layout', '-t', this.window, tmuxLayout(nativeTree(configured, views), width!, height!));
    }
    this.layoutName = name;
    for (const view of views) await this.tag(view.pane, view.source, this.sources.find(source => source.id === view.source)?.label ?? view.source);
  }
  sync(sources: SourceInfo[]): Promise<void> {
    if (this.closing) return Promise.resolve();
    // Keep one latest snapshot, not a queue proportional to SDK source events.
    this.pendingSources = sources.map(source => ({ ...source }));
    if (this.syncing) return this.syncing;
    const next = (): Promise<void> => this.queue(async () => {
      if (this.closing) return;
      const sources = this.pendingSources!; this.pendingSources = undefined;
      this.sources = sources;
      await this.activeViews();
      if (this.closing) return;
      // Even removing an owned pane can expand a foreign neighbour. Defer ALL
      // automatic geometry while unrelated work shares this window; metadata
      // still updates, and explicit owned-region split/close controls remain.
      if (!this.exclusiveWindow) {
        for (const view of this.views.values()) {
          const source = sources.find(source => source.id === view.source);
          if (source && !this.closing) await this.tag(view.pane, source.id, source.label);
        }
        return;
      }
      let changed = false;
      for (const [id, generation] of this.dismissed) {
        const source = sources.find(source => source.id === id && wanted(source));
        if (!source || (source.generation ?? 0) !== generation) this.dismissed.delete(id);
      }
      for (const view of [...this.views.values()]) if (!view.owner && !sources.some(source => source.id === view.source && wanted(source))) {
        if (this.closing) return;
        const owned = await this.stillOwned(view);
        await this.activeViews();
        if (this.closing || !this.exclusiveWindow) return;
        if (owned) await this.tmux.run('kill-pane', '-t', view.pane);
        this.views.delete(view.pane); this.tags.delete(view.pane); changed = true;
      }
      for (const source of sources) {
        if (this.closing) return;
        if (!wanted(source) || this.dismissed.has(source.id)) continue;
        const existing = [...this.views.values()].find(view => view.source === source.id);
        if (existing) { await this.tag(existing.pane, source.id, source.label); continue; }
        if (!await this.open(source.id, 'vertical', this.owner, true)) return;
        // Re-tile each addition so repeatedly splitting the owner cannot shrink
        // it to zero before the next participant arrives.
        await this.activeViews();
        if (this.closing || !this.exclusiveWindow) return;
        await this.tmux.run('select-layout', '-t', this.window, 'tiled'); changed = true;
      }
      if (changed) await this.arrange();
    }).then(() => {
      // Re-enqueue behind actions already waiting; even a continuous roster
      // update storm must not starve focus/layout operations.
      if (this.pendingSources && !this.closing) return next();
    });
    this.syncing = next().finally(() => { this.syncing = undefined; });
    return this.syncing;
  }
  nativeAction(intent: NativePaneIntent, origin: string, valid: () => boolean): Promise<void> {
    return this.action(paneAction(intent), origin, valid, true);
  }
  action(action: string, origin = this.owner, valid: () => boolean = () => true, guarded = false): Promise<void> {
    if (['quit', 'microphone.toggle', 'video.toggle', 'screen.toggle', 'camera.toggle', 'audio.toggle'].includes(action)) {
      return (async () => {
        if (this.closing) return;
        // Media stop/leave must not wait for the membership/layout queue. Still
        // verify the exact requesting pane/process before relaying any control.
        await this.authorize(origin);
        if (!this.closing) this.options.control(action);
      })();
    }
    return this.queue(async () => {
      if (this.closing || !valid()) throw new Error('Call/pane selection changed.');
      const views = await this.activeViews(), requester = views.find(view => view.pane === origin);
      if (this.closing || !valid()) throw new Error('Call/pane selection changed.');
      if (!requester) throw new Error('Action is not from a managed pane of this call.');
      // A macro may focus a different native pane before its next action runs.
      // Validate the requester, then operate on this window's actual focus.
      const active = await this.tmux.run('display-message', '-p', '-t', this.window, '#{pane_id}');
      if (this.closing || !valid()) throw new Error('Call/pane selection changed.');
      const view = views.find(view => view.pane === active) ?? requester;
      if (guarded && (!await this.stillOwned(requester) || !await this.stillOwned(view) || !valid()))
        throw new Error('Managed native pane identity changed.');
      origin = view.pane;
      const [name, arg] = action.split(/\s+/);
      if (name?.startsWith('focus.') || name === 'source.next') {
        const directions: Record<string, string> = { left: '-L', right: '-R', up: '-U', down: '-D' };
        const direction = directions[name.slice(6)];
        if (direction) await this.tmux.run('select-pane', '-t', origin, direction);
        else {
          const index = views.indexOf(view), delta = name === 'focus.previous' ? -1 : 1;
          await this.tmux.run('select-pane', '-t', views[(index + delta + views.length) % views.length]!.pane);
        }
      } else if (name === 'source.set') {
         const target = views.find(view => view.source === arg);
         if (!target) throw new Error(`No active pane for ${arg}.`);
         if (guarded && (!await this.stillOwned(target) || !valid())) throw new Error('Managed native source pane changed.');
        await this.tmux.run('select-pane', '-t', target.pane);
      } else if (name === 'pane.maximize' || name === 'pane.only') await this.tmux.run('resize-pane', '-t', origin, '-Z');
      else if (name === 'pane.grow' || name === 'pane.shrink') await this.tmux.run('resize-pane', '-t', origin, name === 'pane.grow' ? '-R' : '-L', '5');
      else if (name === 'pane.close') {
        if (view.owner) throw new Error('This pane owns the call. Use quit to leave the call, or zoom to hide it.');
        this.dismissed.set(view.source, view.generation ?? 0); this.views.delete(view.pane); this.tags.delete(view.pane); await this.tmux.run('kill-pane', '-t', view.pane);
      } else if (name?.startsWith('pane.split.') || name === 'tmux.open') {
        const source = (arg ?? view.source) as Source;
        if (!this.sources.some(info => info.id === source && wanted(info))) throw new Error('That source is not active.');
         await this.open(source, name?.endsWith('horizontal') ? 'horizontal' : 'vertical', origin, false, valid);
      } else if (name === 'layout') {
        const names = Object.keys(this.options.config.layouts);
        await this.arrange(arg ?? names[(names.indexOf(this.layoutName) + 1) % names.length]!, valid);
      } else if (name === 'layout.save') {
        const saved = await this.tmux.run('display-message', '-p', '-t', this.window, '#{window_layout}');
        const layout = fromTmuxLayout(saved, views);
        await saveLayout(this.options.configPath, arg!, layout);
        this.options.config.layouts[arg!] = layout; this.layoutName = arg!;
      } else if ((action === 'renderer.blocks' || action === 'renderer.kitty') && this.options.presentation) this.options.presentation(action === 'renderer.blocks' ? 'blocks' : 'kitty');
      else this.options.control(action);
    });
  }
  async authorize(origin: string): Promise<void> {
    const requester = this.views.get(origin);
    if (this.closing || !requester || !await this.stillOwned(requester)) throw new Error('Action is not from a managed pane of this call.');
  }
  reconfigure(config: Config): Promise<void> {
    return this.queue(async () => {
      if (this.closing) return;
      this.options.config = config; await this.style();
      for (const view of await this.activeViews()) if (!this.closing) await this.tag(view.pane, view.source, this.sources.find(source => source.id === view.source)?.label ?? view.source);
    });
  }
  snapshot(): { session: string; panes: View[]; layout: string } {
    return { session: this.options.context.name, panes: [...this.views.values()], layout: this.layoutName };
  }
  private async closeView(view: View): Promise<void> {
    if (view.owner || !/^%\d+$/.test(view.pane) || !/^@\d+$/.test(this.window)
      || !/^[1-9]\d*$/.test(view.pid) || !/^[A-Za-z0-9_-]+$/.test(this.options.context.marker)
      || !/^[A-Za-z0-9_-]+$/.test(view.source)) return;
    // Evaluate identity in the tmux server, not a check-then-kill across async
    // observations. No shell, whole-session target, media owner or foreign pane.
    const proof = `#{==:#{window_id}|#{pane_pid}|#{@wbx_owner}|#{@wbx_source},${this.window}|${view.pid}|${this.options.context.marker}|${view.source}}`;
    await this.tmux.run('if-shell', '-F', '-t', view.pane, proof, `kill-pane -t ${view.pane}`);
  }
  close(): Promise<void> {
    if (this.closingResult) return this.closingResult;
    this.closing = true;
    this.pendingSources = undefined;
    clearInterval(this.watch);
    this.closingResult = (async () => {
      await deadline(() => this.tail, 1000).catch(() => {});
      // Broker loss deliberately leaves viewers in unknown state; it is NOT
      // their exit signal. The ending owner retires only its recorded children.
      await cleanupAll([
        ...[...this.views.values()].filter(view => !view.owner).map(view => () => this.closeView(view)),
        () => this.tmux.run('set-option', '-t', `=${this.options.context.name}`, '@wbx_state', 'ended'),
      ], 1000);
    })();
    return this.closingResult;
  }
}
