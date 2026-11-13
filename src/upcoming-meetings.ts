/** Public List Meetings only. No startup, OAuth, calendar SDK, join, invitation or mutation side effects. */
import { validToken } from './auth-protocol.js';
import { validMeeting } from './protocol.js';

export const UPCOMING_MEETINGS_SCOPE = 'meeting:schedules_read' as const;
export const UPCOMING_MEETINGS_LIMITS = Object.freeze({ pages: 2, pageItems: 100, items: 200, cards: 3,
  responseBytes: 262_144, responseReads: 1024, native: 2, waiters: 16, timeoutMs: 8000,
  freshMs: 60_000, staleMs: 300_000, failureMs: 30_000, intervalMs: 10_000 });
export const UPCOMING_MEETINGS_WINDOW = Object.freeze({ graceMs: 300_000, aheadMs: 1_800_000, maxCards: 3 });
export type UpcomingMeetingState = 'active' | 'inProgress' | 'scheduled' | 'ready';
export interface UpcomingMeetingCard {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingType: 'meetingSeries' | 'scheduledMeeting';
  meetingState: UpcomingMeetingState;
  joinable: boolean;
  /** Derived from documented webLink, never from an undocumented joinURL or host/password field. */
  joinUrl?: string;
  joinReason?: 'link-unavailable' | 'stale';
}
export type UpcomingMeetingsReason = 'off' | 'closed' | 'scope-required' | 'identity-missing' | 'transport-unavailable'
  | 'not-loaded' | 'denied' | 'failed' | 'invalid-data' | 'unsafe-pagination' | 'rate-limited' | 'timeout' | 'canceled'
  | 'busy' | 'expired' | 'limit' | 'partial-data';
export interface UpcomingMeetingsSnapshot {
  state: 'off' | 'scope-required' | 'loading' | 'ready' | 'stale' | 'unavailable';
  /** API-visible host/invitee current series, not a claim of complete calendar/invitation coverage. */
  coverage: 'webex-current-series';
  requiredScope: typeof UPCOMING_MEETINGS_SCOPE;
  items: UpcomingMeetingCard[];
  complete: boolean;
  observedAt?: number;
  reason?: UpcomingMeetingsReason;
  retryAt?: number;
}
export interface UpcomingMeetingsSession {
  /** Already verified current-user identity/session key. Never used as a query filter or published. */
  accountId: string;
  grantedScopes?: readonly string[];
  token: () => string;
}
export interface UpcomingMeetingsWindow { graceMs: number; aheadMs: number; maxCards: number }
export interface UpcomingMeetingsOptions {
  enabled?: boolean;
  /** No global-fetch fallback. Missing transport is an inert capability state. */
  fetcher?: typeof fetch;
  session?: UpcomingMeetingsSession;
  now?: () => number;
  window?: Partial<UpcomingMeetingsWindow>;
  /** Can shorten, never enlarge, the whole-query deadline. */
  timeoutMs?: number;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_+-][A-Za-z0-9_+/-]{0,511}={0,2}$/.test(value);
const title = (value: unknown): string => typeof value === 'string' ? Array.from(value.slice(0, 4096)
  .replace(/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/[\ud800-\udfff]/gu, '\ufffd'))
  .slice(0, 120).join('').replace(/\s+/g, ' ').trim() : '';
