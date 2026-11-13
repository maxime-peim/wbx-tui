import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { MediaHost } from './host.js';
import { Metrics, browserRssMB } from './metrics.js';
import { MAX_WIDTH, MAX_HEIGHT, sendKinds, validMeeting, validSource, type CameraReason, type CameraState, type RendererMode, type SendKind, type SendState, type Source, type WorkerEvent } from './protocol.js';
import { ESC, KittyRenderer, MAX_GRAPHIC_ROWS, blocks, fit } from './render.js';
import { Terminal, PixelRenderError, askMeeting, askSecret, cleanText, geometry, probe, type Capabilities } from './terminal.js';
import { SharedFrames, singleGraphicsReader, type SharedFrame } from './shared-memory.js';
import { SDK_VERSION } from './sdk-version.js';
import { configPath, defaults, galleryLayout, loadConfig, resolveOAuthClientSecret, saveLayout, themes, type Config } from './config.js';
import { UI, content } from './ui.js';
import { Keymap } from './keys.js';
import { ViewerBroker, ViewerHost, serialCapture } from './viewer.js';
import { openTmuxViewer, Tmux } from './tmux.js';
import type { CellSize, GraphicsReply } from './terminal-input.js';
import { launchCall, readCallLaunch, type CallContext } from './call-launch.js';
import { CallPanes } from './call-panes.js';
import { OAuthError, OAuthSession } from './oauth.js';
import type { AccessCredentials, AuthMethod } from './auth-protocol.js';
import type { SharedOAuthClient } from './oauth-share.js';
import { runMessaging } from './messaging-cli.js';
import { runEditorWorker } from './editor-worker.js';
import { cleanupAll, deadline } from './lifecycle.js';

let startupViewer: ViewerHost | undefined;

const help = `Webex native tmux meeting client (sending OFF until explicitly enabled)

  npm start -- demo                       Real tmux call session; mock people + screen share
  npm start -- messages --demo            Vim-style messaging workspace; local-only sandbox
  npm start -- messages                   Persistent Webex spaces; hidden token/OAuth login
  npm start -- live                       Real tmux session identified by meeting link
  npm start -- probe                      Report terminal graphics capabilities
  npm start -- config                     Print effective JSON configuration (no browser)
  npm start -- view --session PATH --source ID   Read-only view of an existing owner

Options:
  --config PATH                           JSON config; default $XDG_CONFIG_HOME/wbx-tui/config.json
  --call-id NAME                          Override call session label (wbx-NAME)
  --detached                              Create/reuse the call session without attaching
  --layout NAME                           Native tmux layout; default gallery
  --no-mock-share                         Demo without its generated shared-screen pane
  --standalone                            Legacy single-terminal rendering test bench
  --participants NUMBER                   1–12 independently moving mock feeds (demo only)
  --renderer auto|kitty|blocks|browser     Default: auto
  --fallback blocks|browser               Default: blocks; browser must be explicit
  --pixel-transport auto|shm|inline        Default: auto; probes local RAM transport
  --pattern chart|noise                   Synthetic source; noise stresses real-video throughput
  --fps NUMBER                            1–30, default 15
  --width NUMBER --height NUMBER          Maximum pixel size, default 1280×720
  --cell-width NUMBER --cell-height NUMBER Override estimated cell pixel geometry
  --browser-path PATH                     Chrome/Chromium executable
  --foreground                            Keep owned browser visible for diagnosis
  --headless                              Synthetic-only testing; no browser fallback
  --duration SECONDS                      Stop automatically (default: unlimited)
  --meeting HTTPS_LINK                    Optional; meeting prompt is more private
  --auth token|oauth                      Live only; default hidden developer-token prompt
                                          OAuth uses config.oauth; private clientSecret is optional

Keys (all except Ctrl+C remappable): : commands, ? help, Tab focus, h/j/k/l navigate,
      Ctrl+w v/s split, Ctrl+w c close, Space m maximize, +/- resize, Space r reload.
      q/Esc/Ctrl+C quit, p pause, g pixels, t text blocks, b browser,
      a received audio, c local camera preview on/off (NOT sent),
      m meeting microphone, v meeting camera, d screen sharing (browser confirmation),
      u incoming participant roster, x Webex SPACE chat (not in-meeting chat),
      s focus next source pane.
All capture/sending is off by default. Meeting send controls require trusted browser confirmation and permission.
Browser may appear at startup and for camera permission prompts.
`;

