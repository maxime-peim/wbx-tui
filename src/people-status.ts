/** Public People REST snapshots only. No SDK, subscriptions, config, or implicit network transport. */
import { validToken } from './auth-protocol.js';
import { peopleId } from './identity-contracts.js';
export { peopleId } from './identity-contracts.js';

export const PEOPLE_LIMITS = Object.freeze({ relevant: 129, batch: 85, concurrency: 2, waiters: 16, responseBytes: 65_536, batchBytes: 1_048_576, responseReads: 1024,
  freshMs: 60_000, staleMs: 300_000, failureMs: 30_000, intervalMs: 1000, timeoutMs: 8000 });
export const WEBEX_PRESENCE = Object.freeze(['active', 'call', 'DoNotDisturb', 'inactive', 'meeting', 'OutOfOffice', 'pending', 'presenting', 'unknown'] as const);
export type WebexPresence = typeof WEBEX_PRESENCE[number];
export type PeopleReason = 'off' | 'scope-required' | 'closed' | 'denied' | 'identity-missing' | 'not-relevant' | 'not-loaded'
  | 'missing-status' | 'unknown-status' | 'pending' | 'unsupported-person' | 'aged' | 'expired' | 'invalid-data'
  | 'not-found' | 'not-shared' | 'failed' | 'rate-limited' | 'busy' | 'canceled' | 'timeout';
export interface PeopleStatus {
  personId?: string;
  state: 'fresh' | 'stale' | 'unknown' | 'unavailable';
  presence: WebexPresence;
  customStatus: 'unsupported';
  /** Local response observation time, NOT a Webex presence-change timestamp. */
  observedAt?: number;
  displayName?: string;
  lastActivity?: string;
  reason?: PeopleReason;
  retryAt?: number;
}
export interface PeopleCapability {
  state: 'off' | 'scope-required' | 'ready' | 'denied' | 'closed';
  presence: 'rest-snapshot';
  customStatus: 'unsupported';
  requiredScope: 'spark:people_read';
}
export interface PeopleProviderOptions {
  /** Default OFF even with spark:all. This is approval, not authorization discovery. */
  enabled?: boolean;
  /** Previously obtained grant metadata; never inspect credentials/config to infer scopes. */
  grantedScopes?: readonly string[];
  token: () => string;
  /** Required injection: constructing/importing this module cannot use global fetch. */
  fetcher: typeof fetch;
  now?: () => number;
  /** May only shorten the fixed upper bound; useful for offline deadline fixtures. */
  timeoutMs?: number;
  /** Internal shared physical admission for identity and status stages; never an RPC/config option. */
  admission?: PeopleAdmission;
  /** Engine-lifetime transport limits survive replacement of logical provider data. */
  readOwner?: PeopleReadOwner;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? Array.from(value.slice(0, 4096)
  .replace(/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/[\ud800-\udfff]/gu, '\ufffd'))
  .slice(0, 120).join('').replace(/\s+/g, ' ').trim() : '';
const unknown = (personId: string | undefined, reason: PeopleReason, state: PeopleStatus['state'] = 'unavailable'): PeopleStatus =>
  ({ ...(personId ? { personId } : {}), state, presence: 'unknown', customStatus: 'unsupported', reason });

/** Discard undocumented customStatus fields and unrelated private profile data. */
export function parsePeopleStatus(value: unknown, personId: string, observedAt: number): PeopleStatus | undefined {
  if (!peopleId(personId) || !Number.isSafeInteger(observedAt) || observedAt < 0 || !object(value) || value.id !== personId || value.errors !== undefined) return;
  const displayName = text(value.displayName);
  const base = { personId, observedAt, customStatus: 'unsupported' as const, ...(displayName ? { displayName } : {}) };
  if (value.type !== undefined && value.type !== 'person') return { ...base, state: 'unknown', presence: 'unknown', reason: 'unsupported-person' };
  const presence = typeof value.status === 'string' && WEBEX_PRESENCE.includes(value.status as WebexPresence) ? value.status as WebexPresence : 'unknown';
  // Require an actual UTC timestamp, not Date.parse's permissive date/number coercion.
  const lastActivity = typeof value.lastActivity === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value.lastActivity)
    && Number.isFinite(Date.parse(value.lastActivity)) && Date.parse(value.lastActivity) <= observedAt
    && new Date(value.lastActivity).toISOString().slice(0, 19) === value.lastActivity.slice(0, 19)
    ? new Date(value.lastActivity).toISOString() : undefined;
  const reason: PeopleReason | undefined = value.status === undefined || value.status === null ? 'missing-status'
    : presence === 'unknown' ? 'unknown-status' : presence === 'pending' ? 'pending' : undefined;
  return { ...base, state: reason ? 'unknown' : 'fresh', presence, ...(lastActivity ? { lastActivity } : {}), ...(reason ? { reason } : {}) };
}

