/** Private local credential lease. Never multiplex this onto editor/viewer RPC. */
import { fork } from 'node:child_process';
import { createConnection, createServer, type Socket, type Server } from 'node:net';
import { chmod, lstat, mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { OAuthError, OAuthSession, type OAuthSeed, type OAuthDelegate, type OAuthOptions } from './oauth.js';
import { validAccess, type AccessCredentials, type AuthProblem } from './auth-protocol.js';
import { deadline } from './lifecycle.js';

const MAX = 16_384, DEADLINE = 20_000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const error = () => new OAuthError('failed', 'Shared authorization unavailable. Reconnect explicitly; no sign-in or grant retry was attempted.');
function lines(socket: Socket, receive: (value: Record<string, unknown>) => void) {
  const decoder = new StringDecoder('utf8'); let text = '';
  socket.on('data', chunk => {
    text += decoder.write(chunk);
    if (Buffer.byteLength(text) > MAX) { socket.destroy(); return; }
    while (text.includes('\n')) {
      const end = text.indexOf('\n'), line = text.slice(0, end); text = text.slice(end + 1);
      try { const value: unknown = JSON.parse(line); if (!object(value)) throw error(); receive(value); }
      catch { socket.destroy(); return; }
    }
  });
}
function send(socket: Socket, value: object) {
  const wire = JSON.stringify(value) + '\n';
  if (socket.destroyed || socket.writableLength > MAX || Buffer.byteLength(wire) > MAX) { socket.destroy(); return; }
  socket.write(wire);
}
/** Ref-counted detached lifetime: editor disconnect never closes another client's lease. */
export class SharedOAuthOwner {
  private server!: Server;
  private directory = '';
  path = '';
  private clients = new Set<Socket>();
  private idle?: ReturnType<typeof setTimeout>;
  private closed = false;
  private failed = false;
  private closing?: Promise<void>;
  private version = 1;
  private refreshing?: Promise<void>;
  private session: OAuthSession;
  private access: AccessCredentials;
  onClose?: () => void;
  private constructor(seed: OAuthSeed, options: OAuthOptions, private idleMs: number) {
    this.session = OAuthSession.adopt(seed, options);
    this.access = { token: seed.pair.token, expiresAt: seed.pair.expiresAt, scope: seed.pair.scope };
  }
  static async open(seed: OAuthSeed, options: OAuthOptions = {}, idleMs = 10_000): Promise<SharedOAuthOwner> {
    const owner = new SharedOAuthOwner(seed, options, idleMs);
    try {
      owner.directory = await mkdtemp(join(process.env.WBX_TEMP_DIR || tmpdir(), 'wbx-oauth-'));
      await chmod(owner.directory, 0o700); owner.path = join(owner.directory, 'access.sock');
      owner.server = createServer(socket => owner.accept(socket));
      await new Promise<void>((resolve, reject) => { owner.server.once('error', reject); owner.server.listen(owner.path, resolve); });
      await chmod(owner.path, 0o600); owner.armIdle(); return owner;
    } catch { await owner.close(); throw error(); }
  }
  private armIdle() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { if (!this.clients.size) void this.close(); }, this.idleMs);
  }
  private accept(socket: Socket) {
    if (this.closed || this.clients.size >= 8) { socket.destroy(); return; }
    clearTimeout(this.idle); this.clients.add(socket); socket.on('error', () => {});
    let pending = false, admitted = false;
    const hello = setTimeout(() => { if (!admitted) socket.destroy(); }, 3000);
    socket.once('close', () => { clearTimeout(hello); this.clients.delete(socket); if (!this.clients.size && !this.closed) this.armIdle(); });
    lines(socket, message => {
      if (pending || !Number.isSafeInteger(message.id) || (message.id as number) < 1 || !['access', 'refresh'].includes(String(message.method))
        || Object.keys(message).some(key => !['id', 'method', 'version'].includes(key))
        || message.method === 'refresh' && (!Number.isSafeInteger(message.version) || (message.version as number) < 1 || (message.version as number) > this.version)) { socket.destroy(); return; }
      admitted = true; clearTimeout(hello); pending = true;
      const work = message.method === 'refresh' && message.version === this.version ? this.refresh() : Promise.resolve();
      void work.then(() => {
        if (this.closed || this.failed || this.access.expiresAt <= Date.now()) throw error();
        send(socket, { id: message.id, version: this.version, clientId: this.session.config.clientId, credentials: this.access });
      }).catch(() => send(socket, { id: message.id, failed: true })).finally(() => { pending = false; });
    });
  }
  private refresh(): Promise<void> {
    if (this.failed || this.closed) return Promise.reject(error());
    if (this.refreshing) return this.refreshing;
    this.refreshing = deadline(() => this.session.refresh(), 17_000).then(access => {
      if (this.closed) throw error();
      this.access = access; this.version++;
      for (const client of this.clients) send(client, { update: true, version: this.version });
    }).catch(() => { this.failed = true; this.session.close(); for (const client of this.clients) send(client, { failed: true }); void this.close(); throw error(); }).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true; clearTimeout(this.idle); this.session.close(); this.access = { token: '', scope: '', expiresAt: 0 };
    for (const socket of this.clients) socket.destroy();
    this.closing = (async () => {
      if (this.server?.listening) await new Promise<void>(resolve => this.server.close(() => resolve()));
      if (this.path) await unlink(this.path).catch(() => {});
      if (this.directory) await rmdir(this.directory).catch(() => {});
      this.onClose?.();
    })();
    return this.closing;
  }
}