export function upcomingMeetingTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return;
  const iso = new Date(value).toISOString();
  return iso.slice(0, 19) === value.slice(0, 19) ? iso : undefined;
}
/** Conservative visible/actionable link subset: no password, token, host-key, fragment or unknown query. */
export function upcomingMeetingURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || !validMeeting(value) || /[\s\\\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff#]/u.test(value)) return;
  const url = new URL(value);
  if (url.port || !url.hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return;
  if (/^\/meet\/[A-Za-z0-9_~.-]{1,128}$/.test(url.pathname) && !url.search) return url.href;
  if (!/^\/(?:[A-Za-z0-9_-]{1,128}\/)?j\.php$/.test(url.pathname)) return;
  const entries = [...url.searchParams];
  if (entries.length !== 1 || entries[0]![0] !== 'MTID' || !/^m[0-9a-f]{32}$/i.test(entries[0]![1])) return;
  url.search = ''; url.searchParams.set('MTID', entries[0]![1]);
  return url.href;
}
export function parseUpcomingMeeting(value: unknown): UpcomingMeetingCard | undefined {
  if (!object(value) || value.errors !== undefined || !id(value.id)) return;
  const series = value.meetingType === 'meetingSeries' && (value.state === 'active' || value.state === 'inProgress');
  const scheduled = value.meetingType === 'scheduledMeeting' && (value.state === 'scheduled' || value.state === 'ready');
  if (!series && !scheduled || value.scheduledType !== undefined && (typeof value.scheduledType !== 'string' || !['meeting', 'personalRoomMeeting'].includes(value.scheduledType))) return;
  const start = upcomingMeetingTime(value.start), end = upcomingMeetingTime(value.end);
  if (!start || !end || end <= start) return;
  const joinUrl = upcomingMeetingURL(value.webLink);
  return { id: value.id, title: title(value.title) || 'Untitled Webex meeting', start, end,
    meetingType: value.meetingType as UpcomingMeetingCard['meetingType'], meetingState: value.state as UpcomingMeetingState,
    joinable: !!joinUrl, ...(joinUrl ? { joinUrl } : { joinReason: 'link-unavailable' as const }) };
}
class UpcomingError extends Error {
  constructor(readonly reason: UpcomingMeetingsReason, readonly retryAt?: number) { super(reason); }
}
interface Flight {
  epoch: number; accountId: string; controller: AbortController; promise: Promise<UpcomingMeetingsSnapshot>;
  waiters: number; admitted: number; reason: 'canceled' | 'timeout';
}
interface Observed { at: number; items: UpcomingMeetingCard[]; complete: boolean; reason?: 'limit' | 'partial-data' }
const copy = (value: UpcomingMeetingsSnapshot): UpcomingMeetingsSnapshot => ({ ...value, items: value.items.map(item => ({ ...item })) });

export class WebexUpcomingMeetingsProvider {
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly window: { graceMs: number; aheadMs: number; maxCards: number };
  private readonly timeoutMs: number;
  private readonly fetcher?: typeof fetch;
  private session?: UpcomingMeetingsSession;
  private epoch = 0;
  private active = 0;
  private nextAt = 0;
  private flight?: Flight;
  private observed?: Observed;
  private failure?: UpcomingMeetingsReason;
  private denied = false;
  private closed = false;
  constructor(options: UpcomingMeetingsOptions = {}) {
    this.enabled = options.enabled === true; this.now = options.now ?? Date.now; this.fetcher = options.fetcher;
    this.window = { ...UPCOMING_MEETINGS_WINDOW, ...options.window };
    if (!Number.isSafeInteger(this.window.graceMs) || this.window.graceMs < 0 || this.window.graceMs > 900_000
      || !Number.isSafeInteger(this.window.aheadMs) || this.window.aheadMs < 1 || this.window.aheadMs > 7_200_000
      || !Number.isInteger(this.window.maxCards) || this.window.maxCards < 1 || this.window.maxCards > UPCOMING_MEETINGS_LIMITS.cards) throw new Error('Invalid bounded upcoming-meetings window.');
    if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)) throw new Error('Invalid upcoming-meetings deadline.');
    this.timeoutMs = Math.min(options.timeoutMs ?? UPCOMING_MEETINGS_LIMITS.timeoutMs, UPCOMING_MEETINGS_LIMITS.timeoutMs);
    this.setSession(options.session);
  }
  /** Replace ownership before awaiting anything. Old-account responses cannot refill the new account's cache. */
  setSession(session?: UpcomingMeetingsSession): void {
    if (this.closed) return;
    const previous = this.session?.accountId;
    this.epoch++; this.flight?.controller.abort(); this.flight = undefined; this.observed = undefined; this.failure = undefined; this.denied = false;
    this.session = session && id(session.accountId) && typeof session.token === 'function' ? { accountId: session.accountId, token: session.token,
      grantedScopes: Array.isArray(session.grantedScopes) && session.grantedScopes.length <= 128 && session.grantedScopes.every(scope => typeof scope === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(scope))
        ? [...session.grantedScopes] : [] } : undefined;
    if (previous !== this.session?.accountId) this.nextAt = 0;
  }
  private gate(): UpcomingMeetingsReason | undefined {
    if (this.closed) return 'closed';
    if (!this.enabled) return 'off';
    if (!this.session) return 'identity-missing';
    if (!this.session.grantedScopes?.includes(UPCOMING_MEETINGS_SCOPE)) return 'scope-required';
    if (typeof this.fetcher !== 'function') return 'transport-unavailable';
    if (this.denied) return 'denied';
  }
  snapshot(): UpcomingMeetingsSnapshot {
    const blocked = this.gate(), base = { coverage: 'webex-current-series' as const, requiredScope: UPCOMING_MEETINGS_SCOPE, complete: false, items: [] as UpcomingMeetingCard[] };
    if (blocked) return { ...base, state: blocked === 'off' || blocked === 'closed' ? 'off' : blocked === 'scope-required' ? 'scope-required' : 'unavailable', reason: blocked };
    const now = this.now(), observed = this.observed, age = observed ? now - observed.at : Infinity;
    const usable = observed !== undefined && age >= 0 && age < UPCOMING_MEETINGS_LIMITS.staleMs;
    const state = this.flight ? 'loading' : usable ? this.failure || age >= UPCOMING_MEETINGS_LIMITS.freshMs ? 'stale' : 'ready' : 'unavailable';
    const items = usable ? observed.items.filter(item => Date.parse(item.start) >= now - this.window.graceMs
      && Date.parse(item.start) < now + this.window.aheadMs && Date.parse(item.end) > now).slice(0, this.window.maxCards)
      .map(item => {
        if (state === 'ready') return { ...item };
        const { joinUrl: _joinUrl, ...cached } = item;
        return { ...cached, joinable: false, joinReason: 'stale' as const };
      }) : [];
    return { ...base, state, items, complete: usable ? observed.complete : false, ...(usable ? { observedAt: observed.at } : {}),
      ...(this.failure || !usable || observed.reason ? { reason: this.failure ?? (observed ? usable ? observed.reason : 'expired' : 'not-loaded') } : {}),
      ...(now < this.nextAt ? { retryAt: this.nextAt } : {}) };
  }
  /** Explicit current-user read only. No per-room/person selectors, polling, force-refresh bypass or implicit fetch. */
  refresh(signal?: AbortSignal): Promise<UpcomingMeetingsSnapshot> {
    if (this.gate()) return Promise.resolve(this.snapshot());
    if (signal?.aborted) return Promise.resolve(this.problem('canceled'));
    if (this.flight) return this.wait(this.flight, signal);
    const current = this.snapshot();
    if (current.state === 'ready') return Promise.resolve(current);
    if (this.now() < this.nextAt) return Promise.resolve(this.failure ? current : this.problem('rate-limited', this.nextAt));
    if (this.active >= UPCOMING_MEETINGS_LIMITS.native) return Promise.resolve(this.problem('busy'));
    return this.wait(this.start(), signal);
  }
  /** A future explicit-Enter handler can resolve only a currently displayed, fresh, safe link. Never joins. */
  joinTarget(meetingId: unknown): string | undefined {
    const snapshot = this.snapshot();
    return id(meetingId) && snapshot.state === 'ready' ? snapshot.items.find(item => item.id === meetingId && item.joinable)?.joinUrl : undefined;
  }
  private problem(reason: UpcomingMeetingsReason, retryAt?: number): UpcomingMeetingsSnapshot {
    const value = this.snapshot();
    return { ...value, state: value.observedAt !== undefined ? 'stale' : 'unavailable', reason, ...(retryAt !== undefined ? { retryAt } : {}),
      items: value.items.map(({ joinUrl: _joinUrl, ...item }) => ({ ...item, joinable: false, joinReason: 'stale' })) };
  }
  private wait(flight: Flight, signal?: AbortSignal): Promise<UpcomingMeetingsSnapshot> {
    if (flight.admitted >= UPCOMING_MEETINGS_LIMITS.waiters) return Promise.resolve(this.problem('busy'));
    flight.admitted++; flight.waiters++;
    return new Promise(resolve => {
      let done = false;
      const finish = (value: UpcomingMeetingsSnapshot) => {
        if (done) return; done = true; signal?.removeEventListener('abort', cancel); flight.waiters--; resolve(copy(value));
        if (!flight.waiters) flight.controller.abort();
      };
      const cancel = () => finish(this.problem('canceled'));
      signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
      void flight.promise.then(finish);
    });
  }
  private start(): Flight {
    const session = this.session!, flight: Flight = { epoch: this.epoch, accountId: session.accountId, controller: new AbortController(),
      promise: Promise.resolve(this.snapshot()), waiters: 0, admitted: 0, reason: 'canceled' };
    this.flight = flight; this.active++; this.nextAt = this.now() + UPCOMING_MEETINGS_LIMITS.intervalMs;
    let cleanup: Promise<unknown> = Promise.resolve(), cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new UpcomingError(flight.reason)); flight.controller.signal.addEventListener('abort', cancel, { once: true });
    });
    const timer = setTimeout(() => { flight.reason = 'timeout'; flight.controller.abort(); }, this.timeoutMs);
    const native = this.query(session, flight.controller.signal, pending => { cleanup = Promise.allSettled([cleanup, pending]); }).catch(error => {
      if (error instanceof UpcomingError && error.reason === 'rate-limited' && this.session?.accountId === flight.accountId)
        this.nextAt = Math.max(this.nextAt, error.retryAt ?? this.now() + UPCOMING_MEETINGS_LIMITS.failureMs);
      throw error;
    });
    const release = async () => { await cleanup; this.active--; };
    void native.then(release, release);
    flight.promise = Promise.race([native, aborted]).then(value => {
      if (flight.epoch === this.epoch && !this.closed && !flight.controller.signal.aborted) { this.observed = value; this.failure = undefined; }
    }, error => {
      if (flight.epoch !== this.epoch || this.closed) return;
      const problem = error instanceof UpcomingError ? error : new UpcomingError('failed');
      this.failure = problem.reason;
      if (problem.reason === 'denied') { this.denied = true; this.observed = undefined; }
      if (problem.reason !== 'canceled') this.nextAt = Math.max(this.nextAt, problem.retryAt ?? this.now() + UPCOMING_MEETINGS_LIMITS.failureMs);
    }).then(() => {
      if (this.flight === flight) this.flight = undefined;
      return this.snapshot();
    }).finally(() => { clearTimeout(timer); flight.controller.signal.removeEventListener('abort', cancel); });
    return flight;
  }
  private async query(session: UpcomingMeetingsSession, signal: AbortSignal, retain: (pending: Promise<unknown>) => void): Promise<Observed> {
    const now = this.now(), first = new URL('https://webexapis.com/v1/meetings');
    if (!Number.isSafeInteger(now) || now < this.window.graceMs || !Number.isFinite(new Date(now + this.window.aheadMs).getTime())) throw new UpcomingError('invalid-data');
    first.searchParams.set('meetingType', 'meetingSeries'); first.searchParams.set('current', 'true'); first.searchParams.set('max', '100');
    first.searchParams.set('from', new Date(now - this.window.graceMs).toISOString()); first.searchParams.set('to', new Date(now + this.window.aheadMs).toISOString());
    let url = first, complete = true, omitted = false; const seen = new Set<string>(), cards = new Map<string, UpcomingMeetingCard>();
    for (let page = 0; page < UPCOMING_MEETINGS_LIMITS.pages; page++) {
      if (signal.aborted) throw new UpcomingError('canceled');
      if (seen.has(url.href)) throw new UpcomingError('unsafe-pagination'); seen.add(url.href);
      const response = await this.page(url, session.token(), signal, retain);
      if (!object(response.value) || response.value.errors !== undefined || !Array.isArray(response.value.items) || response.value.items.length > UPCOMING_MEETINGS_LIMITS.pageItems) throw new UpcomingError('invalid-data');
      for (const raw of response.value.items) {
        const card = parseUpcomingMeeting(raw);
        if (!card) { omitted = true; continue; }
        const prior = cards.get(card.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(card)) throw new UpcomingError('invalid-data');
        cards.set(card.id, card);
      }
      const next = this.next(response.link, first);
      if (!next) break;
      if (seen.has(next.href)) throw new UpcomingError('unsafe-pagination');
      if (page + 1 === UPCOMING_MEETINGS_LIMITS.pages) { complete = false; break; }
      url = next;
    }
    return { at: this.now(), items: [...cards.values()].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
      complete: complete && !omitted, ...(!complete ? { reason: 'limit' as const } : omitted ? { reason: 'partial-data' as const } : {}) };
  }
  private next(header: string | null, first: URL): URL | undefined {
    if (!header) return;
    if (header.length > 8192) throw new UpcomingError('unsafe-pagination');
    let next: URL | undefined;
    for (const part of header.split(',')) {
      const match = /^\s*<([^<>\s]+)>\s*;\s*rel=(?:"(next|prev|first|last)"|(next|prev|first|last))\s*$/.exec(part);
      if (!match) throw new UpcomingError('unsafe-pagination');
      if ((match[2] ?? match[3]) !== 'next') continue;
      if (next) throw new UpcomingError('unsafe-pagination');
      try { next = new URL(match[1]!); } catch { throw new UpcomingError('unsafe-pagination'); }
      if (next.origin !== first.origin || next.pathname !== first.pathname || next.username || next.password || next.hash) throw new UpcomingError('unsafe-pagination');
      for (const [key, value] of first.searchParams) if (next.searchParams.getAll(key).length !== 1 || next.searchParams.get(key) !== value) throw new UpcomingError('unsafe-pagination');
      for (const [key, value] of next.searchParams) if (!first.searchParams.has(key)
        && (!['cursor', 'before', 'after', 'offset'].includes(key) || next.searchParams.getAll(key).length !== 1 || !/^[\x21-\x7e]{1,1024}$/.test(value))) throw new UpcomingError('unsafe-pagination');
    }
    return next;
  }
  private async page(url: URL, token: string, signal: AbortSignal, retain: (pending: Promise<unknown>) => void): Promise<{ value: unknown; link: string | null }> {
    if (!validToken(token)) throw new UpcomingError('denied');
    const response = await this.fetcher!(url.href, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', timezone: 'UTC' } });
    if (!response.ok) {
      if (response.body) retain(response.body.cancel());
      if ([401, 403].includes(response.status)) throw new UpcomingError('denied');
      if (response.status === 429) {
        const header = response.headers.get('retry-after') ?? '', delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - this.now();
        const retryAt = delay === Infinity ? Number.MAX_SAFE_INTEGER : Number.isFinite(delay) && delay >= 0
          ? Math.min(Number.MAX_SAFE_INTEGER, this.now() + delay) : this.now() + UPCOMING_MEETINGS_LIMITS.failureMs;
        throw new UpcomingError('rate-limited', retryAt);
      }
      throw new UpcomingError('failed');
    }
    const reader = response.body?.getReader(); if (!reader) throw new UpcomingError('invalid-data');
    const cancel = () => retain(reader.cancel()); signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) { cancel(); throw new UpcomingError('canceled'); }
      let bytes = 0, reads = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > UPCOMING_MEETINGS_LIMITS.responseBytes || ++reads > UPCOMING_MEETINGS_LIMITS.responseReads) { cancel(); throw new UpcomingError('invalid-data'); }
        if (value.byteLength) chunks.push(value);
      }
      return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), link: response.headers.get('link') };
    } catch (error) { throw error instanceof UpcomingError ? error : new UpcomingError('invalid-data'); }
    finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.epoch++; this.flight?.controller.abort(); this.flight = undefined;
    this.session = undefined; this.observed = undefined; this.failure = undefined;
  }
}
