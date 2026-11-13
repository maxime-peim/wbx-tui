import { EventEmitter } from 'node:events';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Socket } from 'node:net';
import type { Browser, Page } from 'puppeteer-core';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeFrame, MAX_FRAME_BYTES, parseCommand, parseEvent, type Capture, type Command, type Frame } from './protocol.js';
import { SDK_SHA256 } from './sdk-version.js';
import { cleanupAll, deadline } from './lifecycle.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export interface HostOptions { browserPath?: string; headless?: boolean; live?: boolean; signal?: AbortSignal }
type Pending = { request: Capture; resolve(frame: Frame | null): void; reject(error: Error): void; cleanup(): void };
export function authorizedUpgrade(request: Pick<IncomingMessage, 'headers' | 'url'>, origin: string, secret: string): boolean {
  const protocols = (request.headers['sec-websocket-protocol'] ?? '').split(',').map(value => value.trim());
  const key = protocols.find(value => /^[0-9a-f]{64}$/.test(value));
  return request.url === '/media' && request.headers.origin === origin
    && request.headers.host === new URL(origin).host && !!key
    && timingSafeEqual(Buffer.from(key), Buffer.from(secret));
}
export async function browserExecutable(explicit?: string): Promise<string> {
  for (const candidate of explicit ? [explicit] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next candidate */ }
  }
  throw new Error('Chrome/Chromium not found. Set --browser-path to an executable.');
}
export async function sdkAsset(): Promise<Buffer> {
  let data: Buffer;
  try { data = await readFile(join(root, 'vendor/webex.min.js')); }
  catch { throw new Error('Webex SDK missing. Run npm run sdk first.'); }
  if (createHash('sha256').update(data).digest('hex') !== SDK_SHA256) throw new Error('Webex SDK checksum mismatch. Run npm run sdk.');
  return data;
}
/** Owns exactly one browser/session. The browser never joins on transport reconnect. */
export class MediaHost extends EventEmitter {
  browser!: Browser;
  page!: Page;
  origin = '';
  profile = '';
  private server!: Server;
  private sockets!: WebSocketServer;
  private peer?: WebSocket;
  private pending?: Pending;
  private sequence = 0;
  private closing = false;
  private stopped?: Promise<void>;
  private left?: () => void;
  private hasLeft = false;
  private secret = randomBytes(32).toString('hex');
  private rawSockets = new Set<Socket>();
  private visibilityAbort = new AbortController();
  private visibilitySequence = 0;

