import { setMaxListeners } from 'node:events';
import { PEOPLE_LIMITS, WEBEX_PRESENCE, WebexPeopleProvider, PeopleAdmission, PeopleReadOwner, PeopleStartBudget, PeopleRequestError, directPersonFromMemberships, peopleId,
  readPeopleJSON, type PeopleProviderOptions, type PeopleStatus } from './people-status.js';

export const SELECTED_PEOPLE_REASONS = Object.freeze(['off', 'scope-required', 'closed', 'denied', 'identity-missing', 'not-relevant', 'not-loaded',
  'missing-status', 'unknown-status', 'pending', 'unsupported-person', 'aged', 'expired', 'invalid-data', 'not-found', 'failed', 'rate-limited',
  'busy', 'canceled', 'timeout', 'not-shared', 'not-direct', 'not-selected', 'incomplete-memberships', 'invalid-memberships', 'demo', 'not-connected'] as const);
export type SelectedPeopleReason = typeof SELECTED_PEOPLE_REASONS[number];
/** Editor projection deliberately contains no person ID, credentials, scope list or raw provider text. */
export interface SelectedPeopleStatus extends Omit<PeopleStatus, 'personId' | 'state' | 'reason'> {
  capability: 'off' | 'scope-required' | 'ready' | 'unavailable';
  state: PeopleStatus['state'] | 'loading';
  roomId?: string;
  reason?: SelectedPeopleReason;
  requiredScope?: 'spark:people_read' | 'spark:memberships_read';
}
export function emptyPeopleStatus(enabled = false, reason: SelectedPeopleReason = enabled ? 'not-connected' : 'off'): SelectedPeopleStatus {
  return { capability: enabled ? 'unavailable' : 'off', state: 'unavailable', presence: 'unknown', customStatus: 'unsupported', reason };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const plain = (value: unknown): value is string => typeof value === 'string' && Array.from(value).length <= 120
  && !/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff\ud800-\udfff]/u.test(value);
const time = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function validSelectedPeopleStatus(value: unknown): value is SelectedPeopleStatus {
  if (!object(value) || Object.keys(value).some(key => !['capability', 'state', 'presence', 'customStatus', 'roomId', 'reason', 'requiredScope',
    'observedAt', 'displayName', 'lastActivity', 'retryAt'].includes(key)) || value.customStatus !== 'unsupported'
    || typeof value.capability !== 'string' || !['off', 'scope-required', 'ready', 'unavailable'].includes(value.capability)
    || typeof value.state !== 'string' || !['fresh', 'stale', 'unknown', 'unavailable', 'loading'].includes(value.state)
    || typeof value.presence !== 'string' || !WEBEX_PRESENCE.includes(value.presence as PeopleStatus['presence'])) return false;
  if (value.roomId !== undefined && !peopleId(value.roomId) || value.reason !== undefined && !SELECTED_PEOPLE_REASONS.includes(value.reason as SelectedPeopleReason)
    || value.requiredScope !== undefined && (typeof value.requiredScope !== 'string' || !['spark:people_read', 'spark:memberships_read'].includes(value.requiredScope))
    || value.displayName !== undefined && !plain(value.displayName)
    || value.observedAt !== undefined && !time(value.observedAt) || value.retryAt !== undefined && !time(value.retryAt)
    || value.lastActivity !== undefined && (typeof value.lastActivity !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.lastActivity)
      || !Number.isFinite(Date.parse(value.lastActivity)) || new Date(value.lastActivity).toISOString() !== value.lastActivity)) return false;
  if (['fresh', 'stale'].includes(String(value.state)) && (value.capability !== 'ready' || value.observedAt === undefined || value.roomId === undefined)) return false;
  if (value.state === 'unavailable' && value.presence !== 'unknown' || value.state === 'unknown' && !['unknown', 'pending'].includes(value.presence)) return false;
  return value.capability === 'ready' || value.state === 'unavailable' && value.presence === 'unknown';
}

