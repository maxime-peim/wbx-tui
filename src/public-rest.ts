/** Explicit fixed-origin public metadata/actions. No SDK, refresh, redirects or replay. */
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { validToken } from './auth-protocol.js';
import { chatId } from './chat-protocol.js';
export const PUBLIC_REST_LIMITS = Object.freeze({ requestBytes: 8192, responseBytes: 262_144, reads: 1024, timeoutMs: 8000 });
export type PublicRequest = (options: RequestOptions, listener: (response: IncomingMessage) => void) => ClientRequest;
export type PublicMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type WriteEvidence = 'not-submitted' | 'refused' | 'possible-write';
export class PublicProblem extends Error {
  constructor(readonly reason: 'failed' | 'unknown', readonly status?: number, readonly submission?: WriteEvidence) {
    super(reason === 'unknown' ? 'Outcome UNKNOWN. Check Webex before resolving; nothing was replayed.' : 'Public operation unavailable/refused. Nothing was retried.');
  }
}
/** Status-less policy/ACK failures alone are not proof that a write was absent. */
export const definitelyNotWritten = (error: unknown): boolean => error instanceof PublicProblem
  && (error.submission === 'not-submitted' || error.submission === 'refused');
export interface PublicResponse { value: unknown; link?: string }
const refused = new Set([400, 401, 403, 404, 405, 409, 410, 413, 415, 422, 423, 428, 429]);
export function publicURL(path: string): URL {
  const url = new URL(path, 'https://webexapis.com');
  const teamMembers = url.pathname === '/v1/team/memberships';
  if (url.origin !== 'https://webexapis.com' || url.username || url.password || url.hash || url.href.length > 8192
    || !(teamMembers || /^\/v1\/(?:messages|people|memberships|rooms|teams)(?:\/[A-Za-z0-9_%+=-]+)?$/.test(url.pathname))) throw new PublicProblem('failed');
  if (teamMembers) {
    if ([...url.searchParams.keys()].length !== 2 || url.searchParams.getAll('teamId').length !== 1
      || url.searchParams.getAll('max').length !== 1 || !chatId(url.searchParams.get('teamId'))
      || url.searchParams.get('max') !== '100') throw new PublicProblem('failed');
    return url;
  }
  const id = url.pathname.split('/')[3];
  try { if (id && !chatId(decodeURIComponent(id))) throw new Error(); } catch { throw new PublicProblem('failed'); }
  return url;
}
export interface ActionREST { busy(): boolean; settled?(): Promise<void>; call(path: string, method: PublicMethod, token: string, signal: AbortSignal, body?: object): Promise<PublicResponse> }
export class PublicREST implements ActionREST {
  private physical = false;
  private physicalWork: Promise<void> = Promise.resolve();
  constructor(private request: PublicRequest = httpsRequest) {}
  busy(): boolean { return this.physical; }
  /** Cancellation can resolve a caller before the native socket/DNS closes. */
  settled(): Promise<void> { return this.physicalWork; }
  async call(path: string, method: PublicMethod, token: string, parent: AbortSignal, body?: object): Promise<PublicResponse> {
    let url: URL, data: Buffer | undefined;
    try {
      url = publicURL(path);
      if (url.pathname === '/v1/team/memberships' && (method !== 'GET' || body !== undefined)) throw new Error();
      data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
      if (this.physical || parent.aborted || !validToken(token) || data && data.length > PUBLIC_REST_LIMITS.requestBytes
        || data && (method === 'GET' || method === 'DELETE')) throw new Error();
    } catch { throw new PublicProblem('failed', undefined, 'not-submitted'); }
    this.physical = true;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal]);
    const timer = setTimeout(() => abort.abort(), PUBLIC_REST_LIMITS.timeoutMs); timer.unref?.();
    let cancel!: () => void, submitted = false;
    const canceled = new Promise<never>((_, reject) => {
      cancel = () => reject(new PublicProblem(submitted && method !== 'GET' ? 'unknown' : 'failed',
        undefined, submitted && method !== 'GET' ? 'possible-write' : 'not-submitted'));
      signal.addEventListener('abort', cancel, { once: true });
    });
    const native = this.native(url, method, token, signal, data, () => { submitted = true; })
      .finally(() => { this.physical = false; });
    this.physicalWork = native.then(() => {}, () => {});
    return Promise.race([native, canceled]).finally(() => { clearTimeout(timer); signal.removeEventListener('abort', cancel); });
  }
  private async native(url: URL, method: PublicMethod, token: string, signal: AbortSignal,
    data: Buffer | undefined, submitted: () => void): Promise<PublicResponse> {
    let sent = false, response: IncomingMessage | undefined, responseClosed: Promise<void> | undefined;
    const problem = () => new PublicProblem(sent && method !== 'GET' ? 'unknown' : 'failed',
      undefined, sent && method !== 'GET' ? 'possible-write' : 'not-submitted');
    let yes!: (value: PublicResponse) => void, no!: (error: Error) => void;
    const outcome = new Promise<PublicResponse>((resolve, reject) => { yes = resolve; no = reject; });
    const lookups: Promise<void>[] = [];
    const trackedLookup: RequestOptions['lookup'] = (host, options, callback) => {
      let done!: () => void; lookups.push(new Promise<void>(resolve => { done = resolve; }));
      lookup(host, options, (...args) => { try { callback(...args); } finally { done(); } });
    };
    let req: ClientRequest;
    try {
      req = this.request({ protocol: 'https:', hostname: 'webexapis.com', port: 443, path: url.pathname + url.search,
        method, agent: false, signal, lookup: trackedLookup,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': String(data.length) } : {}) } }, incoming => {
        response = incoming; responseClosed = new Promise<void>(resolve => incoming.once('close', resolve));
        const status = incoming.statusCode ?? 0;
        if (!(status === 200 || status === 201 || status === 204 && method === 'DELETE')) {
          no(new PublicProblem(method === 'GET' || refused.has(status) ? 'failed' : 'unknown', status,
            method === 'GET' ? 'not-submitted' : refused.has(status) ? 'refused' : 'possible-write')); incoming.destroy(); return;
        }
        void (async () => {
          try {
            const chunks: Buffer[] = []; let bytes = 0, reads = 0;
            for await (const raw of incoming) {
              const chunk = Buffer.from(raw); bytes += chunk.length;
              if (bytes > PUBLIC_REST_LIMITS.responseBytes || ++reads > PUBLIC_REST_LIMITS.reads) throw problem();
              chunks.push(chunk);
            }
            const link = incoming.headers.link;
            if (link !== undefined && (typeof link !== 'string' || link.length > 8192)) throw problem();
            if (status === 204 && bytes !== 0) throw problem();
            const value: unknown = status === 204 ? undefined : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
            if (status !== 204 && (!value || typeof value !== 'object' || Array.isArray(value))) throw problem();
            yes({ value, ...(link ? { link } : {}) });
          } catch { no(problem()); }
        })();
      });
    } catch { throw problem(); }
    const closed = new Promise<void>(resolve => req.once('close', resolve));
    req.on('error', () => no(problem()));
    try {
      if (signal.aborted) throw problem();
      submitted(); sent = true;
      req.end(data);
      return await outcome;
    } finally {
      req.destroy(); response?.destroy();
      await Promise.allSettled([closed, ...(responseClosed ? [responseClosed] : []), ...lookups]);
    }
  }
}