async function main(): Promise<void> {
  let args = process.argv.slice(2), callContext: CallContext | undefined;
  if (args[0] === 'editor-worker') { await runEditorWorker(args.slice(1)); return; }
  if (args[0] === 'messages') { await runMessaging(args.slice(1)); return; }
  if (args[0] === 'call-worker') {
    if (args.length !== 3 || args[1] !== '--launch') throw new Error('Invalid call worker launch.');
    const launch = await readCallLaunch(args[2]!); args = launch.args; callContext = launch.context;
  }
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, renderer: { type: 'string' },
    fallback: { type: 'string' }, fps: { type: 'string' },
    config: { type: 'string' }, layout: { type: 'string' }, participants: { type: 'string' },
    session: { type: 'string' }, source: { type: 'string' },
    'call-id': { type: 'string' }, detached: { type: 'boolean' }, standalone: { type: 'boolean' },
    'native-view': { type: 'boolean' }, 'no-mock-share': { type: 'boolean' }, 'mock-share': { type: 'boolean' },
    'pixel-transport': { type: 'string', default: 'auto' }, pattern: { type: 'string', default: 'chart' },
    width: { type: 'string' }, height: { type: 'string' },
    'cell-width': { type: 'string' }, 'cell-height': { type: 'string' },
    'browser-path': { type: 'string' }, foreground: { type: 'boolean' }, headless: { type: 'boolean' },
    duration: { type: 'string', default: '0' }, meeting: { type: 'string' },
    auth: { type: 'string' },
    'auth-socket': { type: 'string' },
  } });
  const explicitValues = { ...values };
  if (values.help || !positionals.length) { process.stdout.write(help); return; }
  const command = positionals[0];
  if (values['auth-socket'] !== undefined && (!callContext || command !== 'live' || values.auth !== 'oauth')) throw new Error('Shared authorization is only accepted by an owned live call worker.');
  if (positionals.length !== 1 || !['demo', 'live', 'view', 'probe', 'config'].includes(command!)) throw new Error('Use demo, live, view, probe, or config. See --help.');
  if (values.auth !== undefined && (command !== 'live' || !['token', 'oauth'].includes(values.auth))) throw new Error('--auth token|oauth is live-only.');
  const ownsMedia = command !== 'view';
  const native = !!callContext || !!values['native-view'];
  const launchNative = (command === 'demo' || command === 'live') && !values.standalone && !callContext;
  if (!ownsMedia && (!values.session || !validSource(values.source))) throw new Error('view requires --session PATH and --source video|share|local|self|presenting|remote-N|mock-N.');
  if (ownsMedia && (values.session || values.source)) throw new Error('--session/--source are view-only. Use :source.set in a workspace.');
  const path = configPath(values.config);
  const initialLayout = launchNative || callContext ? 'gallery' : command === 'live' || !ownsMedia ? 'single' : 'gallery';
  let config = await loadConfig(path, !!values.config || !!process.env.WBX_CONFIG, initialLayout);
  if (values.auth === 'oauth' && !config.oauth) throw new Error('OAuth needs config.oauth: clientId, registered loopback redirectUri, and explicit scopes. See docs/oauth.md.');
  if (!ownsMedia) config.layout = 'single';
  const cliOverrides = { renderer: values.renderer, fallback: values.fallback, fps: values.fps, width: values.width, height: values.height, layout: values.layout };
  if (values.layout) {
    if (!Object.hasOwn(config.layouts, values.layout)) throw new Error(`Unknown layout: ${values.layout}`);
    config.layout = values.layout;
  }
  new Keymap(config);
  if (command === 'config') { process.stdout.write(JSON.stringify(config, null, 2) + '\n'); return; }
  values.renderer ??= config.renderer; values.fallback ??= config.fallback;
  values.fps ??= String(config.fps); values.width ??= String(config.width); values.height ??= String(config.height);
  if ((!process.stdin.isTTY || !process.stdout.isTTY) && !(launchNative && values.detached)) throw new Error('An interactive terminal is required (or use --detached for a native call session).');
  if (!['auto', 'kitty', 'blocks', 'browser'].includes(values.renderer!)) throw new Error('Unknown renderer.');
  if (!['blocks', 'browser'].includes(values.fallback!)) throw new Error('Unknown fallback.');
  if (!['auto', 'shm', 'inline'].includes(values['pixel-transport']!)) throw new Error('Unknown pixel transport.');
  if (!['chart', 'noise'].includes(values.pattern!) || (command === 'live' && values.pattern !== 'chart')) throw new Error('Use --pattern chart|noise with demo.');
  const number = (name: string, value: string | undefined, min: number, max: number) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    return n;
  };
  let fps = number('fps', values.fps, 1, 30);
  let maxWidth = number('width', values.width, 1, MAX_WIDTH), maxHeight = number('height', values.height, 1, MAX_HEIGHT);
  let participants = number('participants', values.participants ?? String(config.demoParticipants), 1, 12);
  let mockShare = command === 'demo' && !values['no-mock-share'] && (native || launchNative || !!values['mock-share']);
  const adaptGallery = (value: typeof config) => {
    if (command === 'demo' && !native && !launchNative && JSON.stringify(value.layouts.gallery) === JSON.stringify(defaults().layouts.gallery)) value.layouts.gallery = galleryLayout(participants);
  };
  adaptGallery(config);
  if (command === 'live' && values.participants) throw new Error('--participants is demo-only; mock participants are never inserted into live meetings.');
  const duration = number('duration', values.duration, 0, 86400);
  if (values.headless && (command === 'live' || values.renderer === 'browser' || values.fallback === 'browser' || values.foreground)) {
    throw new Error('--headless is synthetic-only and cannot show a browser fallback.');
  }
  if (launchNative) {
    let meeting = values.meeting;
    if (command === 'live') {
      await (await import('./host.js')).sdkAsset();
      if (!meeting && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('Detached live launch needs --meeting; enter the token privately after attaching.');
      meeting ??= await askMeeting();
    }
    const workerArgs: string[] = [command];
    const workerOptions = ['config', 'layout', 'participants', 'renderer', 'fallback', 'fps', 'pixel-transport', 'pattern',
      'width', 'height', 'cell-width', 'cell-height', 'browser-path', 'foreground', 'headless', 'duration', 'no-mock-share', 'mock-share', 'auth'] as const;
    for (const key of workerOptions) {
      const value = explicitValues[key];
      if (typeof value === 'string') workerArgs.push(`--${key}`, value);
      else if (value === true) workerArgs.push(`--${key}`);
    }
    if (meeting) workerArgs.push('--meeting', meeting);
    await launchCall({ mode: command, meeting, callId: values['call-id'], args: workerArgs, detached: !!values.detached,
      columns: process.stdout.columns, rows: process.stdout.rows });
    return;
  }
  if (callContext && !values.headless && values.renderer !== 'blocks') {
    const tmux = new Tmux();
    while (await tmux.run('display-message', '-p', '-t', `=${callContext.name}`, '#{session_attached}') === '0') await delay(100);
  }
  const sharedFrames = new SharedFrames();
  // Connect before probing: tmux sends terminal replies to the active pane,
  // including an owner's ACK that arrives while this new pane is starting up.
  if (!ownsMedia) startupViewer = await ViewerHost.open(values.session!);
  const replyRelay = startupViewer ? {
    send: (reply: GraphicsReply) => startupViewer!.forwardReply(reply),
    listen: (listener: (reply: GraphicsReply) => void) => {
      startupViewer!.on('graphics-reply', listener);
      return () => { startupViewer!.off('graphics-reply', listener); };
    },
    sendCell: (size: CellSize) => startupViewer!.forwardCell(size),
    listenCell: (listener: (size: CellSize) => void) => {
      startupViewer!.on('cell-size', listener);
      return () => { startupViewer!.off('cell-size', listener); };
    },
  } : undefined;
  let probeFrame: SharedFrame | undefined;
  if (values['pixel-transport'] !== 'inline' && await SharedFrames.supported() && await singleGraphicsReader()) {
    try { probeFrame = await sharedFrames.create(Uint8Array.from([0, 0, 0, 255])); } catch { /* inline fallback */ }
  }
  let caps: Capabilities;
  try { caps = await probe(process.stdin, process.stdout, !!process.env.TMUX, probeFrame?.name, replyRelay); }
  finally { await probeFrame?.release(); }
  if (values['pixel-transport'] === 'shm' && !caps.sharedMemory) {
    throw new Error('Shared memory is not accessible to this terminal (or multiple tmux clients show this window). Use --pixel-transport inline.');
  }
  let pixelTransport = caps.sharedMemory && values['pixel-transport'] !== 'inline' ? 'shm' : 'inline';
  if (values['cell-width']) { caps.cellWidth = number('cell-width', values['cell-width'], 1, 100); caps.measured = false; }
  if (values['cell-height']) { caps.cellHeight = number('cell-height', values['cell-height'], 1, 200); caps.measured = false; }
  let supportsPixels = caps.kitty && caps.placeholders && caps.frameEditing;
  if (command === 'probe') { console.log(JSON.stringify(caps, null, 2)); return; }
  let mode: Exclude<RendererMode, 'auto'> = values.renderer === 'auto'
    ? supportsPixels ? 'kitty' : values.fallback as 'blocks' | 'browser'
    : values.renderer as Exclude<RendererMode, 'auto'>;
  if (!ownsMedia && mode === 'browser') throw new Error('Read-only viewers support kitty/blocks, not another browser.');
  let meeting: string | undefined, token: string | undefined;
  let oauth: OAuthSession | SharedOAuthClient | undefined, access: AccessCredentials | undefined;
  if (command === 'live') {
    await (await import('./host.js')).sdkAsset();
    meeting = values.meeting ?? await askMeeting();
    if (!validMeeting(meeting)) throw new Error('Use an HTTPS link on webex.com or a *.webex.com site.');
    if (values.auth === 'oauth') {
      if (!config.oauth) throw new Error('OAuth needs config.oauth: clientId, registered loopback redirectUri, and explicit scopes. See docs/oauth.md.');
      if (values['auth-socket']) {
        const shared = await import('./oauth-share.js');
        const lease = await shared.openMeetingAuthorization(values['auth-socket'], config.oauth.clientId);
        oauth = lease.oauth; access = lease.access; token = access.token;
        process.stderr.write('Reusing the connected login through a private in-memory authorization lease. No second sign-in.\n');
      } else {
        const secret = await resolveOAuthClientSecret(path, config.oauth,
          () => askSecret(process.stdin, process.stderr, 'Webex integration client secret (hidden; owner memory only): '));
        oauth = new OAuthSession(config.oauth, secret);
      }
    } else token = await askSecret();
  }
  process.stderr.write(ownsMedia ? `Starting isolated ${values.headless ? 'headless' : 'headed'} Chrome (${command}). Preview off; meeting microphone/camera/share OFF.\n`
    : 'Connecting read-only viewer. No browser, meeting join, audio or capture ownership.\n');
  process.stderr.write(`Pixel transport: ${pixelTransport === 'shm' ? 'shared memory (RGBA, local RAM)' : 'inline (PNG/base64)'}.\n`);
  const startupAbort = new AbortController();
  const cancelStartup = () => startupAbort.abort();
  process.on('SIGINT', cancelStartup); process.on('SIGTERM', cancelStartup); process.on('SIGHUP', cancelStartup);
  let host: MediaHost | ViewerHost;
  let openedHost: MediaHost | ViewerHost | undefined;
  try {
    const owner = ownsMedia ? await import('./host.js') : undefined;
    host = openedHost = owner ? await owner.MediaHost.open({ browserPath: values['browser-path'], headless: values.headless, live: command === 'live', signal: startupAbort.signal })
      : startupViewer!;
    if (oauth instanceof OAuthSession && owner && host instanceof owner.MediaHost) {
      const login = oauth;
      const page = await host.page.browserContext().newPage();
      const cancelLogin = () => oauth?.close(); page.once('close', cancelLogin);
      try {
        process.stderr.write('Sign in and approve the registered scopes in the owned browser. OAuth credentials are not saved. Ctrl+C cancels.\n');
        access = await login.authorize(async url => {
          await host.visible(true);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }); await page.bringToFront();
        }, startupAbort.signal);
        token = access.token;
      } finally { page.off('close', cancelLogin); await page.close().catch(() => {}); }
    }
    startupAbort.signal.throwIfAborted();
  } catch (error) {
    await cleanupAll([() => oauth?.close(), () => openedHost?.close()], 8000); throw error;
  } finally {
    process.off('SIGINT', cancelStartup); process.off('SIGTERM', cancelStartup); process.off('SIGHUP', cancelStartup);
  }
  const terminal = new Terminal();
  const renderers = new Map<number, KittyRenderer>();
  const clearImages = () => [...renderers.values()].map(renderer => renderer.clear()).join('');
  const metrics = new Metrics();
  const abort = new AbortController();
  const capture = serialCapture((request, signal) => host.capture(request, signal));
  let broker: ViewerBroker | undefined;
  let callPanes: CallPanes | undefined;
  terminal.forwardReply = ownsMedia ? reply => broker?.forwardReply(reply) : reply => startupViewer!.forwardReply(reply);
  terminal.forwardCell = ownsMedia ? size => broker?.forwardCell(size) : size => startupViewer!.forwardCell(size);
  if (!ownsMedia) startupViewer!.on('graphics-reply', reply => terminal.receiveReply(reply));
  let running = true, paused = false, state = 'starting';
  let presentationPause: boolean | undefined;
  let audio = false, notice = !caps.measured ? 'cell size estimated/overridden' : '';
  let authMethod: AuthMethod | undefined, authState = '';
  let refreshing: number | undefined;
  let generation = 0, fatal: Error | undefined, opened = false;
  const lastFrames = new Map<number, string>();
  let screenKey = '', lastLabels = '';
  let renderFault = '';
  let cameraState: CameraState = 'off', cameraWanted = false, selectPreview = false, cameraAttempt = 0;
  let cameraFailure: CameraReason | undefined;
  const sendWanted: Record<SendKind, boolean> = { microphone: false, camera: false, screen: false };
  const sendStates: Record<SendKind, SendState> = { microphone: 'off', camera: 'off', screen: 'off' };
  const sendAttempts: Record<SendKind, number> = { microphone: 0, camera: 0, screen: 0 };
  let transition: Promise<void> = Promise.resolve();
  let presentationSequence = 0;
  let ownerStopped: Promise<void> | undefined;
  const quit = () => {
    if (!running) return;
    running = false; generation++; presentationSequence++;
    // Start the independent hard stop NOW, not after render/visibility/probe
    // queues drain (the render loop itself may be waiting on one of them).
    ownerStopped = deadline(() => host.close(), 8000).catch(() => {});
    try { oauth?.close(); } catch { /* owner stop is already armed */ }
    abort.abort();
  };
  const ui = new UI(config, action => {
    if (!running) return;
    if (native && !ownsMedia && action !== 'pause' && action !== 'renderer.kitty' && action !== 'renderer.blocks') {
      if (action === 'quit' && startupViewer!.disconnected) { quit(); return; } // detach the unavailable view, not the owner
      try { startupViewer!.action(action, process.env.TMUX_PANE!); } catch (error) { ui.notice = (error as Error).message; }
      return;
    }
    if (callPanes && (/^(focus\.|pane\.|source\.|tmux\.open|layout(?: |$)|layout\.save )/.test(action))) {
      void callPanes.action(action).catch(error => { ui.notice = (error as Error).message; }); return;
    }
    if (action === 'quit') quit();
    else if (action === 'pause') {
      if (presentationPause !== undefined) { presentationPause = !presentationPause; generation++; }
      else if (renderFault) change(mode);
      else { paused = !paused; generation++; }
    }
    else if (action.startsWith('renderer.')) change(action.slice(9) as Exclude<RendererMode, 'auto'>);
    else if (action === 'camera.toggle') requestCamera(!cameraWanted);
    else if (action === 'microphone.toggle') requestSend('microphone', !sendWanted.microphone);
    else if (action === 'video.toggle') requestSend('camera', !sendWanted.camera);
    else if (action === 'screen.toggle') requestSend('screen', !sendWanted.screen);
    else if (action === 'auth.refresh') {
      if (!oauth) { ui.notice = 'Credential renewal requires --auth oauth.'; return; }
      host.send({ type: 'oauth-renew' });
    }
    else if (action === 'audio.toggle') { try { host.send({ type: 'audio', enabled: !audio }); } catch { ui.notice = 'Audio command failed.'; } }
    else if (action.startsWith('theme ' ) || action === 'theme') {
      const name = action.split(' ')[1] ?? 'midnight';
      if (!Object.hasOwn(themes, name)) { ui.notice = `Unknown theme: ${name}`; return; }
      config.theme = { ...themes[name]! }; ui.reconfigure(config); broker?.configure(config);
      void callPanes?.reconfigure(config).catch(error => { ui.notice = (error as Error).message; });
    }
    else if (action.startsWith('mock.')) {
      if (command !== 'demo') { ui.notice = 'Mock controls are available only in demo calls.'; return; }
      if (action === 'mock.add') participants = Math.min(12, participants + 1);
      if (action === 'mock.remove') participants = Math.max(1, participants - 1);
      if (action === 'mock.share') mockShare = !mockShare;
      host.send({ type: 'demo-update', participants, share: mockShare });
    }
    else if (action.startsWith('tmux.open')) {
      if (!ownsMedia) { ui.notice = 'Open additional tmux viewers from the session owner.'; return; }
      if (!process.env.TMUX) { ui.notice = 'tmux.open needs an attached tmux pane.'; return; }
      const source = (action.split(' ')[1] ?? ui.workspace.selected().source) as Source;
      transition = transition.then(async () => {
        if (!running) return;
        broker ??= await ViewerBroker.open(capture, abort.signal);
        if (!running) { await broker.close(); return; }
        broker.onReply = reply => terminal.receiveReply(reply);
        broker.publish({ type: 'sources', sources: ui.sources });
        await openTmuxViewer(broker.path, source, path, mode === 'kitty' ? 'kitty' : 'blocks');
        ui.notice = `Opened read-only ${source} in tmux. One media worker; audio stays here.`;
      }).catch(error => { ui.notice = (error as Error).message; });
    }
    else if (action.startsWith('layout.save ')) {
      const name = action.split(' ')[1]!;
      const layout = ui.workspace.layout();
      transition = transition.then(async () => {
        if (!running) return;
        await saveLayout(path, name, layout); config.layouts[name] = layout; ui.layoutName = name;
        ui.notice = `Saved layout ${name} to ${path}`;
      }).catch(error => { ui.notice = (error as Error).message; });
    }
    else if (action === 'reload') {
      transition = transition.then(async () => {
        if (!running) return;
        const next = await loadConfig(path, true, initialLayout);
        if (!running) return;
        adaptGallery(next);
        if (cliOverrides.layout) next.layout = cliOverrides.layout;
        const requested = cliOverrides.renderer ?? next.renderer;
        const nextMode = requested === 'auto' ? supportsPixels ? 'kitty' : cliOverrides.fallback ?? next.fallback : requested;
        if (nextMode === 'browser' && (values.headless || !ownsMedia)) throw new Error('Reload refused: this workspace cannot own a browser view.');
        ui.reconfigure(next); config = next;
        broker?.configure(config); await callPanes?.reconfigure(config);
        if (!running) return;
        fps = Number(cliOverrides.fps ?? config.fps); maxWidth = Number(cliOverrides.width ?? config.width); maxHeight = Number(cliOverrides.height ?? config.height);
        ui.notice = `Reloaded ${path}. Existing panes and meeting preserved; participant count applies on restart.`;
        generation++;
        if (nextMode !== mode) change(nextMode as Exclude<RendererMode, 'auto'>);
      }).catch(error => { ui.notice = (error as Error).message; });
    }
  }, native);
  ui.chat.onRequest = request => {
    if (!running) throw new Error('Call ended.');
    if (!ownsMedia) {
      if (!native) throw new Error('Read-only viewer.');
      startupViewer!.chat(request, process.env.TMUX_PANE!);
    } else host.send(request);
  };
  host.on('notice', (message: string) => { ui.notice = message; });
  host.on('disconnect', () => {
    if (ownsMedia || !running) return;
    state = 'control unavailable / media unknown'; paused = true; generation++;
    authState = 'unknown'; screenKey = ''; lastFrames.clear(); lastLabels = '';
    notice = 'Viewer disconnected; the meeting owner may still be active. Reattach explicitly; quit only closes this view.';
    ui.notice = notice;
  });
  host.on('redraw', () => change(mode));
  if (native && !ownsMedia) host.on('config', (next: Config) => {
    ui.reconfigure(next); config = next;
    fps = Number(cliOverrides.fps ?? config.fps); maxWidth = Number(cliOverrides.width ?? config.width); maxHeight = Number(cliOverrides.height ?? config.height);
    generation++;
    const requested = cliOverrides.renderer ?? config.renderer;
    const nextMode = requested === 'auto' ? supportsPixels ? 'kitty' : config.fallback : requested;
    if (nextMode !== mode) change(nextMode === 'browser' ? 'blocks' : nextMode as 'kitty' | 'blocks');
  });
  if (!ownsMedia) ui.workspace.source(values.source as Source);
  const onEvent = (event: WorkerEvent) => {
    if (!running) return;
    if (event.type === 'presentation') void present(event.renderer);
    if (event.type !== 'sources') broker?.publish(event);
    if (event.type === 'status') { state = event.state; if (event.state === 'ended') quit(); }
    if (event.type === 'audio-state') audio = event.enabled;
    if (event.type === 'auth-state') {
      authMethod = event.method; authState = event.state;
      if (event.state === 'failed') ui.notice = `Authentication ${event.reason ?? 'failed'}; leave and sign in again.`;
      if (ownsMedia && running && event.method === 'oauth' && event.state === 'ready' && event.expiresAt) {
        oauth?.watch(event.expiresAt, () => host.send({ type: 'oauth-renew' }), reason => {
          ui.notice = `OAuth ${reason}; SDK credentials were not renewed. Local media stopping.`; quit();
        });
        if (oauth && !(oauth instanceof OAuthSession)) {
          oauth.onAccess = () => { if (running) host.send({ type: 'oauth-renew' }); };
          if (oauth.hasUpdate) oauth.onAccess();
        }
      }
    }
    if (event.type === 'oauth-refresh' && ownsMedia && running && refreshing === undefined) {
      const requestId = refreshing = event.requestId;
      void (oauth ? oauth.refresh() : Promise.reject(new OAuthError('failed', 'OAuth unavailable.'))).then(credentials => {
        if (running) host.send({ type: 'oauth-token', requestId, credentials });
      }).catch(error => {
        if (!running) return;
        const reason = error instanceof OAuthError ? error.reason : 'failed';
        ui.notice = `OAuth renewal ${reason}; sign in again. Local media stopping.`;
        try { host.send({ type: 'oauth-failed', requestId, reason }); } catch { /* quit closes the owned browser */ }
        quit();
      }).finally(() => { refreshing = undefined; });
    }
    if (event.type === 'chat-state') ui.chat.update(event.chat, ui.overlay === 'chat');
    if (event.type === 'chat-result') ui.chat.result(event);
    if (event.type === 'sources') {
      const current = ui.workspace.selected().source;
      const before = ui.sources.find(source => source.id === current), after = event.sources.find(source => source.id === current);
      if (before?.generation !== after?.generation || before?.available !== after?.available || before?.label !== after?.label) { ui.revision++; generation++; }
      ui.sources = event.sources; broker?.publish(event);
      void callPanes?.sync(event.sources).catch(error => { ui.notice = (error as Error).message; });
    }
    if (event.type === 'camera-request') requestCamera(event.enabled);
    if (event.type === 'notice') ui.notice = event.message;
    if (event.type === 'send-request') requestSend(event.kind, event.enabled);
    if (event.type === 'send-state' && (!ownsMedia || event.requestId === sendAttempts[event.kind])) {
      sendStates[event.kind] = event.state;
      if (ownsMedia) {
        if (event.state === 'on' && !sendWanted[event.kind]) { requestSend(event.kind, false); return; }
        if (event.state === 'off') sendWanted[event.kind] = false;
        if (event.reason) ui.notice = `${event.kind}: ${event.reason}; capture stopped.`;
        else if (event.state === 'on') ui.notice = `${event.kind}: SENDING to the meeting. Toggle again to stop.`;
        else if (event.state === 'off') ui.notice = `${event.kind}: capture stopped.`;
        if (event.state === 'on' || event.state === 'off') syncCameraVisibility();
      }
    }
    if (event.type === 'camera-state' && event.requestId === cameraAttempt) {
      cameraState = event.state;
      if (!running) return;
      if (event.state === 'on' && !cameraWanted) { requestCamera(false); return; }
      if (event.state === 'on' && cameraWanted && selectPreview) {
        selectPreview = false; if (!native) ui.workspace.source('local'); change(mode);
      }
      if (event.state === 'off') {
        cameraWanted = false; selectPreview = false;
        cameraFailure = event.reason;
        for (const pane of ui.workspace.panes()) if (pane.source === 'local') pane.source = 'video';
        ui.workspace.revision++;
        if (event.reason) notice = `Local preview ${event.reason}; preview is never published.`;
      }
      if (event.state !== 'starting') syncCameraVisibility();
    }
    if (event.type === 'error') {
      notice = event.stage === 'sdk' ? 'SDK load failed; run npm run sdk' : `${event.stage} failed; inspect test account/network/policy`;
      if (event.stage === 'sdk' || event.stage === 'join') { fatal = new Error(notice); quit(); }
    }
  };
  host.on('event', onEvent);
  host.on('fault', (error: Error) => { fatal = error; quit(); });
  const change = (next: Exclude<RendererMode, 'auto'>) => {
    if (!running) return;
    if (!ownsMedia && next === 'browser') { ui.notice = 'Use browser view in the owner workspace.'; return; }
    if (next === 'browser' && values.headless) { notice = 'headless demo cannot reveal a window'; return; }
    if (next === 'kitty' && !supportsPixels && values.renderer !== 'kitty') {
      notice = 'pixels not detected; use --renderer kitty to force after checking tmux'; return;
    }
    generation++; mode = next;
    if (renderFault) { paused = false; renderFault = ''; }
    screenKey = ''; lastFrames.clear(); lastLabels = '';
    transition = transition.then(async () => {
      // Drawing/cleanup belongs to the render loop, never a resize callback
      // running in parallel with a frame's output/processing fence.
      if (running && !values.headless) await host.visible(next === 'browser' || !!values.foreground || needsPermissionUI());
    }).catch(() => { notice = 'browser visibility change failed'; });
  };
  let presentationQueue = Promise.resolve();
  const present = async (renderer: 'kitty' | 'blocks') => {
    if (!running) return;
    const request = ++presentationSequence;
    if (presentationPause === undefined) presentationPause = paused;
    paused = true; generation++;
    // Probes temporarily own terminal input mode. Never overlap them, including
    // a rapid Kitty -> blocks -> Kitty switch, or inherit the temporary pause.
    const operation = presentationQueue.then(async () => {
    if (request !== presentationSequence || !running) return;
    if (renderer === 'blocks') { paused = presentationPause ?? false; presentationPause = undefined; change('blocks'); return; }
    let memory: SharedFrame | undefined;
    try {
      if (values['pixel-transport'] !== 'inline' && await SharedFrames.supported() && await singleGraphicsReader()) {
        memory = await sharedFrames.create(Uint8Array.from([0, 0, 0, 255])).catch(() => undefined);
      }
      if (request !== presentationSequence || !running) return;
      const relay = replyRelay ?? (broker ? {
        send: (reply: import('./terminal-input.js').GraphicsReply) => broker!.forwardReply(reply),
        listen: (listener: (reply: import('./terminal-input.js').GraphicsReply) => void) => { broker!.on('graphics-reply', listener); return () => { broker!.off('graphics-reply', listener); }; },
        listenCell: (listener: (size: CellSize) => void) => { broker!.on('cell-size', listener); return () => { broker!.off('cell-size', listener); }; },
      } : undefined);
      const fresh = await probe(process.stdin, process.stdout, caps.tmux, memory?.name, relay);
      if (request !== presentationSequence || !running) return;
      caps = fresh; supportsPixels = fresh.kitty && fresh.placeholders && fresh.frameEditing;
      pixelTransport = fresh.sharedMemory && values['pixel-transport'] !== 'inline' ? 'shm' : 'inline';
      paused = presentationPause ?? false; presentationPause = undefined; change(supportsPixels ? 'kitty' : 'blocks');
      if (!supportsPixels) ui.notice = 'Kitty pixels were not acknowledged; keeping the same call in blocks.';
    } catch { if (request === presentationSequence && running) { paused = presentationPause ?? false; presentationPause = undefined; change('blocks'); } }
    finally { await memory?.release(); if (running) process.stdin.resume(); }
    });
    presentationQueue = operation.catch(() => {});
    await presentationQueue;
  };
  const syncCameraVisibility = () => {
    transition = transition.then(async () => {
      if (!values.headless && running) await host.visible(mode === 'browser' || !!values.foreground || needsPermissionUI());
    }).catch(() => { notice = 'Could not update the owned browser visibility.'; });
  };
  const needsPermissionUI = () => (cameraWanted && cameraState !== 'on') || sendKinds.some(kind => sendWanted[kind] && sendStates[kind] !== 'on');
  const requestSend = (kind: SendKind, enabled: boolean) => {
    if (!running) return;
    if (enabled && (command !== 'live' || state !== 'connected')) { ui.notice = 'Sending requires a connected live meeting; demo never sends or captures devices for meeting controls.'; return; }
    if (enabled && values.headless) { ui.notice = 'Sending requires a headed browser for explicit confirmation and permission.'; return; }
    sendWanted[kind] = enabled;
    const requestId = sendAttempts[kind] = sendAttempts[kind] % 0xffffffff + 1;
    if (!enabled) {
      try { host.send({ type: 'send', kind, enabled: false, requestId }); }
      catch { ui.notice = `Could not stop ${kind}; quit to close the media owner.`; }
      syncCameraVisibility(); return;
    }
    sendStates[kind] = 'awaiting';
    ui.notice = `Confirm ${kind} SENDING in the owned browser. Local preview is separate.`;
    transition = transition.then(async () => {
      if (!running || !sendWanted[kind] || sendAttempts[kind] !== requestId) return;
      await host.visible(true);
      if (running && sendWanted[kind] && sendAttempts[kind] === requestId) host.send({ type: 'send', kind, enabled: true, requestId });
    }).catch(() => {
      if (sendAttempts[kind] === requestId) { sendWanted[kind] = false; sendStates[kind] = 'off'; }
      ui.notice = `Could not request ${kind}; sending remains off.`;
    });
  };
  const requestCamera = (enabled: boolean) => {
    if (!running) return;
    if (!ownsMedia) { ui.notice = 'Camera capture is controlled only by the session owner.'; return; }
    if (enabled && values.headless) { notice = 'Camera preview needs a headed browser for explicit permission.'; return; }
    cameraWanted = enabled; selectPreview = enabled;
    cameraFailure = undefined;
    const requestId = cameraAttempt = (cameraAttempt % 0xffffffff) + 1;
    if (!enabled) {
      try { host.send({ type: 'camera', enabled: false, requestId }); }
      catch { notice = 'Could not stop local camera preview; quit to close the owned browser.'; }
      for (const pane of ui.workspace.panes()) if (pane.source === 'local') pane.source = 'video';
      ui.workspace.revision++;
      syncCameraVisibility();
      return;
    }
    notice = 'Allow camera permission in the owned browser. Preview only; NOT sent to Webex.';
    // The permission UI must stay reachable. No automatic permission grants.
    transition = transition.then(async () => {
      if (!running || !cameraWanted || cameraAttempt !== requestId) return;
      await host.visible(true);
      if (running && cameraWanted && cameraAttempt === requestId) host.send({ type: 'camera', enabled: true, requestId });
    }).catch(() => {
      if (cameraAttempt === requestId) { cameraWanted = false; selectPreview = false; }
      notice = 'Could not request camera preview. Camera remains off; try again or use browser view.';
    });
  };
  const cameraLabel = () => !ownsMedia ? native ? 'view / call controls' : 'read-only / no publishing' : cameraState === 'on' ? 'preview ON / NOT SENT' : cameraWanted ? 'preview requesting / NOT SENT'
    : `preview off${cameraFailure ? ` (${cameraFailure})` : ''}`;
  const sendLabel = (kind: SendKind) => !ownsMedia && startupViewer!.disconnected ? 'unknown' : sendStates[kind] === 'on' ? 'ON' : sendStates[kind] === 'off' ? 'off' : 'pending';
  const statusLine = () => `WBX ${callContext?.name ?? (native && values['call-id'] ? `wbx-${values['call-id']}` : command)} | mic ${sendLabel('microphone')} cam ${sendLabel('camera')} share ${sendLabel('screen')} | ${state}${authMethod ? ` / ${authMethod} ${authState}` : ''} | ${mode}${paused ? ' | PAUSED' : ''} | ${cameraLabel()} | Rx audio ${!ownsMedia && startupViewer!.disconnected ? 'unknown' : audio ? 'on' : 'off'}`;
  const onResize = () => { generation++; change(mode); };
  process.on('SIGINT', quit); process.on('SIGTERM', quit); process.on('SIGHUP', quit);
  process.stdout.on('resize', onResize);
  const timer = duration ? setTimeout(quit, duration * 1000) : undefined;
  let rss: number | null = null;
  try {
    opened = true;
    await terminal.open(key => ui.key(key), true);
    if (!running) return;
    change(mode);
    if (callContext) {
      broker = await ViewerBroker.open(capture, abort.signal);
      if (!running) return;
      broker.onReply = reply => terminal.receiveReply(reply);
      broker.configure(config);
      callPanes = new CallPanes({ context: callContext, socket: broker.path, configPath: path, config,
        renderer: cliOverrides.renderer === 'browser' ? 'blocks' : cliOverrides.renderer as 'auto' | 'kitty' | 'blocks' | undefined,
        pixelTransport: values['pixel-transport']!,
        viewerArgs: ['fps', 'width', 'height', 'cell-width', 'cell-height'].flatMap(key => {
          const value = explicitValues[key as keyof typeof explicitValues];
          return typeof value === 'string' ? [`--${key}`, value] : [];
        }),
        resetDisplay: () => { broker?.redraw(); change(mode); },
        presentation: renderer => { void present(renderer); broker?.publish({ type: 'presentation', renderer }); },
        control: action => ui.dispatch(action) });
      broker.onAction = (action, pane) => callPanes!.action(action, pane);
      broker.onNativePane = (intent, pane, valid) => callPanes!.nativeAction(intent, pane, valid);
      await callPanes.start();
      if (!running) return;
      broker.onChat = async (request, pane) => {
        await callPanes!.authorize(pane);
        if (!running) throw new Error('Call ended.');
        host.send(request);
      };
    }
    if (command === 'live' && oauth && !(oauth instanceof OAuthSession)) {
      access = await oauth.access(); token = access.token;
      if (!running) return;
    }
    host.send(command === 'demo' ? { type: 'start', mode: 'demo', pattern: values.pattern as 'chart' | 'noise', participants, mockShare }
      : { type: 'start', mode: 'live', token, meeting, ...(access ? { oauth: { expiresAt: access.expiresAt, scope: access.scope, clientId: config.oauth!.clientId } } : {}) });
    token = undefined; access = undefined;
    while (running) {
      const started = performance.now();
      await deadline(() => transition, 15_000, 'Presentation transition timed out.', abort.signal);
      if (!running) break;
      const size = geometry(process.stdout, caps);
      ui.size = size;
      const epochKey = () => `${generation}:${ui.workspace.revision}:${ui.revision}`;
      const epoch = epochKey();
      const nextScreen = `${ui.workspace.revision}:${ui.revision}:${mode}:${size.columns}x${size.rows}:${ui.overlay ?? ''}`;
      if (screenKey !== nextScreen) {
        await terminal.write(clearImages() + `${ESC}[2J` + ui.fill({ x: 1, y: 1, width: size.columns, height: size.rows }) + ui.chrome(statusLine(), notice));
        const active = new Set(ui.workspace.panes().map(pane => pane.id));
        for (const id of renderers.keys()) if (!active.has(id)) renderers.delete(id);
        lastFrames.clear(); lastLabels = ''; screenKey = nextScreen;
      }
      if (!paused && mode !== 'browser' && !ui.overlay) for (const pane of ui.workspace.positions(size.columns, size.rows - 3)) {
        if (!running || epoch !== epochKey()) break;
        const area = native ? { x: 1, y: 2, width: size.columns, height: size.rows - 3 } : content(pane);
        if (area.width < 1 || area.height < 1) continue;
        const rows = Math.min(MAX_GRAPHIC_ROWS, area.height);
        const [width, height] = mode === 'kitty'
          ? fit(maxWidth, maxHeight, area.width * size.cellWidth, rows * size.cellHeight)
          : fit(1280, 720, Math.min(area.width, 240), Math.min(rows * 2, 240));
        const requestStartedAt = Date.now();
        let frame;
        try { frame = await capture({ width, height, format: mode === 'kitty' && pixelTransport === 'inline' ? 'png' : 'rgba', source: pane.source }, abort.signal); }
        catch (error) {
          // A rejected in-flight capture on socket loss must not turn unknown
          // media state into an apparent call end via the fatal cleanup path.
          if (!ownsMedia && startupViewer!.disconnected) break;
          throw error;
        }
        const receivedAt = Date.now();
        if (!running || epoch !== epochKey()) break;
        if (frame) {
          const origin = native ? {
            x: area.x + Math.max(0, Math.floor((area.width - Math.ceil(mode === 'kitty' ? frame.width / size.cellWidth : frame.width)) / 2)),
            y: area.y + Math.max(0, Math.floor((area.height - Math.ceil(mode === 'kitty' ? frame.height / size.cellHeight : frame.height / 2)) / 2)),
          } : area;
          const key = `${pane.source}:${frame.sourceFrame}:${frame.width}x${frame.height}:${frame.format}`;
          if (key !== lastFrames.get(pane.id)) {
            if (mode === 'kitty') {
              let memory: SharedFrame | undefined;
              try {
                if (pixelTransport === 'shm') {
                  try { memory = await sharedFrames.create(frame.data); }
                  catch { throw new PixelRenderError('RAM frame allocation failed. Video paused; use t/b, or g to retry.'); }
                }
                let renderer = renderers.get(pane.id);
                if (!renderer) { renderer = new KittyRenderer(caps.tmux); renderers.set(pane.id, renderer); }
                const draw = renderer.render(frame, { ...size, columns: area.width, rows }, memory?.name, origin);
                if (draw.redraw) lastLabels = '';
                const writeStartedAt = Date.now();
                const timing = await terminal.writeGraphics(draw.output, draw.id, caps.tmux, abort.signal);
                metrics.frame(frame, timing.writtenAt, timing.acknowledgedAt, timing.bytes, { requestStartedAt, receivedAt, writeStartedAt, source: pane.source });
              } catch (error) {
                if (!(error instanceof PixelRenderError)) throw error;
                if (epoch !== epochKey()) continue; // a stale display failure must not pause its replacement
                // Display failures are not meeting failures. Stop requesting
                // pixels, but preserve the SDK session, received audio and keys.
                paused = true; renderFault = error.message; notice = renderFault;
                metrics.renderErrors++; generation++; lastFrames.clear(); lastLabels = ''; ui.notice = '';
              } finally { await memory?.release(); }
            } else {
              const output = blocks(frame, origin);
              const writeStartedAt = Date.now();
              await terminal.write(output);
              metrics.frame(frame, Date.now(), undefined, Buffer.byteLength(output), { requestStartedAt, receivedAt, writeStartedAt, source: pane.source });
            }
            if (epoch === epochKey()) lastFrames.set(pane.id, key);
            if (!renderFault) notice = `${frame.width}×${frame.height} • ${mode === 'kitty' ? pixelTransport : 'blocks'}${caps.measured ? '' : ' • cell px estimated/overridden'}`;
          }
        } else {
          metrics.unavailable++;
          if (lastFrames.get(pane.id) !== 'unavailable') {
            const info = ui.sources.find(source => source.id === pane.source);
            await terminal.write((renderers.get(pane.id)?.clear() ?? '') + ui.fill(area, info?.present ? `${info.label} · camera off / waiting` : `Waiting for ${pane.source}`));
            lastFrames.set(pane.id, 'unavailable');
          }
        }
      }
      const labels = ui.chrome(statusLine(), mode === 'browser' ? 'Browser view; same meeting session. Terminal controls remain active.' : notice);
      if (labels !== lastLabels) { await terminal.write(labels); lastLabels = labels; }
      await delay(Math.max(0, 1000 / fps - (performance.now() - started)), undefined, { signal: abort.signal });
    }
  } catch (error) { if (running) fatal = error instanceof Error ? error : new Error('Prototype failed.'); }
  finally {
    quit(); clearTimeout(timer);
    process.off('SIGINT', quit); process.off('SIGTERM', quit); process.off('SIGHUP', quit);
    process.stdout.off('resize', onResize);
    // None of these optional branches can postpone the already-started owner
    // deadline or skip terminal restoration. A normal in-flight probe finishes
    // its raw-mode restoration before terminal.close; stale probes never start.
    await cleanupAll([
      () => ownerStopped,
      () => callPanes?.close(),
      () => broker?.close(),
      () => sharedFrames.close(),
      async () => {
        await cleanupAll([() => transition, () => presentationQueue], 1000);
        if (opened) await terminal.close(clearImages());
      },
      async () => { rss = host.browser ? await browserRssMB(host.browser.process()?.pid) : null; },
      () => metrics.stop(),
    ], 8000);
    process.stderr.write(`\n${JSON.stringify({ ...metrics.summary(), browserTreeRssMB: rss,
      sdkVersion: command === 'live' ? SDK_VERSION : null, nodeVersion: process.version, capabilities: caps, pixelTransport,
      renderer: mode, renderingPausedByError: !!renderFault,
      sending: { ...sendStates },
      workspace: { panes: ui.workspace.panes(), layout: ui.layoutName, mockParticipants: command === 'demo' ? participants : 0 },
      nativeCall: callPanes?.snapshot() ?? null,
      note: 'Pixel frames wait for a unique outer-terminal processing ACK, not a display/vsync ACK. Overall FPS is aggregate; perSource separates feeds. Includes startup and paused time.' }, null, 2)}\n`);
  }
  if (fatal) throw fatal;
}

main().catch(async error => {
  await startupViewer?.close();
  // Only our own bounded errors should reach here; never dump browser/SDK objects.
  process.stderr.write(`wbx-proto: ${cleanText(error instanceof Error ? error.message : 'Failed.', 240)}\n`);
  process.exitCode = 1;
});