interface PeerRoom {
  room: { id: string; type: 'direct' };
  value: SelectedPeopleStatus;
  peer?: { id: string; expiresAt: number };
  flight?: { promise: Promise<SelectedPeopleStatus>; abort: AbortController };
}
/** Selected + visible direct peers share one bounded identity/presence owner. */
export class WebexSelectedPeopleProvider {
  private readonly presence: WebexPeopleProvider;
  private readonly now: () => number;
  private readonly scope?: 'spark:people_read' | 'spark:memberships_read';
  private room?: { id: string; type: 'direct' | 'group' };
  private self?: { id: string; expiresAt: number };
  private selfFlight?: { promise: Promise<string>; abort: AbortController; waiters: number };
  private rooms = new Map<string, PeerRoom>();
  private peers = new Map<string, NonNullable<PeerRoom['peer']>>();
  private visible: { id: string; type: 'direct' }[] = [];
  private readonly admission: PeopleAdmission;
  private readonly readOwner: PeopleReadOwner;
  private readonly identityStarts: PeopleStartBudget;
  private readonly timeoutMs: number;
  private denied = false;
  private closed = false;
  private cooldown = 0;
  constructor(private readonly options: PeopleProviderOptions) {
    this.now = options.now ?? Date.now;
    this.readOwner = options.readOwner ?? new PeopleReadOwner(this.now);
    this.admission = this.readOwner.admission;
    this.presence = new WebexPeopleProvider({ ...options, readOwner: this.readOwner });
    this.identityStarts = this.readOwner.identity;
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs! > 0
      ? Math.min(options.timeoutMs!, PEOPLE_LIMITS.timeoutMs) : PEOPLE_LIMITS.timeoutMs;
    const grants = options.grantedScopes ?? [], all = grants.includes('spark:all');
    this.scope = !all && !grants.includes('spark:people_read') ? 'spark:people_read'
      : !all && !grants.includes('spark:memberships_read') ? 'spark:memberships_read' : undefined;
  }
  selectRoom(room?: { id: string; type: 'direct' | 'group' }): void {
    if (this.room?.id === room?.id && this.room?.type === room?.type) return;
    this.room = room && peopleId(room.id) ? { id: room.id, type: room.type } : undefined;
    this.reconcile();
  }
  /** Only the engine may supply already-listed, noncached direct rooms. Never fetches. */
  setVisibleRooms(rooms: readonly { id: string; type: 'direct' }[]): void {
    if (this.closed || !Array.isArray(rooms) || rooms.length > PEOPLE_LIMITS.relevant
      || rooms.some(room => !room || room.type !== 'direct' || !peopleId(room.id)) || new Set(rooms.map(room => room.id)).size !== rooms.length) return;
    this.visible = rooms.slice(0, PEOPLE_LIMITS.relevant).map(room => ({ ...room }));
    this.reconcile();
  }
  /** Catalogue revocation drops cached peer relationships, not just display rows. */
  retainRooms(ids: readonly string[]): void {
    const keep = new Set(ids);
    for (const [id, peer] of this.peers) if (!keep.has(id) || this.now() >= peer.expiresAt) this.peers.delete(id);
  }
  private reconcile(): void {
    const wanted = new Map<string, { id: string; type: 'direct' }>();
    if (this.room?.type === 'direct') wanted.set(this.room.id, { id: this.room.id, type: 'direct' });
    for (const room of this.visible) if (wanted.size < PEOPLE_LIMITS.relevant && peopleId(room.id) && room.type === 'direct') wanted.set(room.id, room);
    for (const [id, entry] of this.rooms) if (!wanted.has(id)) { entry.flight?.abort.abort(); this.rooms.delete(id); }
    for (const [id, room] of wanted) if (!this.rooms.has(id)) this.rooms.set(id, { room, peer: this.peers.get(id), value: {
      capability: 'ready', state: 'unknown', presence: 'unknown', customStatus: 'unsupported', roomId: id, reason: 'not-loaded',
    } });
    this.relevance();
  }
  private relevance(): void {
    this.presence.setRelevantPeople([...new Set([...this.rooms.values()].flatMap(entry => entry.peer ? [entry.peer.id] : []))]);
  }
  nextStartAt(): number { return Math.max(this.identityStarts.nextStartAt(), this.cooldown); }
  nextBatchAt(): number { return Math.max(this.presence.nextStartAt(), this.readOwner.retryAt, this.cooldown); }
  setParallelBatches(enabled: boolean): void {
    this.identityStarts.parallel(enabled); this.presence.setParallelBatches(enabled);
  }
  roomSnapshots(): SelectedPeopleStatus[] { return [...this.rooms.values()].map(entry => this.project(entry.room, entry.value)); }
  visibleSnapshots(): SelectedPeopleStatus[] {
    return this.visible.filter(room => this.rooms.has(room.id)).map(room => this.project(room, this.rooms.get(room.id)!.value));
  }
  snapshot(): SelectedPeopleStatus {
    return this.project(this.room, this.room && this.rooms.get(this.room.id)?.value);
  }
  private project(selected?: { id: string; type: 'direct' | 'group' }, observed?: SelectedPeopleStatus): SelectedPeopleStatus {
    const room = selected ? { roomId: selected.id } : {};
    if (this.closed) return { ...emptyPeopleStatus(true, 'closed'), ...room };
    if (this.options.enabled !== true) return { ...emptyPeopleStatus(), ...room };
    if (this.scope) return { ...emptyPeopleStatus(true, 'scope-required'), ...room, capability: 'scope-required', requiredScope: this.scope };
    if (this.denied || this.presence.capability().state === 'denied') return { ...emptyPeopleStatus(true, 'denied'), ...room };
    const value: SelectedPeopleStatus = observed ? { ...observed } : { capability: 'ready', state: 'unknown', presence: 'unknown',
      customStatus: 'unsupported', ...room, reason: !selected ? 'not-selected' : selected.type !== 'direct' ? 'not-direct' : 'not-loaded' };
    if (value.observedAt !== undefined) {
      const age = this.now() - value.observedAt;
      if (age < 0 || age >= PEOPLE_LIMITS.staleMs) return { capability: 'ready', state: 'unknown', presence: 'unknown', customStatus: 'unsupported', ...room, reason: 'expired',
        ...(value.retryAt !== undefined && value.retryAt > this.now() ? { retryAt: value.retryAt } : {}) };
      if (age >= PEOPLE_LIMITS.freshMs && value.state !== 'loading') { value.state = 'stale'; value.reason ??= 'aged'; }
    }
    return value;
  }
  lookup(): Promise<SelectedPeopleStatus> {
    return this.room?.type === 'direct' ? this.lookupRoom(this.room.id) : Promise.resolve(this.snapshot());
  }
  /** Resolve the whole reported batch with two HTTP readers, then one status GET. */
  async lookupRooms(ids: readonly string[]): Promise<SelectedPeopleStatus[]> {
    if (!Array.isArray(ids) || ids.length > PEOPLE_LIMITS.batch || !ids.every(peopleId) || new Set(ids).size !== ids.length)
      throw new PeopleRequestError('invalid-data');
    type Job = { entry: PeerRoom; signal: AbortSignal; resolve(value: SelectedPeopleStatus): void; reject(error: unknown): void };
    const jobs: Job[] = [];
    // Queue wait is not native I/O; each physical read retains its own deadline.
    const timeoutMs = this.timeoutMs * (Math.ceil(ids.length / PEOPLE_LIMITS.concurrency) + 2);
    const results = ids.map(id => this.lookupEntry(id, (entry, signal) =>
      new Promise<SelectedPeopleStatus>((resolve, reject) => jobs.push({ entry, signal, resolve, reject })),
      timeoutMs));
    const abort = new AbortController();
    // One bounded batch has one cancellation subscriber per requested person.
    setMaxListeners(PEOPLE_LIMITS.batch, abort.signal);
    let waiting = jobs;
    const canceled = () => {
      for (const job of jobs) if (job.signal.aborted) job.reject(new PeopleRequestError('canceled'));
      if (waiting.every(job => job.signal.aborted)) abort.abort();
    };
    for (const job of jobs) job.signal.addEventListener('abort', canceled, { once: true });
    const run = async () => {
      const queue = [...jobs], resolved: Job[] = [];
      await Promise.all(Array.from({ length: Math.min(PEOPLE_LIMITS.concurrency, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          try {
            const unavailable = await this.peer(job.entry, job.signal, false);
            if (unavailable) job.resolve(unavailable); else resolved.push(job);
          } catch (error) { job.reject(error); }
        }
      }));
      const active = resolved.filter(job => !job.signal.aborted && this.rooms.get(job.entry.room.id) === job.entry);
      if (!active.length) return;
      waiting = active; canceled();
      const retryAt = Math.max(this.cooldown, this.readOwner.retryAt);
      if (this.now() < retryAt) throw new PeopleRequestError('rate-limited', retryAt);
      await this.waitForStatus(abort.signal);
      const ready = active.filter(job => !job.signal.aborted && this.rooms.get(job.entry.room.id) === job.entry);
      if (!ready.length) return;
      const values = await this.presence.getMany([...new Set(ready.map(job => job.entry.peer!.id))], abort.signal);
      for (const job of ready) {
        const { personId: _personId, ...value } = values.find(value => value.personId === job.entry.peer!.id)!;
        job.resolve({ ...value, capability: 'ready', roomId: job.entry.room.id });
      }
    };
    void run().catch(error => { for (const job of jobs) job.reject(error); }).finally(() => {
      for (const job of jobs) job.signal.removeEventListener('abort', canceled);
    });
    return Promise.all(results);
  }
  /** No arbitrary identities: the room must already belong to the bounded relevance set. */
  lookupRoom(id: string): Promise<SelectedPeopleStatus> {
    return this.lookupEntry(id, (entry, signal) => this.load(entry, signal));
  }
  private lookupEntry(id: string, load: (entry: PeerRoom, signal: AbortSignal) => Promise<SelectedPeopleStatus>,
    timeoutMs = this.timeoutMs): Promise<SelectedPeopleStatus> {
    const entry = this.rooms.get(id);
    if (!entry) return Promise.resolve(emptyPeopleStatus(true, 'not-relevant'));
    const current = this.project(entry.room, entry.value);
    if (current.capability !== 'ready') return Promise.resolve(current);
    if (entry.flight) return entry.flight.promise;
    if (current.observedAt !== undefined && this.now() - current.observedAt < PEOPLE_LIMITS.freshMs && current.state !== 'stale'
      || current.retryAt !== undefined && this.now() < current.retryAt) return Promise.resolve(current);
    const room = entry.room, abort = new AbortController();
    entry.value = current.observedAt === undefined ? { ...current, state: 'loading' } : current;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeoutMs);
    const promise = load(entry, abort.signal).catch(error => {
      const reason: SelectedPeopleReason = abort.signal.aborted ? timedOut ? 'timeout' : 'canceled' : error instanceof PeopleRequestError ? error.reason : 'failed';
      if (reason === 'denied') this.denied = true;
      const retain = reason !== 'not-shared' && reason !== 'denied' && current.observedAt !== undefined && current.state !== 'unknown';
      return { capability: 'ready' as const, state: retain ? 'stale' as const : 'unavailable' as const,
        presence: retain ? current.presence : 'unknown' as const, customStatus: 'unsupported' as const,
        ...(retain ? { observedAt: current.observedAt, displayName: current.displayName, lastActivity: current.lastActivity } : {}),
        roomId: room.id, reason, ...(reason !== 'canceled' ? { retryAt: error instanceof PeopleRequestError && error.retryAt !== undefined ? error.retryAt : this.now() + PEOPLE_LIMITS.failureMs } : {}) };
    }).then(value => {
      if (!this.closed && this.rooms.get(room.id) === entry && (!abort.signal.aborted || timedOut)) entry.value = value;
      if (value.reason === 'rate-limited' && value.retryAt !== undefined) this.cooldown = Math.max(this.cooldown, value.retryAt);
      return this.project(room, entry.value.state === 'loading' ? value : entry.value);
    }).finally(() => { clearTimeout(timer); if (entry.flight?.promise === promise) entry.flight = undefined; });
    entry.flight = { promise, abort }; return promise;
  }
  private async identity(target: { self: true } | { roomId: string }, signal: AbortSignal): Promise<{ value: unknown; complete: boolean }> {
    if (signal.aborted) throw new PeopleRequestError('canceled');
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    const releaseAdmission = this.admission.acquire();
    let cleanup: Promise<unknown> = Promise.resolve(), cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new PeopleRequestError(signal.aborted ? 'canceled' : 'timeout'));
      requestSignal.addEventListener('abort', cancel, { once: true });
    });
    const native = (async () => readPeopleJSON(target, this.options.token(), this.options.fetcher, requestSignal, this.now,
      pending => { cleanup = Promise.allSettled([cleanup, pending]); }, { targetRefusal: true }))().catch(error => {
        if (error instanceof PeopleRequestError && error.reason === 'rate-limited') this.readOwner.defer(error.retryAt ?? this.now() + PEOPLE_LIMITS.failureMs);
        if (error instanceof PeopleRequestError && error.reason === 'denied') this.denied = true;
        throw error;
      });
    const release = async () => { await cleanup; releaseAdmission(); };
    const released = native.then(release, release);
    try { return await Promise.race([native.then(async value => { await released; return value; }), aborted]); }
    finally { requestSignal.removeEventListener('abort', cancel); }
  }
  private selfIdentity(signal: AbortSignal): Promise<string> {
    if (signal.aborted) return Promise.reject(new PeopleRequestError('canceled'));
    if (this.self && this.now() < this.self.expiresAt) return Promise.resolve(this.self.id);
    let flight = this.selfFlight;
    if (!flight) {
      const abort = new AbortController();
      const owner = { abort, waiters: 0, promise: Promise.resolve('') };
      owner.promise = this.identity({ self: true }, abort.signal).then(response => {
        const self = response.value;
        if (!object(self) || !peopleId(self.id) || self.errors !== undefined || self.type !== undefined && self.type !== 'person') throw new PeopleRequestError('identity-missing');
        if (this.closed || abort.signal.aborted) throw new PeopleRequestError('canceled');
        this.self = { id: self.id, expiresAt: this.now() + PEOPLE_LIMITS.staleMs };
        return self.id;
      }).finally(() => { if (this.selfFlight === owner) this.selfFlight = undefined; });
      flight = this.selfFlight = owner;
    }
    const owner = flight;
    if (owner.waiters >= PEOPLE_LIMITS.waiters) return Promise.reject(new PeopleRequestError('busy'));
    owner.waiters++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (value?: string, error?: unknown) => {
        if (done) return;
        done = true; signal.removeEventListener('abort', cancel);
        if (--owner.waiters === 0) owner.abort.abort();
        if (error) reject(error); else resolve(value!);
      };
      const cancel = () => finish(undefined, new PeopleRequestError('canceled'));
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      void owner.promise.then(value => finish(value), error => finish(undefined, error));
    });
  }
  private async peer(entry: PeerRoom, signal: AbortSignal, paced = true): Promise<SelectedPeopleStatus | undefined> {
    const room = entry.room;
    if (signal.aborted) throw new PeopleRequestError('canceled');
    if (this.denied || this.presence.capability().state === 'denied') throw new PeopleRequestError('denied');
    const retryAt = Math.max(this.cooldown, this.readOwner.retryAt);
    if (this.now() < retryAt) throw new PeopleRequestError('rate-limited', retryAt);
    if (!entry.peer || this.now() >= entry.peer.expiresAt) {
      if (paced && this.now() < this.identityStarts.nextStartAt()) throw new PeopleRequestError('rate-limited', this.identityStarts.nextStartAt());
      this.identityStarts.take();
      const self = await this.selfIdentity(signal);
      const response = await this.identity({ roomId: room.id }, signal);
      if (signal.aborted) throw new PeopleRequestError('canceled');
      const peer = directPersonFromMemberships(room, self, response.value, response.complete);
      if (peer.state !== 'resolved') return { capability: 'ready', state: 'unknown', presence: 'unknown', customStatus: 'unsupported', roomId: room.id,
        reason: peer.reason, retryAt: this.now() + PEOPLE_LIMITS.failureMs };
      entry.peer = { id: peer.personId, expiresAt: this.now() + PEOPLE_LIMITS.staleMs }; this.relevance();
      this.peers.delete(room.id); this.peers.set(room.id, entry.peer);
      while (this.peers.size > 500) this.peers.delete(this.peers.keys().next().value!);
    }
  }
  private async load(entry: PeerRoom, signal: AbortSignal): Promise<SelectedPeopleStatus> {
    const unavailable = await this.peer(entry, signal);
    if (unavailable) return unavailable;
    // Cached/batched results need no new start; only an actual GET waits.
    const id = entry.peer!.id, cached = this.presence.peek(id);
    const cachedRead = cached.observedAt !== undefined && this.now() - cached.observedAt < PEOPLE_LIMITS.freshMs && cached.state !== 'stale'
      || cached.retryAt !== undefined && this.now() < cached.retryAt;
    if (!cachedRead) await this.waitForStatus(signal);
    if (signal.aborted) throw new PeopleRequestError('canceled');
    const value = await this.presence.get(id, signal);
    const { personId: _personId, ...projected } = value;
    return { ...projected, capability: 'ready', roomId: entry.room.id };
  }
  private async waitForStatus(signal: AbortSignal): Promise<void> {
    while (this.now() < this.presence.nextStartAt()) {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new PeopleRequestError('canceled')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, Math.min(this.presence.nextStartAt() - this.now(), 2_147_483_647));
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
    if (signal.aborted) throw new PeopleRequestError('canceled');
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.rooms.values()) entry.flight?.abort.abort();
    this.selfFlight?.abort.abort();
    this.rooms.clear(); this.peers.clear(); this.visible = []; this.presence.close(); this.self = undefined;
  }
}