export type DirectPerson = { state: 'resolved'; personId: string }
  | { state: 'unknown'; reason: 'not-direct' | 'identity-missing' | 'incomplete-memberships' | 'invalid-memberships' };
/** Caller supplies one complete, room-filtered, authorized memberships response; no lookup by name/author/email. */
export function directPersonFromMemberships(room: unknown, selfPersonId: unknown, page: unknown, complete = false): DirectPerson {
  if (!object(room) || !peopleId(room.id) || !peopleId(selfPersonId)) return { state: 'unknown', reason: 'identity-missing' };
  if (room.type !== 'direct') return { state: 'unknown', reason: 'not-direct' };
  if (complete !== true) return { state: 'unknown', reason: 'incomplete-memberships' };
  if (!object(page) || !Array.isArray(page.items) || page.items.length !== 2) return { state: 'unknown', reason: 'invalid-memberships' };
  const ids: string[] = [];
  for (const member of page.items) {
    if (!object(member) || member.errors !== undefined || member.roomId !== room.id || !peopleId(member.personId)
      || member.roomType !== undefined && member.roomType !== 'direct') return { state: 'unknown', reason: 'invalid-memberships' };
    ids.push(member.personId);
  }
  const other = ids.find(id => id !== selfPersonId);
  return ids.includes(selfPersonId) && new Set(ids).size === 2 && other ? { state: 'resolved', personId: other }
    : { state: 'unknown', reason: 'identity-missing' };
}

const labels: Record<WebexPresence, string> = { active: 'Active (within 10 minutes)', call: 'In a call', DoNotDisturb: 'Do not disturb',
  inactive: 'Inactive (not necessarily offline)', meeting: 'In a meeting', OutOfOffice: 'Out of office', pending: 'Pending (never logged in)',
  presenting: 'Presenting', unknown: 'Unknown' };
/** Render as plain text, not Markdown, statusline format strings, commands, or editor expressions. */
export function peopleStatusLabel(status: PeopleStatus): string {
  if (status.state === 'unavailable') return status.reason === 'off' ? 'Presence off' : 'Presence unavailable';
  return (status.state === 'stale' ? 'Stale: ' : '') + labels[status.presence];
}

interface CacheEntry { value: PeopleStatus; retryAt: number }
interface Flight { controller: AbortController; promise: Promise<PeopleStatus>; waiters: number; admitted: number; reason: PeopleReason }
export class PeopleRequestError extends Error {
  constructor(readonly reason: PeopleReason, readonly retryAt?: number) { super(reason); }
}