  static async open(options: HostOptions = {}): Promise<MediaHost> {
    const host = new MediaHost();
    try { await host.open(options); return host; }
    catch (error) { await host.close(); throw error; }
  }
  private async open(options: HostOptions): Promise<void> {
    options.signal?.throwIfAborted();
    const html = await readFile(join(root, 'src/browser/index.html'));
    let script: Buffer;
    try { script = await readFile(join(root, 'dist/browser.js')); }
    catch { throw new Error('Browser bundle missing. Run npm run build first.'); }
    const sdk = options.live ? await sdkAsset() : undefined;
    const assets = new Map<string, [string, Buffer]>([
      ['/', ['text/html; charset=utf-8', html]], ['/browser.js', ['text/javascript; charset=utf-8', script]],
    ]);
    if (sdk) assets.set('/sdk.js', ['text/javascript; charset=utf-8', sdk]);
    await this.listen(assets);
    // A distinct disposable profile; never attach to the user's regular browser.
    const base = process.env.WBX_TEMP_DIR || (process.env.OPENCODE ? '/tmp/opencode' : tmpdir());
    this.profile = await mkdtemp(join(base, 'wbx-proto-'));
    const { default: puppeteer } = await import('puppeteer-core');
    this.browser = await puppeteer.launch({ executablePath: await browserExecutable(options.browserPath),
      userDataDir: this.profile, headless: options.headless ?? false, pipe: true, signal: options.signal,
      timeout: 15_000,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    this.browser.on('disconnected', () => {
      if (!this.closing) this.fail(new Error('The owned browser closed.'));
    });
    options.signal?.throwIfAborted();
    // SDK storage stays in an off-the-record context, not the disposable on-disk
    // browser profile. Close only the launcher's owned blank pages afterwards.
    const blankPages = await this.browser.pages();
    const context = await this.browser.createBrowserContext();
    this.page = await context.newPage();
    await Promise.all(blankPages.map(page => page.close()));
    // Do not copy browser console or SDK errors into logs: they may contain tokens or meeting content.
    this.page.on('pageerror', () => this.fail(new Error('The media worker encountered a page error.')));
    await this.page.goto(this.origin, { waitUntil: 'load', timeout: 15_000 });
    options.signal?.throwIfAborted();
    let stopReady = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Media worker connection timed out.')); }, 10_000);
      const onReady = () => { cleanup(); resolve(); };
      const cleanup = () => { clearTimeout(timer); this.off('ready', onReady); };
      stopReady = cleanup;
      this.once('ready', onReady);
    });
    void ready.catch(() => {}); // evaluate can fail before we reach the await below
    // Secret is delivered privately through CDP, never in a URL, file, or bundle.
    try {
      await this.page.evaluate(({ url, key }) => window.__wbx.connect(url, key), {
        url: `${this.origin.replace('http:', 'ws:')}/media`, key: this.secret,
      });
      await ready;
    } finally { stopReady(); }
    options.signal?.throwIfAborted();
  }
  private async listen(assets: Map<string, [string, Buffer]>): Promise<void> {
    this.server = createServer((request, response) => {
      if (request.headers.host !== new URL(this.origin).host || request.method !== 'GET') {
        response.writeHead(403).end(); return;
      }
      const asset = assets.get(request.url ?? '');
      if (!asset) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }).end(asset[1]);
    });
    this.server.requestTimeout = 5000;
    this.server.on('connection', socket => {
      this.rawSockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => this.rawSockets.delete(socket));
      if (this.closing) socket.destroy();
    });
    this.sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES,
      perMessageDeflate: false, handleProtocols: () => 'wbx-proto' });
    this.server.on('upgrade', (request, socket, head) => {
      if (this.closing || this.peer || !authorizedUpgrade(request, this.origin, this.secret)) {
        // end() alone leaves a half-open upgraded socket outside HTTP's idle
        // connection accounting. Send the refusal, then destroy our raw socket.
        try { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
        finally { socket.destroy(); }
        return;
      }
      try { this.sockets.handleUpgrade(request, socket, head, peer => this.accept(peer)); }
      catch { socket.destroy(); }
    });
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve(); });
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback listener unavailable.');
    this.origin = `http://127.0.0.1:${address.port}`;
  }
  private accept(peer: WebSocket): void {
    this.peer = peer;
    peer.on('message', (data, binary) => {
      try {
        if (binary) {
          const bytes = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
          const frame = decodeFrame(bytes);
          const pending = this.pending;
          if (!pending || frame.seq !== pending.request.seq) return; // canceled/stale frame
          if (frame.width > pending.request.width || frame.height > pending.request.height || frame.format !== pending.request.format) {
            throw new Error('Unexpected frame.');
          }
          pending.cleanup(); pending.resolve(frame);
        } else {
          const event = parseEvent(data.toString());
          if (event.type === 'status' && event.state === 'ready') this.emit('ready');
          if (event.type === 'unavailable' && this.pending?.request.seq === event.seq) {
            const pending = this.pending; pending.cleanup(); pending.resolve(null);
          }
          if (event.type === 'left') { this.hasLeft = true; this.left?.(); }
          this.emit('event', event);
        }
      } catch { this.fail(new Error('Invalid media-worker data.')); peer.close(1008); }
    });
    peer.on('error', () => this.fail(new Error('Media transport failed.')));
    peer.on('close', () => { if (!this.closing) this.fail(new Error('Media worker disconnected.')); });
  }
  private fail(error: Error): void {
    if (this.pending) { const pending = this.pending; pending.cleanup(); pending.reject(error); }
    this.emit('fault', error);
  }
  send(command: Command): void {
    const text = JSON.stringify(command);
    parseCommand(text);
    if (this.peer?.readyState !== WebSocket.OPEN) throw new Error('Media worker is not connected.');
    this.peer.send(text);
  }
  capture(request: Omit<Capture, 'type' | 'seq'>, signal?: AbortSignal): Promise<Frame | null> {
    if (this.pending) return Promise.reject(new Error('A frame request is already in flight.'));
    if (signal?.aborted || this.closing) return Promise.reject(new Error('Frame request canceled.'));
    return new Promise((resolve, reject) => {
      const seq = this.sequence = (this.sequence % 0xffffffff) + 1;
      const cancel = () => { cleanup(); reject(new Error('Frame request canceled.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Frame request timed out.')); }, 5000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending = undefined; };
      const command: Capture = { ...request, type: 'capture', seq };
      this.pending = { request: command, resolve, reject, cleanup };
      signal?.addEventListener('abort', cancel, { once: true });
      try { this.send(command); } catch (error) { cleanup(); reject(error); }
    });
  }
  async visible(visible: boolean): Promise<void> {
    const sequence = ++this.visibilitySequence, signal = this.visibilityAbort.signal;
    const current = () => !this.closing && sequence === this.visibilitySequence;
    const check = () => { if (!current()) throw new Error('Browser visibility canceled.'); };
    check();
    let accepting = true;
    const creation = Promise.resolve().then(() => { check(); return this.page.createCDPSession(); });
    // A session that materializes after timeout/close still belongs to us, but
    // must never issue window commands or regain focus.
    void creation.then(client => {
      if (!accepting || !current()) void deadline(() => client.detach(), 3000).catch(() => {});
    }, () => {});
    let client: Awaited<typeof creation>;
    try { client = await deadline(() => creation, 3000, 'Browser visibility timed out.', signal); }
    finally { accepting = false; }
    try {
      check();
      const { windowId } = await deadline(() => client.send('Browser.getWindowForTarget', undefined, { timeout: 3000 }), 3000, undefined, signal);
      check();
      await deadline(() => client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: visible ? 'normal' : 'minimized' } }, { timeout: 3000 }), 3000, undefined, signal);
      check();
      if (visible) await deadline(() => this.page.bringToFront(), 3000, undefined, signal);
    } finally { await deadline(() => client.detach(), 3000).catch(() => {}); }
  }
  close(): Promise<void> { return this.stopped ??= this.closeOwned(); }
  private async closeOwned(): Promise<void> {
    this.closing = true;
    this.visibilityAbort.abort(); this.visibilitySequence++;
    // Arm the independent hard stop BEFORE any graceful cleanup. Neither SDK
    // leave, CDP, socket errors nor a rejected Browser.close can bypass it.
    const browser = this.browser;
    let killed = false, browserClosed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => { if (!killed) { killed = true; try { browser?.process()?.kill('SIGKILL'); } catch { /* already gone */ } } };
    let hardStop!: () => void;
    const hardDeadline = new Promise<void>(resolve => {
      hardStop = () => { kill(); resolve(); };
      if (browser) timer = setTimeout(hardStop, 4000);
    });
    try {
      await cleanupAll([() => {
        if (this.pending) { const pending = this.pending; pending.cleanup(); pending.reject(new Error('Session closed.')); }
      }, () => {
        if (!this.hasLeft && this.peer?.readyState === WebSocket.OPEN) return new Promise<void>(resolve => {
          this.left = resolve;
          try { this.send({ type: 'leave' }); } catch { resolve(); }
        });
      }], 3000);
      this.left = undefined;
      await cleanupAll([() => this.peer?.terminate(), () => this.sockets?.close()], 1000);
      if (browser) await Promise.race([Promise.resolve().then(() => browser.close()).then(() => { browserClosed = true; }).catch(hardStop), hardDeadline]);
    } finally {
      if (browser && !browserClosed) kill();
      clearTimeout(timer);
      await cleanupAll([
        () => { for (const socket of this.rawSockets) { try { socket.destroy(); } catch { /* continue */ } } },
        () => this.server?.closeAllConnections(),
        () => { if (this.server?.listening) return new Promise<void>(resolve => this.server.close(() => resolve())); },
      ], 1000);
      // Only the exact fresh directory created by mkdtemp belongs to us.
      await cleanupAll([() => { if (this.profile) return rm(this.profile, { recursive: true, force: true }); }], 2000);
      this.removeAllListeners();
    }
  }
}
