import { EventEmitter } from 'node:events';
import { createConnection, createServer, type Socket, type Server } from 'node:net';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFrame, encodeFrame, MAX_FRAME_BYTES, parseCommand, parseEvent, type Capture, type Command, type Frame, type WorkerEvent } from './protocol.js';
import type { CellSize, GraphicsReply } from './terminal-input.js';
import { parseConfig, validAction, type Config } from './config.js';
import { StringDecoder } from 'node:string_decoder';
import { validChatRequest, type ChatRequest } from './chat-protocol.js';
import { ViewerPackets } from './viewer-framing.js';
import { nativePaneCapability, nativePaneIntent, nativePaneResult, paneNumber, paneName,
  type NativePaneCapability, type NativePaneIntent, type NativePaneResult } from './native-panes.js';

export type CaptureFn = (request: Omit<Capture, 'type' | 'seq'>, signal?: AbortSignal) => Promise<Frame | null>;
/** FIFO admission shared by the main workspace and viewers. One worker request. */
export function serialCapture(capture: CaptureFn): CaptureFn {
  let tail: Promise<unknown> = Promise.resolve(), waiting = 0;
  return (request, signal) => {
    if (waiting >= 17) return Promise.reject(new Error('Too many queued frame requests.'));
    waiting++;
    const result = tail.then(() => {
      if (signal?.aborted) throw new Error('Frame request canceled.');
      return capture(request, signal);
    });
    tail = result.catch(() => {}).finally(() => { waiting--; });
    return result;
  };
}
function packet(socket: Socket, body: Uint8Array): void {
  if (socket.destroyed) return;
  if (socket.writableLength > MAX_FRAME_BYTES) { socket.destroy(); return; }
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  socket.write(Buffer.concat([header, body]));
}
function replyMessage(value: unknown): value is GraphicsReply & { type: 'graphics-reply' } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'graphics-reply' && typeof v.id === 'number' && Number.isInteger(v.id) && v.id > 0 && v.id <= 0xffffffff
    && typeof v.result === 'string' && /^[\x20-\x7e]{0,256}$/.test(v.result)
    && (v.controls === undefined || (typeof v.controls === 'string' && /^[a-zA-Z0-9_=,]{1,256}$/.test(v.controls)
      && v.controls.split(',').includes(`i=${v.id}`)));
}
function cellMessage(value: unknown): value is CellSize & { type: 'cell-size' } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'cell-size' && typeof v.width === 'number' && Number.isInteger(v.width) && v.width >= 1 && v.width <= 100
    && typeof v.height === 'number' && Number.isInteger(v.height) && v.height >= 1 && v.height <= 200;
}
/** Private frame/metadata socket. Control relays require explicit owner handlers. */
export class ViewerBroker extends EventEmitter {
  onReply?: (reply: GraphicsReply) => void;
  onCell?: (size: CellSize) => void;
  onAction?: (action: string, pane: string) => Promise<void>;
  onNativePane?: (intent: NativePaneIntent, pane: string, valid: () => boolean) => Promise<void>;
  onChat?: (request: ChatRequest, pane: string) => Promise<void>;
  readonly clients = new Set<Socket>();
  private server!: Server;
  private directory!: string;
  path!: string;
  private sources?: WorkerEvent;
  private events = new Map<string, WorkerEvent>();
  private configuration?: Config;
  private paneRevision = 1;
  private paneBusy = false;
  private paneCapability(): NativePaneCapability | undefined {
    return this.onNativePane ? { version: 1, revision: this.paneRevision,
      layouts: Object.keys(this.configuration?.layouts ?? {}).filter(paneName).slice(0, 32),
      sources: this.sources?.type === 'sources' ? this.sources.sources.map(source => ({ ...source })) : [] } : undefined;
  }
  private configPacket(result?: NativePaneResult): Buffer {
    return Buffer.from(JSON.stringify({ type: 'config', config: this.configuration,
      ...(this.paneCapability() ? { nativePanes: this.paneCapability() } : {}),
      ...(result ? { nativePaneResult: result } : {}) }));
  }
  static async open(capture: CaptureFn, signal?: AbortSignal): Promise<ViewerBroker> {
    const broker = new ViewerBroker();
    broker.directory = await mkdtemp(join(process.env.WBX_TEMP_DIR || tmpdir(), 'wbx-view-'));
    await chmod(broker.directory, 0o700);
    broker.path = join(broker.directory, 'frames.sock');
    broker.server = createServer(socket => {
      if (broker.clients.size >= 16) { socket.destroy(); return; }
      broker.clients.add(socket); socket.on('error', () => {});
      socket.on('close', () => broker.clients.delete(socket));
      if (broker.sources) packet(socket, Buffer.from(JSON.stringify(broker.sources)));
      for (const event of broker.events.values()) packet(socket, Buffer.from(JSON.stringify(event)));
      if (broker.configuration) packet(socket, broker.configPacket());
      let paneRequests = 0;
      let buffer = '', pending = false, chatting = false;
      const decoder = new StringDecoder('utf8');
      let closeChat: { request: ChatRequest; pane: string } | undefined;
      const relayChat = (request: ChatRequest, pane: string) => {
        chatting = true;
        void broker.onChat!(request, pane).catch(() => {
          if (request.action === 'send') packet(socket, Buffer.from(JSON.stringify({ type: 'chat-result', requestId: request.requestId, roomId: request.roomId, status: 'failed', problem: 'not-connected' })));
          else packet(socket, Buffer.from(JSON.stringify({ type: 'notice', message: 'Space chat request refused: not a managed call pane.' })));
        }).finally(() => {
          chatting = false;
          const close = closeChat; closeChat = undefined;
          if (close && !socket.destroyed && broker.onChat) relayChat(close.request, close.pane);
        });
      };
      socket.on('data', chunk => {
        buffer += decoder.write(chunk);
        if (buffer.length > 16_384) { socket.destroy(); return; }
        while (buffer.includes('\n')) {
          const newline = buffer.indexOf('\n');
          const text = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          if (text.length > 16_384) { socket.destroy(); return; }
          let command: Command;
          try {
            const value: unknown = JSON.parse(text);
            if (value && typeof value === 'object' && 'type' in value && value.type === 'native-pane') {
              if (text.length > 2048) { socket.destroy(); return; }
              const v = value as Record<string, unknown>;
              if (!paneNumber(v.requestId) || !nativePaneIntent(v.intent) || typeof v.pane !== 'string' || !/^%\d+$/.test(v.pane)
                || Object.keys(v).some(key => !['type', 'requestId', 'intent', 'pane'].includes(key))) { socket.destroy(); return; }
              const intent = v.intent, requestId = v.requestId;
              const valid = () => !socket.destroyed && intent.revision === broker.paneRevision;
              if (!broker.onNativePane || !broker.configuration) { socket.destroy(); return; }
              if (broker.paneBusy || ++paneRequests > 256 || !valid()
                || intent.action === 'layout' && !broker.paneCapability()!.layouts.includes(intent.layout!)
                || intent.action === 'source.set' && !broker.paneCapability()!.sources.some(source => source.id === intent.source && (source.available || source.present))) {
                packet(socket, broker.configPacket({ requestId, status: 'refused' })); continue;
              }
              broker.paneBusy = true;
              void broker.onNativePane(intent, v.pane, valid).then(() => {
                packet(socket, broker.configPacket({ requestId, status: 'applied' }));
              }, () => {
                // A partial tmux operation may have succeeded. Never turn a
                // failed/disconnected ACK into proof that nothing changed.
                packet(socket, broker.configPacket({ requestId, status: 'unknown' }));
              }).finally(() => { broker.paneBusy = false; });
              continue;
            }
            if (value && typeof value === 'object' && 'type' in value && value.type === 'chat-control') {
              const control = value as { pane?: unknown; request?: unknown };
              if (!broker.onChat || !validChatRequest(control.request) || typeof control.pane !== 'string' || !/^%\d+$/.test(control.pane)) { socket.destroy(); return; }
              const request = control.request;
              if (chatting) {
                // Never silently discard an explicit stop. Keep at most one
                // coalesced close behind the in-flight ownership check.
                if (request.action === 'close') closeChat = { request, pane: control.pane };
                else if (request.action === 'send') packet(socket, Buffer.from(JSON.stringify({ type: 'chat-result', requestId: request.requestId, roomId: request.roomId, status: 'failed', problem: 'busy' })));
                else packet(socket, Buffer.from(JSON.stringify({ type: 'notice', message: 'Space chat busy; retry after the current request.' })));
                continue;
              }
              relayChat(request, control.pane);
              continue;
            }
            if (text.length > 2048) { socket.destroy(); return; }
             if (replyMessage(value)) { broker.emit('graphics-reply', value); broker.onReply?.(value); broker.forwardReply(value); continue; }
             if (cellMessage(value)) { broker.emit('cell-size', value); broker.onCell?.(value); broker.forwardCell(value); continue; }
            if (value && typeof value === 'object' && 'type' in value && value.type === 'action') {
              const action = value as { action?: unknown; pane?: unknown };
              if (!broker.onAction || !validAction(action.action) || typeof action.pane !== 'string' || !/^%\d+$/.test(action.pane)) { socket.destroy(); return; }
              void broker.onAction(action.action, action.pane).catch(error => {
                if (!socket.destroyed) packet(socket, Buffer.from(JSON.stringify({ type: 'notice', message: String((error as Error).message).slice(0, 400) })));
              });
              continue;
            }
            command = parseCommand(text);
          } catch { socket.destroy(); return; }
          if (command.type !== 'capture' || pending || socket.writableLength > MAX_FRAME_BYTES) { socket.destroy(); return; }
          pending = true;
          void capture(command, signal).then(frame => {
            if (socket.destroyed) return;
            pending = false;
            packet(socket, frame ? encodeFrame({ ...frame, seq: command.seq }) : new Uint8Array());
          }).catch(() => socket.destroy());
        }
        if (buffer.length > 2048 && !buffer.startsWith('{"type":"chat-control"')) socket.destroy();
      });
    });
    try {
      await new Promise<void>((resolve, reject) => { broker.server.once('error', reject); broker.server.listen(broker.path, resolve); });
      await chmod(broker.path, 0o600);
      return broker;
    } catch (error) { await broker.close(); throw error; }
  }
  publish(event: WorkerEvent): void {
    if (event.type === 'sources') {
      const changed = JSON.stringify(this.sources) !== JSON.stringify(event);
      if (changed) this.paneRevision++;
      this.sources = event;
      if (changed && this.configuration && this.onNativePane) for (const socket of this.clients) packet(socket, this.configPacket());
    }
    else if (['status', 'audio-state', 'camera-state', 'send-state', 'notice', 'chat-state', 'auth-state', 'presentation'].includes(event.type)) this.events.set(event.type === 'send-state' ? `send:${event.kind}` : event.type, event);
    else if (event.type === 'chat-result') { /* transient acknowledgment, never retained as history */ }
    else return;
    for (const socket of this.clients) if (!socket.destroyed) packet(socket, Buffer.from(JSON.stringify(event)));
  }
  forwardReply(reply: GraphicsReply): void {
    const message = { ...reply, type: 'graphics-reply' };
    if (!replyMessage(message)) return;
    for (const socket of this.clients) {
      if (socket.writableLength > MAX_FRAME_BYTES) socket.destroy();
      else if (!socket.destroyed) packet(socket, Buffer.from(JSON.stringify(message)));
    }
  }
  configure(config: Config): void {
    const publicConfig = parseConfig(config);
    if (JSON.stringify(this.configuration?.layouts) !== JSON.stringify(publicConfig.layouts)) this.paneRevision++;
    this.configuration = publicConfig;
    for (const socket of this.clients) if (!socket.destroyed) packet(socket, this.configPacket());
  }
  forwardCell(size: CellSize): void {
    const message = { ...size, type: 'cell-size' };
    if (!cellMessage(message)) return;
    for (const socket of this.clients) if (!socket.destroyed) packet(socket, Buffer.from(JSON.stringify(message)));
  }
  redraw(): void {
    for (const socket of this.clients) if (!socket.destroyed) packet(socket, Buffer.from('{"type":"redraw"}'));
  }
  async close(): Promise<void> {
    for (const socket of this.clients) socket.destroy();
    if (this.server?.listening) await new Promise<void>(resolve => this.server.close(() => resolve()));
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
export class ViewerHost extends EventEmitter {
  readonly browser = undefined;
  private socket!: Socket;
  private closed = false;
  private sequence = 0;
  private sources?: WorkerEvent;
  private events = new Map<string, WorkerEvent>();
  private configuration?: Config;
  private pending?: { seq: number; resolve(frame: Frame | null): void; reject(error: Error): void; cleanup(): void };
  private latestNotice?: string;
  private panes?: NativePaneCapability;
  private panePending?: { requestId: number; finish(result: NativePaneResult): void };
  paneSnapshot(): NativePaneCapability | undefined { return this.panes && structuredClone(this.panes); }
  /** Local control transport only; never evidence that the media owner exited. */
  get disconnected(): boolean { return this.socket.destroyed; }
  static async open(path: string): Promise<ViewerHost> {
    const host = new ViewerHost();
    host.socket = createConnection(path);
    const packets = new ViewerPackets(body => {
      try {
        if (body[0] === 0x7b) {
          const message: unknown = JSON.parse(body.toString('utf8'));
          if (replyMessage(message)) { host.emit('graphics-reply', message); return; }
          if (cellMessage(message)) { host.emit('cell-size', message); return; }
          if (message && typeof message === 'object' && 'type' in message && message.type === 'redraw') { host.emit('redraw'); return; }
          if (message && typeof message === 'object' && 'type' in message && message.type === 'notice'
            && 'message' in message && typeof message.message === 'string' && message.message.length <= 400) {
            host.latestNotice = message.message; host.emit('notice', message.message); return;
          }
          if (message && typeof message === 'object' && 'type' in message && message.type === 'config' && 'config' in message) {
            host.configuration = parseConfig(message.config);
            const v = message as Record<string, unknown>;
            if (v.nativePanes !== undefined && !nativePaneCapability(v.nativePanes)
              || v.nativePaneResult !== undefined && !nativePaneResult(v.nativePaneResult)) throw new Error('Invalid pane envelope.');
            host.panes = v.nativePanes as NativePaneCapability | undefined;
            host.emit('pane-capability', host.paneSnapshot());
            if (nativePaneResult(v.nativePaneResult) && host.panePending?.requestId === v.nativePaneResult.requestId) host.panePending.finish(v.nativePaneResult);
            host.emit('config', host.configuration); return;
          }
          const event = parseEvent(body.toString('utf8'));
          if (event.type === 'sources') host.sources = event;
          else if (['status', 'audio-state', 'camera-state', 'send-state', 'notice', 'chat-state', 'auth-state', 'presentation'].includes(event.type)) host.events.set(event.type === 'send-state' ? `send:${event.kind}` : event.type, event);
          else if (event.type === 'chat-result') { /* transient */ }
          else throw new Error('Unexpected viewer event.');
          host.emit('event', event);
        } else {
          const frame = body.length ? decodeFrame(body) : null, pending = host.pending;
          if (!pending || (frame && frame.seq !== pending.seq)) throw new Error('Unexpected viewer frame.');
          pending.cleanup(); pending.resolve(frame);
        }
      } finally { if (host.socket.destroyed) packets.close(); }
    });
    host.socket.on('data', chunk => {
      try { packets.push(chunk); }
      catch { host.socket.destroy(); }
    });
    host.socket.on('error', () => {});
    host.socket.on('close', () => {
      packets.close();
      const pending = host.pending;
      pending?.cleanup(); pending?.reject(new Error('Session owner disconnected.'));
      if (host.panePending) host.panePending.finish({ requestId: host.panePending.requestId, status: 'unknown' });
      host.panes = undefined;
      if (!host.closed) host.emit('disconnect');
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { host.socket.destroy(); reject(new Error('Viewer connection timed out.')); }, 3000);
      host.socket.once('connect', () => { clearTimeout(timer); resolve(); });
      host.socket.once('error', () => { clearTimeout(timer); reject(new Error('Cannot connect to the session owner.')); });
    });
    return host;
  }
  capture: CaptureFn = (request, signal) => {
    if (this.pending || this.socket.destroyed || signal?.aborted) return Promise.reject(new Error('Viewer capture unavailable.'));
    return new Promise((resolve, reject) => {
      const seq = this.sequence = this.sequence % 0xffffffff + 1;
      const cancel = () => { this.socket.destroy(); cleanup(); reject(new Error('Viewer capture canceled.')); };
      const timer = setTimeout(cancel, 10_000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending = undefined; };
      this.pending = { seq, resolve, reject, cleanup };
      signal?.addEventListener('abort', cancel, { once: true });
      this.socket.write(JSON.stringify({ ...request, type: 'capture', seq }) + '\n');
    });
  };
  send(command: Command): void {
    if (command.type === 'start') {
      if (this.sources) this.emit('event', this.sources);
      for (const event of this.events.values()) this.emit('event', event);
      if (this.configuration) this.emit('config', this.configuration);
      this.emit('pane-capability', this.paneSnapshot());
      if (this.latestNotice) this.emit('notice', this.latestNotice);
      if (!this.closed && this.disconnected) this.emit('disconnect');
      return;
    }
    throw new Error('Viewers are read-only. Use the owner workspace for camera/audio controls.');
  }
  forwardReply(reply: GraphicsReply): void {
    const message = { ...reply, type: 'graphics-reply' };
    if (!this.socket.destroyed && replyMessage(message)) this.socket.write(JSON.stringify(message) + '\n');
  }
  action(action: string, pane: string): void {
    if (!validAction(action) || !/^%\d+$/.test(pane) || this.socket.destroyed) throw new Error('Call action unavailable.');
    this.socket.write(JSON.stringify({ type: 'action', action, pane }) + '\n');
  }
  nativePane(intent: NativePaneIntent, pane: string): Promise<NativePaneResult> {
    if (!nativePaneIntent(intent) || !/^%\d+$/.test(pane) || this.socket.destroyed || this.panePending
      || !this.panes || intent.revision !== this.panes.revision) throw new Error('Pane capability/selection unavailable; nothing was sent.');
    return new Promise(resolve => {
      const requestId = ++this.sequence;
      const timer = setTimeout(() => { this.socket.destroy(); finish({ requestId, status: 'unknown' }); }, 8000);
      const finish = (value: NativePaneResult) => {
        if (this.panePending?.requestId !== requestId) return;
        clearTimeout(timer); this.panePending = undefined; resolve(value);
      };
      this.panePending = { requestId, finish };
      this.socket.write(JSON.stringify({ type: 'native-pane', requestId, pane, intent }) + '\n');
    });
  }
  chat(request: ChatRequest, pane: string): void {
    if (!validChatRequest(request) || !/^%\d+$/.test(pane) || this.socket.destroyed) throw new Error('Space chat unavailable.');
    this.socket.write(JSON.stringify({ type: 'chat-control', pane, request }) + '\n');
  }
  forwardCell(size: CellSize): void {
    const message = { ...size, type: 'cell-size' };
    if (!this.socket.destroyed && cellMessage(message)) this.socket.write(JSON.stringify(message) + '\n');
  }
  async visible(visible: boolean): Promise<void> { if (visible) throw new Error('A viewer does not own a browser.'); }
  async close(): Promise<void> { this.closed = true; this.socket.destroy(); }
}
