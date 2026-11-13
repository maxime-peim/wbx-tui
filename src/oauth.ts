import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { validExpiry, validScope, validToken, type AccessCredentials, type AuthProblem } from './auth-protocol.js';

export interface OAuthConfig { clientId: string; redirectUri: string; scopes: string[] }
export const AUTHORIZE_URL = 'https://webexapis.com/v1/authorize';
export const TOKEN_URL = 'https://webexapis.com/v1/access_token';
export function validateOAuth(input: unknown): asserts input is OAuthConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('OAuth configuration must be an object.');
  const v = input as OAuthConfig;
  if (Object.keys(v).some(key => !['clientId', 'redirectUri', 'scopes'].includes(key))
    || typeof v.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(v.clientId)
    || !Array.isArray(v.scopes) || v.scopes.length < 1 || v.scopes.length > 32 || new Set(v.scopes).size !== v.scopes.length
    || v.scopes.some(scope => typeof scope !== 'string' || !/^(spark|meeting):[A-Za-z0-9:_-]{1,100}$/.test(scope)) || v.scopes.join(' ').length > 2048) {
    throw new Error('OAuth public metadata needs clientId, redirectUri and 1–32 explicit spark:/meeting: scopes; private fields stay in the Node owner.');
  }
  let uri: URL;
  try { uri = new URL(v.redirectUri); } catch { throw new Error('Invalid OAuth redirect URI.'); }
  if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || Number(uri.port) < 1024 || Number(uri.port) > 65535
    || !uri.port || uri.pathname !== '/oauth/callback' || uri.search || uri.hash || uri.username || uri.password || uri.href !== v.redirectUri) {
    throw new Error('Register the exact OAuth callback http://127.0.0.1:PORT/oauth/callback (PORT 1024–65535).');
  }
}
export class OAuthError extends Error {
  constructor(readonly reason: AuthProblem, message: string) { super(message); this.name = 'OAuthError'; }
}
interface TokenPair extends AccessCredentials { refreshToken: string; refreshExpiresAt?: number }
/** Node-private handoff only. Never editor/viewer/browser RPC, argv, environment or disk. */
export interface OAuthSeed { config: OAuthConfig; clientSecret: string; pair: TokenPair }
export interface OAuthDelegate {
  readonly path: string;
  onAccess?: () => void;
  onFailure?: () => void;
  access(): Promise<AccessCredentials>;
  refresh(): Promise<AccessCredentials>;
  close(): void;
}
export interface OAuthOptions { fetch?: typeof fetch; now?: () => number; loginTimeoutMs?: number; tokenTimeoutMs?: number }
/** Single grant owner, optionally handed off to a detached private broker. No token file or viewer RPC. */
export class OAuthSession {
  private closed = false;
  private used = false;
  private abort = new AbortController();
  private server?: Server;
  private pair?: TokenPair;
  private pending?: Promise<AccessCredentials>;
  private renewalTimer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private fetch: typeof fetch;
  private now: () => number;
  private delegate?: OAuthDelegate;
  private delegatedAccess?: AccessCredentials;
  private transferring?: Promise<string>;
  private watched?: { expiresAt: number; renew: () => void; failed: (reason: AuthProblem) => void };
  onAccess?: () => void;
  constructor(readonly config: OAuthConfig, private clientSecret: string, private options: OAuthOptions = {}) {
    validateOAuth(config);
    if (!validToken(clientSecret)) throw new Error('OAuth client secret is empty or invalid.');
    this.fetch = options.fetch ?? fetch; this.now = options.now ?? Date.now;
  }
  private access(): AccessCredentials {
    const { token, expiresAt, scope } = this.pair!; return { token, expiresAt, scope };
  }
  static adopt(seed: OAuthSeed, options: OAuthOptions = {}): OAuthSession {
    if (!seed || Object.keys(seed).some(key => !['config', 'clientSecret', 'pair'].includes(key))
      || !seed.pair || Object.keys(seed.pair).some(key => !['token', 'expiresAt', 'scope', 'refreshToken', 'refreshExpiresAt'].includes(key))
      || !validToken(seed.pair.token) || !validToken(seed.pair.refreshToken) || !validExpiry(seed.pair.expiresAt)
      || seed.pair.expiresAt <= (options.now?.() ?? Date.now()) || !validScope(seed.pair.scope)
      || seed.pair.refreshExpiresAt !== undefined && !validExpiry(seed.pair.refreshExpiresAt)) throw new Error('Invalid private OAuth handoff.');
    const session = new OAuthSession(seed.config, seed.clientSecret, options);
    session.used = true; session.pair = { ...seed.pair };
    return session;
  }
  /** Freeze local grant use, then give exactly one detached owner the renewal grant. */
  handoff(start: (seed: OAuthSeed) => Promise<OAuthDelegate>): Promise<string> {
    if (this.delegate && !this.closed) return Promise.resolve(this.delegate.path);
    if (this.transferring) return this.transferring;
    const pending = this.pending;
    this.transferring = Promise.resolve().then(async () => {
      await pending;
      if (this.closed || !this.pair || this.pair.expiresAt <= this.now()) throw new OAuthError('expired', 'Connect before sharing meeting authorization.');
      clearTimeout(this.renewalTimer); clearTimeout(this.expiryTimer);
      const delegate = await start({ config: { ...this.config, scopes: [...this.config.scopes] }, clientSecret: this.clientSecret, pair: { ...this.pair } });
      if (this.closed) { delegate.close(); throw new OAuthError('canceled', 'Authorization handoff canceled.'); }
      this.delegate = delegate;
      this.delegatedAccess = await delegate.access();
      this.pair = undefined; this.clientSecret = '';
      delegate.onAccess = () => { if (!this.closed) this.onAccess?.(); };
      delegate.onFailure = () => {
        if (this.closed) return;
        const failed = this.watched?.failed;
        this.close(); failed?.('failed');
      };
      if (this.watched) this.watch(this.delegatedAccess.expiresAt, this.watched.renew, this.watched.failed);
      return delegate.path;
    }).catch(() => { this.close(); throw new OAuthError('failed', 'Authorization sharing failed. Reconnect explicitly; no grant was replayed.'); })
      .finally(() => { this.transferring = undefined; });
    return this.transferring;
  }
  async authorize(open: (url: string) => Promise<void>, signal?: AbortSignal): Promise<AccessCredentials> {
    if (this.used || this.closed) throw new OAuthError('canceled', 'OAuth login cannot be reused. Start a new call.');
    this.used = true;
    const cancel = () => this.close();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) this.close();
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
    const redirect = new URL(this.config.redirectUri);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.closed) throw new OAuthError('canceled', 'OAuth login canceled.');
      const code = new Promise<string>((resolve, reject) => {
        let accepted = false;
        const fail = () => reject(new OAuthError('canceled', 'OAuth login canceled or timed out.'));
        this.abort.signal.addEventListener('abort', fail, { once: true });
        this.server = createServer((request, response) => {
          const reply = (status: number, message: string) => response.writeHead(status, {
            'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Pragma': 'no-cache',
            'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          }).end(message);
          if (request.method !== 'GET' || request.headers.host !== redirect.host || (request.url?.length ?? 0) > 4096) { reply(403, 'OAuth callback refused.'); return; }
          let url: URL;
          try { url = new URL(request.url!, redirect.origin); } catch { reply(400, 'Invalid callback.'); return; }
          if (url.origin !== redirect.origin || url.pathname !== redirect.pathname || !request.url?.startsWith('/oauth/callback?')) { reply(404, 'Not found.'); return; }
          const states = url.searchParams.getAll('state'), supplied = states[0] ?? '';
          if (states.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(state))) {
            reply(403, 'Invalid OAuth state.'); return; // do not consume a legitimate flow
          }
          if (accepted) { reply(409, 'Callback already consumed.'); return; }
          const codes = url.searchParams.getAll('code'), errors = url.searchParams.getAll('error');
          if (errors.length === 1 && !codes.length) {
            accepted = true; reply(403, 'Authorization denied. Return to the terminal.');
            reject(new OAuthError('denied', 'Webex authorization was denied. No meeting joined.')); return;
          }
          if (codes.length !== 1 || errors.length || !/^[\x21-\x7e]{1,2048}$/.test(codes[0]!)) { reply(400, 'Invalid authorization response.'); return; }
          accepted = true; reply(200, 'Authorization received. Return to the terminal; token exchange is still being checked.'); resolve(codes[0]!);
        });
        this.server.requestTimeout = 5000; this.server.headersTimeout = 5000; this.server.maxConnections = 8;
        this.server.once('error', () => reject(new OAuthError('failed', 'OAuth callback port unavailable. No meeting joined.')));
      });
      void code.catch(() => {});
      await new Promise<void>((resolve, reject) => {
        this.server!.once('listening', resolve);
        this.server!.once('error', () => reject(new OAuthError('failed', 'OAuth callback port unavailable.')));
        this.server!.listen(Number(redirect.port), '127.0.0.1');
      });
      timer = setTimeout(() => this.close(), this.options.loginTimeoutMs ?? 180_000);
      const url = new URL(AUTHORIZE_URL);
      for (const [key, value] of Object.entries({ response_type: 'code', client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri, scope: this.config.scopes.join(' '), state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
      const opening = open(url.href).catch(() => { throw new OAuthError('failed', 'Could not open OAuth login. No meeting joined.'); });
      // Browser navigation can itself wait for an HTTP callback; do not make
      // code handling depend on navigation completion.
      const authorizationCode = await Promise.race([code, opening.then(() => code)]);
      const pair = await this.exchange({ grant_type: 'authorization_code', code: authorizationCode,
        redirect_uri: this.config.redirectUri, code_verifier: verifier });
      if (this.closed) throw new OAuthError('canceled', 'OAuth login canceled.');
      this.pair = pair;
      return this.access();
    } catch (error) {
      this.close();
      throw error instanceof OAuthError ? error : new OAuthError('failed', 'OAuth login failed. No meeting joined.');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (this.server?.listening) await new Promise<void>(resolve => this.server!.close(() => resolve()));
      this.server = undefined;
    }
  }
  refresh(): Promise<AccessCredentials> {
    if (this.pending) return this.pending;
    const renew = () => this.delegate ? this.delegate.refresh().then(access => { this.delegatedAccess = access; return access; }) : this.renew();
    this.pending = (this.transferring ? this.transferring.then(renew) : renew()).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  watch(expiresAt: number, renew: () => void, failed: (reason: AuthProblem) => void): void {
    const current = this.delegate ? this.delegatedAccess : this.pair;
    if (this.closed || !current || current.expiresAt !== expiresAt) return;
    this.watched = { expiresAt, renew, failed };
    if (this.transferring && !this.delegate) return;
    clearTimeout(this.renewalTimer); clearTimeout(this.expiryTimer);
    const remaining = expiresAt - this.now();
    if (remaining <= 0) { this.close(); failed('expired'); return; }
    // The pinned SDK does not reliably arm its initial timer when credentials
    // hydrate from supplied attributes. Own the proactive deadline in Node and
    // invoke the SDK's PUBLIC refresh(), never private token mutation.
    this.arm('renewalTimer', Math.max(1, remaining - Math.min(60_000, remaining * .2)), () => {
      try { renew(); } catch { this.close(); failed('failed'); }
    });
    // Only the browser's acknowledgment of newly adopted credentials rearms
    // this deadline. A lost reply must not keep an expired SDK session alive.
    this.arm('expiryTimer', remaining, () => { this.close(); failed('expired'); });
  }
  private arm(key: 'renewalTimer' | 'expiryTimer', milliseconds: number, run: () => void): void {
    const deadline = performance.now() + milliseconds;
    const next = () => {
      if (this.closed) return;
      const remaining = deadline - performance.now();
      if (remaining <= 0) run();
      else this[key] = setTimeout(next, Math.min(2_147_000_000, Math.ceil(remaining)));
    };
    next(); // chunk long lifetimes instead of overflowing Node's 32-bit timer
  }
  private async renew(): Promise<AccessCredentials> {
    if (this.closed || !this.pair) throw new OAuthError('canceled', 'OAuth session is closed.');
    if (this.pair.refreshExpiresAt !== undefined && this.pair.refreshExpiresAt <= this.now()) {
      this.close(); throw new OAuthError('expired', 'OAuth refresh token expired. Sign in again.');
    }
    try {
      const pair = await this.exchange({ grant_type: 'refresh_token', refresh_token: this.pair.refreshToken }, this.pair);
      if (this.closed) throw new OAuthError('canceled', 'OAuth session closed during renewal.');
      this.pair = pair; return this.access();
    } catch (error) {
      // A lost response may have rotated the refresh token. Never replay an
      // uncertain grant or silently switch identity; require explicit sign-in.
      this.close();
      throw error instanceof OAuthError ? error : new OAuthError('failed', 'OAuth renewal failed. Sign in again.');
    }
  }
  private async exchange(fields: Record<string, string>, previous?: TokenPair): Promise<TokenPair> {
    const sentAt = this.now();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.options.tokenTimeoutMs ?? 15_000)]);
    let response: Response;
    try {
      response = await this.fetch(TOKEN_URL, { method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ ...fields, client_id: this.config.clientId, client_secret: this.clientSecret }).toString() });
    } catch { throw new OAuthError(this.closed ? 'canceled' : 'failed', 'OAuth token request failed. Sign in again; grant was not retried.'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new OAuthError([400, 401, 403].includes(response.status) ? 'denied' : 'failed', 'OAuth token endpoint refused the grant. Sign in again.');
    }
    const reader = response.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    try {
      if (!reader) throw new Error();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength; if (bytes > 65_536) { await reader.cancel(); throw new Error(); } chunks.push(value);
      }
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      const lifetime = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max ? value * 1000 : undefined;
      const expiresIn = lifetime(v.expires_in, 366 * 86400);
      const refreshIn = v.refresh_token_expires_in === undefined ? undefined : lifetime(v.refresh_token_expires_in, 5 * 366 * 86400);
      const refreshToken = v.refresh_token === undefined ? previous?.refreshToken : v.refresh_token;
      const scope = v.scope === undefined ? previous?.scope ?? this.config.scopes.join(' ') : v.scope;
      if (!validToken(v.access_token) || !validToken(refreshToken) || !expiresIn || !validScope(scope)
        || (v.token_type !== undefined && String(v.token_type).toLowerCase() !== 'bearer')
        || (v.refresh_token_expires_in !== undefined && !refreshIn)) throw new Error();
      const expiresAt = sentAt + expiresIn;
      if (!validExpiry(expiresAt) || expiresAt <= this.now()) throw new Error();
      return { token: v.access_token, expiresAt, scope, refreshToken,
        refreshExpiresAt: refreshIn ? sentAt + refreshIn : previous?.refreshExpiresAt };
    } catch { throw new OAuthError('failed', 'Invalid or expired OAuth token response. Sign in again.'); }
    finally { reader?.releaseLock(); }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.abort.abort(); this.pair = undefined; this.clientSecret = '';
    this.delegate?.close(); this.delegate = undefined; this.delegatedAccess = undefined; this.watched = undefined;
    clearTimeout(this.renewalTimer); clearTimeout(this.expiryTimer);
    this.server?.closeAllConnections(); this.server?.close();
  }
}
