import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, readFile, stat, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { callIdentity, launchCall } from './call-launch.js';
import { configPath, loadConfig, readOAuthClientSecret } from './config.js';
import { Tmux } from './tmux.js';
import { ViewerHost } from './viewer.js';
import { validMeeting, type WorkerEvent } from './protocol.js';
import { EditorError } from './editor-engine.js';
import type { NativePaneIntent } from './native-panes.js';

export interface MeetingStart {
  mode: 'demo' | 'live'; meeting?: string; config?: string;
  display: 'auto' | 'kitty' | 'editor'; fallback: 'editor' | 'error';
  headless?: boolean; callId?: string;
}
/** Internal launch data contains only a protected socket address, never credentials. */
export function meetingWorkerArguments(options: MeetingStart, display: 'kitty' | 'editor', path: string, authorization?: { socket: string; config: string }): string[] {
  const args = [options.mode, '--renderer', display === 'kitty' ? 'kitty' : 'blocks', '--pixel-transport', 'auto'];
  if (options.config || authorization) args.push('--config', path);
  if (options.mode === 'demo') args.push('--participants', '3');
  if (options.mode === 'demo' && options.headless) args.push('--headless');
  if (options.mode === 'live') args.push('--auth', 'oauth', '--meeting', options.meeting!);
  if (authorization) args.push('--auth-socket', authorization.socket);
  return args;
}
async function available(program: string): Promise<boolean> {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) if (await access(join(directory, program), constants.X_OK).then(() => true, () => false)) return true;
  return false;
}
async function processEnded(pid: number): Promise<boolean> {
  try { process.kill(pid, 0); }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  // A container init may reap zombies later; an exited process owns no media.
  return readFile(`/proc/${pid}/status`, 'utf8').then(text => /^State:\s+Z/m.test(text), () => false);
}
/** A control client, not another Webex/media owner. Editor exit detaches by default. */
export class EditorMeetings extends EventEmitter {
  /** Internal Node-only resolver, not part of MeetingStart or any RPC snapshot. */
  authorization?: (config?: string) => Promise<{ socket: string; config: string } | undefined>;
  private tmux = new Tmux();
  private viewer?: ViewerHost;
  private pane = '';
  private session = '';
  private identity = '';
  private attach: string[] = [];
  private display: 'kitty' | 'editor' = 'editor';
  private desired: 'kitty' | 'blocks' = 'blocks';
  private timer?: ReturnType<typeof setTimeout>;
  private connecting?: number;
  private generation = 0;
  private deadline = 0;
  private busy = false;
  private active = false;
  private closed = false;
  private kitty?: ChildProcess;
  private presentation = 0;
  private presentationTimer?: ReturnType<typeof setTimeout>;
  private launchCompletion?: Promise<void>;
  private leaveRequested = false;
  private closing?: Promise<void>;
  private leaving?: Promise<void>;
  private ownerPid = 0;
  private controlsReady = false;
  private paneRevision = 0;
  private paneSignature = '';
  private controlFailed = false;
  snapshot() { return { active: this.active, session: this.session || null, ready: this.active && this.controlsReady && !!this.viewer && !this.viewer.disconnected, display: this.display, attach: this.attach,
    ...(this.active && this.controlsReady && this.viewer && !this.viewer.disconnected && this.viewer.paneSnapshot() ? { panes: { ...this.viewer.paneSnapshot()!, revision: this.paneRevision } } : {}) }; }
  private publish(): void { this.emit('state', this.snapshot()); }
  async start(options: MeetingStart): Promise<ReturnType<EditorMeetings['snapshot']>> {
    if (this.closed || this.busy || this.leaving) throw new EditorError(-32020, 'Meeting launch/leave is busy or closed.');
    this.busy = true;
    this.leaveRequested = false;
    let finish!: () => void;
    this.launchCompletion = new Promise<void>(resolve => { finish = resolve; });
    try {
      if (options.mode === 'live' && (!options.meeting || !validMeeting(options.meeting))) throw new EditorError(-32602, 'Use an HTTPS Webex meeting link.');
      if (options.mode === 'live' && options.headless) throw new EditorError(-32602, 'Live meetings cannot bypass headed device permissions.');
      const kitty = await available('kitty') && !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
      if (options.display === 'kitty' && !kitty) throw new EditorError(-32021, 'Kitty/display is unavailable. Force editor display or enable the editor fallback.');
      if (options.display === 'auto' && !kitty && options.fallback === 'error') throw new EditorError(-32021, 'Kitty/display is unavailable and editor fallback is disabled.');
      const display = options.display === 'editor' || !kitty ? 'editor' : 'kitty';
      const authorization = options.mode === 'live' && !this.active ? await this.authorization?.(options.config) : undefined;
      if (this.closed || this.leaveRequested) throw new EditorError(-32026, 'Meeting startup canceled before launch.');
      const path = configPath(authorization?.config ?? options.config), config = await loadConfig(path, !!options.config || !!authorization || !!process.env.WBX_CONFIG);
      if (options.mode === 'live' && (!config.oauth || !authorization && !await readOAuthClientSecret(path, config.oauth))) throw new EditorError(-32011, 'Configure OAuth and a private oauth.clientSecret before starting a meeting. Editor buffers never receive credentials.');
      const id = callIdentity(options.mode, options.meeting, options.callId);
      if (this.active && this.session !== id.name) throw new EditorError(-32020, 'Leave the active meeting before opening another.');
      if (!this.active || this.viewer && !this.controlsReady) {
        this.generation++; await this.viewer?.close(); this.viewer = undefined; this.controlsReady = false;
      }
      if (this.closed || this.leaveRequested) throw new EditorError(-32026, 'Meeting startup canceled before an owner was launched.');
      const args = meetingWorkerArguments(options, display, path, authorization);
      await launchCall({ mode: options.mode, meeting: options.meeting, callId: options.callId, args, detached: true, columns: 160, rows: 48 })
        .catch(() => { throw new EditorError(-32025, 'Could not start/reuse a verified tmux call owner. Existing work was left untouched.'); });
      this.session = id.name; this.identity = id.identity; this.display = display; this.desired = display === 'kitty' ? 'kitty' : 'blocks';
      this.ownerPid = await this.recordedPID(); this.active = true;
      if (this.leaveRequested) {
        throw new EditorError(-32026, 'Meeting startup canceled; explicit leave will stop the recorded owner.');
      }
      if (this.closed) throw new EditorError(-32020, 'Editor detached during launch. The tmux call may remain active.');
      const socket = await this.tmux.run('display-message', '-p', '-t', `=${this.session}`, '#{socket_path}');
      this.attach = ['tmux', '-S', socket, 'attach-session', '-t', this.session];
      this.controlFailed = false; this.deadline = Date.now() + 190_000; this.publish();
      this.presentation++; clearTimeout(this.presentationTimer);
      if (display === 'kitty') this.openKitty(options.fallback);
      else this.stopKitty();
      if (this.viewer) void this.applyPresentation(this.generation);
      else void this.connect(this.generation);
      return this.snapshot();
    } finally { this.busy = false; finish(); }
  }
  private openKitty(fallback: 'editor' | 'error'): void {
    if (this.kitty && this.kitty.exitCode === null && !this.kitty.killed) return;
    const generation = this.generation, presentation = this.presentation, env = { ...process.env }; delete env.TMUX; delete env.TMUX_PANE;
    const child = spawn('kitty', ['--title', 'wbx-tui meeting', ...this.attach], { stdio: 'ignore', env }); child.unref();
    this.kitty = child;
    let failed = false;
    const fail = () => {
      if (failed || this.closed || generation !== this.generation || presentation !== this.presentation) return; failed = true;
      if (fallback === 'editor') {
        this.display = 'editor'; this.desired = 'blocks'; this.presentationAction('blocks'); this.publish();
      } else this.emit('notice', 'Kitty launch failed; meeting remains active. Use the explicit editor presentation or leave.');
    };
    child.once('error', fail); child.once('exit', code => { if (code !== 0) fail(); });
  }
  private stopKitty(): void {
    // Only our own window process, never an existing Kitty server or call owner.
    this.kitty?.kill('SIGTERM'); this.kitty = undefined;
  }
  private presentationAction(renderer: 'kitty' | 'blocks'): void {
    const viewer = this.viewer;
    if (!viewer || !this.controlsReady) return;
    try { viewer.action(`renderer.${renderer}`, this.pane); }
    catch {
      this.controlsReady = false; this.publish();
      this.emit('notice', 'Presentation controls disconnected. Reattach the existing tmux owner; the call may still be active.');
    }
  }
  private async applyPresentation(generation: number, attempts = 0, presentation = this.presentation): Promise<void> {
    if (this.closed || generation !== this.generation || presentation !== this.presentation || !this.active) return;
    if (this.desired === 'blocks') { this.presentationAction('blocks'); return; }
    const clients = await this.tmux.run('list-clients', '-t', `=${this.session}`, '-F', '#{client_termname}').catch(() => '');
    if (this.closed || generation !== this.generation || presentation !== this.presentation) return;
    // An editor terminal may still be detaching while the new Kitty process
    // starts. Its presence is NOT proof that a pixel-capable client is ready.
    if (this.viewer && this.controlsReady && clients.split('\n').some(term => /kitty/i.test(term))) { this.presentationAction('kitty'); return; }
    if (attempts < 40) this.presentationTimer = setTimeout(() => { void this.applyPresentation(generation, attempts + 1, presentation); }, 125);
  }
  private async owned(): Promise<boolean> {
    return this.active && await this.tmux.run('show-options', '-qv', '-t', `=${this.session}`, '@wbx_call').catch(() => '') === this.identity;
  }
  private async recordedPID(): Promise<number> {
    const value = await this.tmux.run('show-options', '-qv', '-t', `=${this.session}`, '@wbx_media_pid');
    const pid = Number(value);
    if (!/^[1-9]\d{0,9}$/.test(value) || !Number.isSafeInteger(pid) || pid > 0x7fffffff) throw new EditorError(-32022, 'Verified media owner PID is unavailable.');
    return pid;
  }
  private async confirmEnd(generation: number, pid: number): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!this.closed && generation === this.generation && this.active) {
      const ended = await processEnded(pid);
      if (this.closed || generation !== this.generation) return;
      if (ended) { this.active = false; this.publish(); this.emit('event', { type: 'status', state: 'ended' }); return; }
      if (Date.now() >= deadline) {
        this.emit('notice', 'Meeting controls disconnected; the tmux media owner may still be active. Reattach or explicitly leave.'); return;
      }
      await delay(100);
    }
  }
  private async connect(generation: number): Promise<void> {
    if (this.connecting === generation || this.closed || !this.active || this.viewer) return;
    this.connecting = generation;
    try {
      const owned = await this.owned();
      if (this.closed || generation !== this.generation) return;
      if (!owned) { this.active = false; this.publish(); return; }
      const socket = await this.tmux.run('show-options', '-qv', '-t', `=${this.session}`, '@wbx_broker');
      const pane = await this.tmux.run('show-options', '-qv', '-t', `=${this.session}`, '@wbx_media_pane');
      if (!socket || !/^%\d+$/.test(pane)) return;
      const info = await stat(socket);
      if (!info.isSocket() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new Error('Unsafe meeting broker.');
      const viewer = await ViewerHost.open(socket);
      if (this.closed || generation !== this.generation) { await viewer.close(); return; }
      this.bindViewer(viewer, pane, generation);
      void this.applyPresentation(generation);
    } catch { /* owner may still be creating its socket; bounded admission below */ }
    finally {
      if (this.connecting === generation) this.connecting = undefined;
      if (!this.viewer && this.active && !this.closed && generation === this.generation) {
        if (Date.now() < this.deadline) this.timer = setTimeout(() => { void this.connect(generation); }, 250);
        else {
          this.controlFailed = true;
          this.emit('notice', 'Meeting initialization timed out; the tmux owner may remain active. Use :WebexMeetingReconnect or explicitly leave.');
        }
      }
    }
  }
  private bindViewer(viewer: ViewerHost, pane: string, generation: number): void {
    this.viewer = viewer; this.pane = pane; this.controlsReady = true; this.controlFailed = false; this.paneRevision++; this.paneSignature = '';
    const unavailable = () => {
      if (generation !== this.generation || this.closed || !this.controlsReady) return;
      this.controlsReady = false; this.controlFailed = true; this.publish();
      this.emit('notice', 'Meeting controls unavailable; media state is unknown. Use :WebexMeetingReconnect for the same owner, reattach tmux or explicitly leave.');
      if (!this.leaveRequested) void this.confirmEnd(generation, this.ownerPid);
    };
    viewer.on('disconnect', unavailable);
    viewer.on('event', (event: WorkerEvent) => {
      if (generation !== this.generation || this.closed) return;
      if (event.type === 'status' && event.state === 'ended') {
        unavailable();
        return; // only verified process exit acknowledges owner termination
      }
      if (['status', 'sources', 'participants', 'send-state', 'audio-state', 'camera-state', 'auth-state', 'presentation', 'notice'].includes(event.type)) this.emit('event', event);
    });
    viewer.on('notice', message => {
      if (generation === this.generation && !this.closed) this.emit('notice', message);
    });
    viewer.on('pane-capability', () => {
      if (generation !== this.generation || this.closed) return;
      const signature = JSON.stringify(viewer.paneSnapshot()) ?? '';
      if (signature === this.paneSignature) return;
      this.paneSignature = signature; this.paneRevision++; this.publish();
    });
    viewer.send({ type: 'start', mode: 'demo' });
    this.publish();
  }
  /** One explicit transport-only attempt. No launch, grant, toggle or presentation replay. */
  async reconnect(session: string): Promise<ReturnType<EditorMeetings['snapshot']>> {
    if (this.closed || this.busy || this.leaving || !this.active || session !== this.session)
      throw new EditorError(-32022, 'Original meeting session unavailable; no owner was launched.');
    this.busy = true;
    let finish!: () => void;
    this.launchCompletion = new Promise<void>(resolve => { finish = resolve; });
    const generation = ++this.generation, identity = this.identity, pid = this.ownerPid, pane = this.pane;
    clearTimeout(this.timer); clearTimeout(this.presentationTimer); this.presentation++;
    const old = this.viewer; this.viewer = undefined; this.controlsReady = false; this.controlFailed = true; this.publish();
    const valid = () => !this.closed && !this.leaveRequested && this.active && generation === this.generation
      && this.session === session && this.identity === identity && this.ownerPid === pid;
    let candidate: ViewerHost | undefined;
    try {
      await old?.close();
      const proof = async () => {
        if (!valid() || !await this.owned() || !valid()) throw new Error('Meeting session owner changed.');
        const [currentPid, currentPane, marker, socket] = await Promise.all(
          ['@wbx_media_pid', '@wbx_media_pane', '@wbx_owner', '@wbx_broker'].map(option =>
            this.tmux.run('show-options', '-qv', '-t', `=${session}`, option)));
        if (!valid() || currentPid !== String(pid) || !/^%\d+$/.test(currentPane!) || pane && currentPane !== pane
          || !/^[a-f0-9]{32}$/.test(marker!) || !socket || await processEnded(pid)) throw new Error('Original media owner unavailable.');
        const current = await this.tmux.run('display-message', '-p', '-t', currentPane!, '#{session_name}|#{pane_pid}|#{@wbx_owner}');
        const info = await lstat(socket);
        if (!valid() || current !== `${session}|${pid}|${marker}` || !info.isSocket()
          || info.uid !== process.getuid?.() || info.mode & 0o077) throw new Error('Unsafe or changed meeting broker/owner.');
        return { pane: currentPane!, socket, marker, dev: info.dev, ino: info.ino };
      };
      const before = await proof();
      candidate = await ViewerHost.open(before.socket);
      const after = await proof();
      if (!valid() || JSON.stringify(before) !== JSON.stringify(after) || candidate.disconnected)
        throw new Error('Meeting broker/owner changed during reconnect.');
      this.bindViewer(candidate, before.pane, generation); candidate = undefined;
      return this.snapshot();
    } catch {
      await candidate?.close();
      throw new EditorError(-32023, 'Original meeting owner/session/broker could not be verified. Controls unavailable; no join or action was replayed.');
    } finally { this.busy = false; finish(); }
  }
  async present(display: 'kitty' | 'editor', fallback: 'editor' | 'error' = 'editor') {
    if (this.closed || this.busy || this.leaving) throw new EditorError(-32020, 'Meeting launch/leave is busy or closed.');
    // Record intent BEFORE asynchronous ownership/executable checks. Otherwise
    // an older, slower Kitty request can overtake a newer editor request.
    const presentation = ++this.presentation; clearTimeout(this.presentationTimer);
    if (!await this.owned()) throw new EditorError(-32022, 'No active owned meeting.');
    if (display === 'kitty' && (!await available('kitty') || !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY))) throw new EditorError(-32021, 'Kitty/display is unavailable.');
    if (this.closed || presentation !== this.presentation) return this.snapshot();
    this.display = display; this.desired = display === 'kitty' ? 'kitty' : 'blocks';
    if (display === 'kitty') this.openKitty(fallback);
    else this.stopKitty();
    void this.applyPresentation(this.generation); this.publish(); return this.snapshot();
  }
  async action(action: string): Promise<number | undefined> {
    if (!['microphone.toggle', 'video.toggle', 'screen.toggle', 'audio.toggle', 'camera.toggle', 'auth.refresh', 'quit'].includes(action)) throw new EditorError(-32602, 'Unknown meeting control.');
    if (this.leaving && action !== 'quit') throw new EditorError(-32020, 'Meeting leave is in progress.');
    const generation = this.generation, session = this.session, viewer = this.viewer;
    if (this.closed || !await this.owned() || generation !== this.generation || session !== this.session || viewer !== this.viewer)
      throw new EditorError(-32022, 'No unchanged active owned meeting; nothing was sent.');
    if (this.viewer && this.controlsReady) {
      const pid = action === 'quit' ? await this.recordedPID() : undefined;
      if (pid !== undefined && pid !== this.ownerPid) throw new EditorError(-32022, 'Media owner changed; leave was not sent to a replacement.');
      this.viewer.action(action, this.pane); return pid;
    }
    if (action !== 'quit') throw new EditorError(-32023, this.controlFailed
      ? 'Meeting controls disconnected. Use :WebexMeetingReconnect; nothing was replayed.'
      : 'Meeting controls initializing. Wait, or explicitly :WebexMeetingReconnect after checking the owner.');
    const [pane, pid, marker] = await Promise.all(['@wbx_media_pane', '@wbx_media_pid', '@wbx_owner'].map(option =>
      this.tmux.run('show-options', '-qv', '-t', `=${this.session}`, option)));
    if (!/^%\d+$/.test(pane!) || !/^[1-9]\d{0,9}$/.test(pid!) || Number(pid) !== this.ownerPid || !/^[a-f0-9]{32}$/.test(marker!)) throw new EditorError(-32022, 'Exact startup owner is unavailable; no other pane was signaled.');
    const current = await this.tmux.run('display-message', '-p', '-t', pane!, '#{session_name}|#{pane_pid}|#{@wbx_owner}').catch(() => '');
    if (current !== `${this.session}|${pid}|${marker}`) throw new EditorError(-32022, 'Startup owner identity changed; no other pane was signaled.');
    process.kill(Number(pid), 'SIGINT'); return Number(pid);
  }
  async paneAction(session: string, intent: NativePaneIntent) {
    const generation = this.generation, viewer = this.viewer;
    if (this.closed || this.busy || this.leaving || !this.controlsReady || !viewer || this.session !== session
      || intent.revision !== this.paneRevision || !await this.owned() || generation !== this.generation
      || viewer !== this.viewer || this.session !== session || intent.revision !== this.paneRevision)
      throw new EditorError(-32023, 'Pane controls unavailable or session changed. Nothing was sent.');
    const capability = viewer.paneSnapshot();
    if (!capability) throw new EditorError(-32023, 'Owner pane capability missing. Nothing was sent.');
    const result = await viewer.nativePane({ ...intent, revision: capability.revision }, this.pane);
    if (generation !== this.generation || viewer !== this.viewer || this.session !== session)
      throw new EditorError(-32023, 'Pane result unknown after session change. Inspect the original owner; no retry was queued.');
    return { session, revision: intent.revision, action: intent.action, status: result.status };
  }
  async leave(ifActive = false): Promise<void> {
    if (this.leaving) return this.leaving;
    if (!this.active && !this.busy) {
      if (ifActive) return;
      throw new EditorError(-32022, 'No active owned meeting.');
    }
    this.leaveRequested = true;
    const pending = (async () => {
      if (this.busy) await this.launchCompletion;
      if (!this.active) return; // canceled before any owner was launched
      const pid = await this.action('quit');
      if (pid === undefined) throw new EditorError(-32022, 'Leave did not identify its exact media owner.');
      const deadline = Date.now() + 4000;
      // A broker disconnect is not proof of media termination. Confirm the
      // recorded process exited before acknowledging graceful editor shutdown.
      while (!await processEnded(pid)) {
        if (Date.now() >= deadline) throw new EditorError(-32027, 'Leave was requested but not confirmed. Check the tmux owner before assuming the call ended.');
        await delay(40);
      }
      this.active = false; this.publish(); this.emit('event', { type: 'status', state: 'ended' });
    })();
    this.leaving = pending;
    try { await pending; } finally { if (this.leaving === pending) this.leaving = undefined; }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true; this.generation++; clearTimeout(this.timer); clearTimeout(this.presentationTimer);
    this.closing = Promise.resolve().then(async () => {
      if (this.busy) await this.launchCompletion;
      await this.leaving?.catch(() => {});
      await this.viewer?.close(); this.viewer = undefined; this.controlsReady = false;
      if (this.leaveRequested && this.active) {
        // A forced editor shutdown may interrupt the broker confirmation. Only
        // an already-explicit leave intent permits signaling the verified PID.
        await this.leave(true).catch(() => this.emit('notice', 'Shutdown could not confirm leave. Check the tmux owner explicitly.'));
      }
      // Ordinary detach (leaveRequested=false) never signals the media owner.
    });
    return this.closing;
  }
}