export class PeopleAdmission {
  private active = 0;
  full(): boolean { return this.active >= PEOPLE_LIMITS.concurrency; }
  acquire(): () => void {
    if (this.full()) throw new PeopleRequestError('busy');
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
}

/** One start/second by default; explicit parallel mode permits two per two-second window. */
export class PeopleStartBudget {
  private burst = 1;
  private starts: number[] = [];
  private blockedUntil = 0;
  constructor(private readonly now: () => number, private readonly concurrency: number = PEOPLE_LIMITS.concurrency,
    private readonly intervalMs: number = PEOPLE_LIMITS.intervalMs) {}
  parallel(enabled: boolean): void {
    const burst = enabled ? this.concurrency : 1;
    if (burst === this.burst) return;
    // A mode change cannot reset spent admission or shorten a service cooldown.
    this.defer(this.nextBatchAt());
    this.burst = burst;
  }
  nextStartAt(): number {
    return Math.max(this.blockedUntil, this.starts.length >= this.burst
      ? this.starts[this.starts.length - this.burst]! + this.burst * this.intervalMs : 0);
  }
  nextBatchAt(): number {
    return Math.max(this.blockedUntil, this.starts.length ? this.starts.at(-1)! + this.burst * this.intervalMs : 0);
  }
  take(): void {
    this.starts.push(this.now());
    if (this.starts.length > this.concurrency) this.starts.shift();
  }
  defer(until: number): void { this.blockedUntil = Math.max(this.blockedUntil, until); }
}

/** Non-identifying transport ownership, separate from session/grant observations. */
export class PeopleReadOwner {
  readonly admission = new PeopleAdmission();
  readonly identity: PeopleStartBudget;
  readonly status: PeopleStartBudget;
  retryAt = 0;
  constructor(now: () => number) {
    this.identity = new PeopleStartBudget(now); this.status = new PeopleStartBudget(now);
  }
  defer(until: number): void {
    this.retryAt = Math.max(this.retryAt, until);
    this.identity.defer(until); this.status.defer(until);
  }
}

/** Explicit bounded exact-ID reads. No directory scan, background polling, persistence, or retry. */
export class WebexPeopleProvider {
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly granted: boolean;
  private relevant = new Set<string>();
  private cache = new Map<string, CacheEntry>();
  private flights = new Map<string, Flight>();
  private readonly admission: PeopleAdmission;
  private readonly starts: PeopleStartBudget;
  private readonly readOwner?: PeopleReadOwner;
  private denied = false;
  private closed = false;
  private token: () => string;
  private fetcher: typeof fetch;
  private readonly enabled: boolean;
  constructor(options: PeopleProviderOptions) {
    this.enabled = options.enabled === true;
    this.granted = Array.isArray(options.grantedScopes) && options.grantedScopes.length <= 128
      && options.grantedScopes.some(scope => scope === 'spark:people_read' || scope === 'spark:all');
    this.token = options.token; this.fetcher = options.fetcher; this.now = options.now ?? Date.now;
    this.readOwner = options.readOwner;
    this.starts = options.readOwner?.status ?? new PeopleStartBudget(this.now);
    this.admission = options.readOwner?.admission ?? options.admission ?? new PeopleAdmission();
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs! > 0
      ? Math.min(options.timeoutMs!, PEOPLE_LIMITS.timeoutMs) : PEOPLE_LIMITS.timeoutMs;
  }
  capability(): PeopleCapability {
    return { state: this.closed ? 'closed' : !this.enabled ? 'off' : !this.granted ? 'scope-required' : this.denied ? 'denied' : 'ready',
      presence: 'rest-snapshot', customStatus: 'unsupported', requiredScope: 'spark:people_read' };
  }
  /** Earliest start under pacing/service cooldown; never permission to replay HTTP. */
  nextStartAt(): number { return this.starts.nextStartAt(); }
  nextBatchAt(): number { return this.starts.nextBatchAt(); }
  setParallelBatches(enabled: boolean): void { this.starts.parallel(enabled); }
  /** Replace, never append. Invalid/oversized input fails atomically; removed work is canceled and forgotten. */
  setRelevantPeople(ids: readonly unknown[]): boolean {
    if (this.closed || !Array.isArray(ids) || ids.length > PEOPLE_LIMITS.relevant || !ids.every(peopleId) || new Set(ids).size !== ids.length) return false;
    this.relevant = new Set(ids as string[]);
    for (const id of this.cache.keys()) if (!this.relevant.has(id)) this.cache.delete(id);
    for (const [id, flight] of this.flights) if (!this.relevant.has(id)) flight.controller.abort();
    return true;
  }
  peek(personId: unknown): PeopleStatus {
    const id = peopleId(personId) ? personId : undefined, capability = this.capability().state;
    if (capability !== 'ready') return unknown(id, capability);
    if (!id) return unknown(undefined, 'identity-missing', 'unknown');
    if (!this.relevant.has(id)) return unknown(id, 'not-relevant', 'unknown');
    const entry = this.cache.get(id);
    if (!entry) return unknown(id, 'not-loaded', 'unknown');
    const value = entry.value, age = value.observedAt === undefined ? 0 : this.now() - value.observedAt;
    if (value.observedAt !== undefined && (age < 0 || age >= PEOPLE_LIMITS.staleMs)) return {
      ...unknown(id, 'expired', 'unknown'), ...(entry.retryAt > this.now() ? { retryAt: entry.retryAt } : {}),
    };
    return { ...value, ...(value.observedAt !== undefined && age >= PEOPLE_LIMITS.freshMs ? { state: 'stale', reason: value.reason ?? 'aged' } as const : {}) };
  }
  async get(personId: unknown, signal?: AbortSignal): Promise<PeopleStatus> {
    const current = this.peek(personId);
    if (this.capability().state !== 'ready' || !peopleId(personId) || !this.relevant.has(personId)) return current;
    if (signal?.aborted) return unknown(personId, 'canceled');
    if (this.now() < (this.cache.get(personId)?.retryAt ?? 0)) return current;
    const existing = this.flights.get(personId);
    if (existing) return this.wait(personId, existing, signal);
    if (this.admission.full()) return this.failure(personId, 'busy', this.now() + PEOPLE_LIMITS.failureMs);
    if (this.now() < this.starts.nextStartAt()) return this.failure(personId, 'rate-limited', this.starts.nextStartAt());
    this.start([personId]);
    return this.wait(personId, this.flights.get(personId)!, signal);
  }
  /** Documented People list-by-ID endpoint, never an unfiltered directory read. */
  async getMany(ids: readonly string[], signal?: AbortSignal): Promise<PeopleStatus[]> {
    if (!Array.isArray(ids) || ids.length > PEOPLE_LIMITS.batch || !ids.every(peopleId) || new Set(ids).size !== ids.length)
      throw new PeopleRequestError('invalid-data');
    if (signal?.aborted) return ids.map(id => unknown(id, 'canceled'));
    const needed = ids.filter(id => this.capability().state === 'ready' && this.relevant.has(id)
      && !this.flights.has(id) && this.now() >= (this.cache.get(id)?.retryAt ?? 0));
    if (needed.length && !this.admission.full() && this.now() >= this.starts.nextStartAt()) this.start(needed);
    return Promise.all(ids.map(id => this.get(id, signal)));
  }
  private failure(id: string, reason: PeopleReason, retryAt?: number): PeopleStatus {
    const old = this.peek(id);
    return { ...(old.observedAt !== undefined ? { ...old, state: 'stale' as const, reason } : unknown(id, reason)),
      ...(retryAt !== undefined ? { retryAt } : {}) };
  }
  private wait(id: string, flight: Flight, signal?: AbortSignal): Promise<PeopleStatus> {
    // Promise reactions cannot be detached on caller cancellation. Bound total attachments as well as
    // active waiters, so repeated canceled callers cannot accumulate behind one long-lived reader.
    if (flight.admitted >= PEOPLE_LIMITS.waiters) return Promise.resolve(this.failure(id, 'busy'));
    flight.waiters++; flight.admitted++;
    return new Promise(resolve => {
      let done = false;
      const finish = (value: PeopleStatus) => {
        if (done) return; done = true; signal?.removeEventListener('abort', cancel); flight.waiters--; resolve({ ...value });
        // One reader canceling must not cancel other readers of the same singleflight.
        if (flight.waiters === 0) flight.controller.abort();
      };
      const cancel = () => finish(unknown(id, 'canceled'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      void flight.promise.then(finish);
    });
  }
  private start(ids: readonly string[]): void {
    const release = this.admission.acquire();
    const batch = new AbortController();
    const flights = ids.map(id => {
      const flight: Flight = { controller: new AbortController(), promise: Promise.resolve(unknown(id, 'not-loaded')), waiters: 0, admitted: 0, reason: 'canceled' };
      this.flights.set(id, flight); return flight;
    });
    this.starts.take();
    let cleanup: Promise<unknown> = Promise.resolve();
    const retainCleanup = (pending: Promise<unknown>) => { cleanup = Promise.allSettled([cleanup, pending]); };
    const native = this.request(ids, batch.signal, retainCleanup).catch(error => {
      const problem = error instanceof PeopleRequestError ? error : new PeopleRequestError('failed');
      if (problem.reason === 'rate-limited') {
        const until = problem.retryAt ?? this.now() + PEOPLE_LIMITS.failureMs;
        this.starts.defer(until); this.readOwner?.defer(until);
      }
      return ids.map(id => problem.reason === 'denied' || problem.reason === 'not-shared'
        ? unknown(id, problem.reason) : this.failure(id, problem.reason, problem.retryAt));
    });
    // Result deadlines do not release native admission. Uncooperative fetch/body cancellation occupies a slot
    // until it really settles, including rejected/oversized responses whose body cancellation can also hang.
    void native.then(async () => { await cleanup; release(); });
    flights.forEach((flight, index) => {
      const id = ids[index]!;
      let cancel!: () => void;
      const aborted = new Promise<PeopleStatus>(resolve => {
        cancel = () => {
          resolve(unknown(id, flight.reason));
          if (flights.every(other => other.controller.signal.aborted)) batch.abort();
        };
        flight.controller.signal.addEventListener('abort', cancel, { once: true });
      });
      const timer = setTimeout(() => { flight.reason = 'timeout'; flight.controller.abort(); }, this.timeoutMs);
      flight.promise = Promise.race([native.then(values => values[index]!), aborted]).then(value => {
        if (this.closed || !this.relevant.has(id) || flight.controller.signal.aborted) return unknown(id, flight.reason);
        if (value.reason === 'denied') {
          this.denied = true; this.cache.clear();
          for (const other of this.flights.values()) if (other !== flight) { other.reason = 'denied'; other.controller.abort(); }
        } else {
          const retryAt = value.state === 'fresh' || value.state === 'unknown' ? this.now() + PEOPLE_LIMITS.freshMs
            : Math.max(this.now() + PEOPLE_LIMITS.failureMs, value.retryAt ?? 0);
          const cached = value.state === 'fresh' || value.state === 'unknown' ? { ...value } : { ...value, retryAt };
          this.cache.set(id, { value: cached, retryAt });
          return cached;
        }
        return value;
      }).finally(() => {
        clearTimeout(timer); flight.controller.signal.removeEventListener('abort', cancel);
        if (this.flights.get(id) === flight) this.flights.delete(id);
      });
    });
  }
  private async request(ids: readonly string[], signal: AbortSignal, retainCleanup: (pending: Promise<unknown>) => void): Promise<PeopleStatus[]> {
    const response = await readPeopleJSON(ids.length === 1 ? { personId: ids[0]! } : { personIds: ids },
      this.token(), this.fetcher, signal, this.now, retainCleanup, { targetRefusal: true });
    if (ids.length === 1) {
      const parsed = parsePeopleStatus(response.value, ids[0]!, this.now());
      if (!parsed) throw new PeopleRequestError('invalid-data');
      return [parsed];
    }
    const page = response.value;
    if (!object(page) || page.errors !== undefined || !Array.isArray(page.items) || page.items.length > ids.length)
      throw new PeopleRequestError('invalid-data');
    const values = new Map<string, PeopleStatus>();
    for (const item of page.items) {
      if (!object(item) || typeof item.id !== 'string' || !ids.includes(item.id) || values.has(item.id)) throw new PeopleRequestError('invalid-data');
      const parsed = parsePeopleStatus(item, item.id, this.now());
      if (!parsed) throw new PeopleRequestError('invalid-data');
      values.set(item.id, parsed);
    }
    return ids.map(id => values.get(id) ?? unknown(id, response.complete ? 'not-found' : 'invalid-data'));
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.token = () => ''; this.cache.clear(); this.relevant.clear();
    for (const flight of this.flights.values()) { flight.reason = 'closed'; flight.controller.abort(); }
  }
}

/** Shared bounded public GET decoder. Callers own admission, deadlines and approved grant checks. */
export async function readPeopleJSON(target: { self: true } | { roomId: string } | { personId: string } | { personIds: readonly string[] }, token: string,
  fetcher: typeof fetch, signal: AbortSignal, now: () => number, retainCleanup: (pending: Promise<unknown>) => void,
  options: { targetRefusal?: boolean } = {}): Promise<{ value: unknown; complete: boolean }> {
    const path = 'self' in target && target.self === true ? 'people/me' : 'roomId' in target && peopleId(target.roomId)
      ? `memberships?roomId=${encodeURIComponent(target.roomId)}&max=3` : 'personId' in target && peopleId(target.personId)
        ? `people/${encodeURIComponent(target.personId)}` : 'personIds' in target && Array.isArray(target.personIds)
          && target.personIds.length > 0 && target.personIds.length <= PEOPLE_LIMITS.batch && target.personIds.every(peopleId)
          && new Set(target.personIds).size === target.personIds.length
            ? `people?id=${encodeURIComponent(target.personIds.join(','))}&max=${target.personIds.length}` : undefined;
    if (!path) throw new PeopleRequestError('invalid-data');
    if (!validToken(token)) throw new PeopleRequestError('denied');
    const response = await fetcher(`https://webexapis.com/v1/${path}`, { method: 'GET', redirect: 'error',
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!response.ok) {
      if (response.body) retainCleanup(response.body.cancel());
      // Presence may isolate a target refusal. Other read owners retain their
      // existing denial policy; sharing a decoder does not share authorization.
      if (response.status === 403 && options.targetRefusal === true && !('self' in target)) throw new PeopleRequestError('not-shared');
      if ([401, 403].includes(response.status)) throw new PeopleRequestError('denied');
      if ([404, 410].includes(response.status)) throw new PeopleRequestError('not-found');
      if (response.status === 429) {
        const header = response.headers.get('retry-after') ?? '';
        const seconds = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now();
        // Never shorten a long server delay. An unrepresentable delay disables further requests for this instance.
        const retryAt = seconds === Infinity ? Number.MAX_SAFE_INTEGER : Number.isFinite(seconds) && seconds >= 0
          ? Math.min(Number.MAX_SAFE_INTEGER, now() + seconds) : now() + PEOPLE_LIMITS.failureMs;
        throw new PeopleRequestError('rate-limited', retryAt);
      }
      throw new PeopleRequestError('failed');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new PeopleRequestError('invalid-data');
    const cancel = () => { retainCleanup(reader.cancel()); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) { cancel(); throw new PeopleRequestError('canceled'); }
      let bytes = 0, reads = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > ('personIds' in target ? PEOPLE_LIMITS.batchBytes : PEOPLE_LIMITS.responseBytes)
          || ++reads > PEOPLE_LIMITS.responseReads) { cancel(); throw new PeopleRequestError('invalid-data'); }
        if (value.byteLength) chunks.push(value);
      }
      return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), complete: !response.headers.has('link') };
    } catch (error) { throw error instanceof PeopleRequestError ? error : new PeopleRequestError('invalid-data'); }
    finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