export class SharedOAuthClient implements OAuthDelegate {
  onAccess?: () => void;
  onFailure?: () => void;
  private socket!: Socket;
  private closed = false;
  private version = 0;
  private sequence = 0;
  private pending?: { id: number; resolve(value: AccessCredentials): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private cached?: AccessCredentials;
  private notified = 0;
  private renewing?: Promise<AccessCredentials>;
  private renewal?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private expiryFailure?: (reason: AuthProblem) => void;
  clientId = '';
  get hasUpdate(): boolean { return this.notified > this.version; }
  private constructor(readonly path: string) {}
  static async open(path: string): Promise<SharedOAuthClient> {
    const client = new SharedOAuthClient(path);
    try {
      if (typeof path !== 'string' || path.length > 100 || !path.startsWith('/') || !/\/wbx-oauth-[A-Za-z0-9]+\/access\.sock$/.test(path)) throw error();
      const [socket, directory] = await Promise.all([lstat(path), lstat(dirname(path))]);
      if (!socket.isSocket() || !directory.isDirectory() || socket.uid !== process.getuid?.() || directory.uid !== process.getuid?.()
        || socket.mode & 0o077 || directory.mode & 0o077) throw error();
      client.socket = createConnection(path); client.socket.on('error', () => client.fail()); client.socket.once('close', () => client.fail());
      lines(client.socket, value => client.receive(value));
      await client.access(); return client;
    } catch { client.close(); throw error(); }
  }
  private receive(value: Record<string, unknown>) {
    if (value.failed === true && Object.keys(value).length === 1) { this.fail(); return; }
    if (value.update === true && Object.keys(value).length === 2 && Number.isSafeInteger(value.version) && (value.version as number) > 0) {
      this.notified = Math.max(this.notified, value.version as number);
      if (!this.pending && this.notified > this.version) this.onAccess?.();
      return;
    }
    const pending = this.pending;
    if (!pending || value.id !== pending.id) { this.fail(); return; }
    clearTimeout(pending.timer); this.pending = undefined;
    if (!validAccess(value.credentials) || !Number.isSafeInteger(value.version) || (value.version as number) < this.version
      || typeof value.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value.clientId)
      || Object.keys(value).some(key => !['id', 'version', 'clientId', 'credentials'].includes(key))) {
      pending.reject(error()); this.fail(); return;
    }
    this.version = value.version as number; this.cached = { ...value.credentials }; this.clientId = value.clientId;
    pending.resolve({ ...this.cached });
  }
  private request(method: 'access' | 'refresh'): Promise<AccessCredentials> {
    if (this.closed || this.pending) return Promise.reject(error());
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.fail(), DEADLINE) };
      send(this.socket, { id, method, ...(method === 'refresh' ? { version: this.version } : {}) });
    });
  }
  access(): Promise<AccessCredentials> { return this.request('access'); }
  refresh(): Promise<AccessCredentials> {
    if (this.renewing) return this.renewing;
    this.renewing = this.request(this.notified > this.version ? 'access' : 'refresh').finally(() => { this.renewing = undefined; });
    return this.renewing;
  }
  watch(expiresAt: number, renew: () => void, failed: (reason: AuthProblem) => void): void {
    if (this.closed) { failed('failed'); return; }
    if (this.cached?.expiresAt !== expiresAt) return;
    clearTimeout(this.renewal); clearTimeout(this.expiry);
    this.expiryFailure = failed;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { this.close(); failed('expired'); return; }
    const arm = (key: 'renewal' | 'expiry', ms: number, run: () => void) => {
      const end = performance.now() + ms;
      const next = () => { if (this.closed) return; const left = end - performance.now(); if (left <= 0) run(); else this[key] = setTimeout(next, Math.min(2_147_000_000, Math.ceil(left))); };
      next();
    };
    arm('renewal', Math.max(1, remaining - Math.min(60_000, remaining * .2)), renew);
    arm('expiry', remaining, () => { this.close(); failed('expired'); });
  }
  private fail(): void {
    if (this.closed) return;
    const failed = this.expiryFailure, notify = this.onFailure;
    this.close(); failed?.('failed'); notify?.();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.renewal); clearTimeout(this.expiry); this.cached = undefined;
    this.expiryFailure = undefined; this.onAccess = undefined; this.onFailure = undefined;
    this.socket?.destroy();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error()); this.pending = undefined; }
  }
}

export async function startSharedOAuth(seed: OAuthSeed, worker = fileURLToPath(new URL('../dist/oauth-worker.js', import.meta.url))): Promise<SharedOAuthClient> {
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'WBX_TEMP_DIR'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const child = fork(worker, [], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], env });
  child.on('error', () => {});
  let client: SharedOAuthClient | undefined;
  try {
    const path = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(error()); }, 5000);
      const cleanup = () => { clearTimeout(timer); child.off('message', ready); child.off('error', fail); child.off('exit', fail); };
      const fail = () => { cleanup(); reject(error()); };
      const ready = (v: unknown) => { cleanup(); if (!object(v) || Object.keys(v).length !== 1 || typeof v.path !== 'string') reject(error()); else resolve(v.path); };
      child.on('message', ready); child.once('error', fail); child.once('exit', fail);
      child.send(seed, err => { if (err) fail(); });
    });
    client = await SharedOAuthClient.open(path);
    child.disconnect(); child.unref(); return client;
  } catch { client?.close(); child.kill('SIGKILL'); throw error(); }
}

/** A media owner borrows an existing login; refusal never falls back to authorize(). */
export async function openMeetingAuthorization(path: string, clientId: string) {
  const client = await SharedOAuthClient.open(path);
  try {
    const access = await client.access();
    if (client.clientId !== clientId || !access.scope.split(/\s+/).includes('spark:all')) throw error();
    return { oauth: client, access };
  } catch { client.close(); throw error(); }
}
