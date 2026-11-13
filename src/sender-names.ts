/** Presentation-only name owner. Optional verified disk snapshots never grant identity authority. */
import { peopleId, readPeopleJSON, PeopleRequestError, PeopleStartBudget } from './people-status.js';
import { SENDER_NAME_LIMITS, senderName } from './identity-contracts.js';
export { SENDER_NAME_LIMITS, senderName, validSenderName } from './identity-contracts.js';
interface Session { enabled: boolean; grantedScopes: readonly string[]; token(): string }
interface Entry { name?: string; at: number; until: number; observedAt?: number }
interface Flight { id: string; epoch: number; abort: AbortController }
export class SenderNames {
  onChange = () => {};
  private epoch = 0;
  private token: () => string = () => '';
  private enabled = false;
  private denied = false;
  private relevant = new Set<string>();
  private cache = new Map<string, Entry>();
  private pending = new Set<string>();
  private physical = new Set<Flight>();
  private nextAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly now: () => number;
  private readonly starts: PeopleStartBudget;
  constructor(private options: { fetcher: typeof fetch; now?: () => number }) {
    this.now = options.now ?? Date.now;
    this.starts = new PeopleStartBudget(this.now, SENDER_NAME_LIMITS.concurrency, SENDER_NAME_LIMITS.intervalMs);
    this.starts.parallel(true);
  }
  allowed(): boolean { return this.enabled && !this.denied; }
  restore(entries: { id: string; name: string; observedAt: number }[]): void {
    if (!this.allowed()) return;
    const now = this.now();
    for (const entry of entries.slice(-SENDER_NAME_LIMITS.cache)) {
      if (!peopleId(entry.id) || !senderName(entry.name) || !Number.isSafeInteger(entry.observedAt)
        || entry.observedAt > now || now - entry.observedAt >= SENDER_NAME_LIMITS.ageMs
        || (this.cache.get(entry.id)?.observedAt ?? -1) >= entry.observedAt) continue;
      this.cache.set(entry.id, { name: senderName(entry.name), at: entry.observedAt,
        observedAt: entry.observedAt, until: entry.observedAt + SENDER_NAME_LIMITS.freshMs });
    }
    while (this.cache.size > SENDER_NAME_LIMITS.cache) this.cache.delete(this.cache.keys().next().value!);
  }
  persisted(): { id: string; name: string; observedAt: number }[] {
    if (!this.allowed()) return [];
    const now = this.now();
    return [...this.cache].flatMap(([id, e]) => e.name && e.observedAt !== undefined && now >= e.observedAt
      && now - e.observedAt < SENDER_NAME_LIMITS.ageMs ? [{ id, name: e.name, observedAt: e.observedAt }] : []);
  }
  /** Invalidate logical identity, not physical admission. Old work drains in this same owner. */
  setSession(session?: Session): void {
    this.epoch++; clearTimeout(this.timer); this.timer = undefined;
    this.pending.clear(); this.cache.clear(); this.relevant.clear(); this.denied = false;
    this.enabled = !!session?.enabled && session.grantedScopes.length <= 128
      && session.grantedScopes.some(scope => scope === 'spark:people_read' || scope === 'spark:all');
    this.token = this.enabled ? session!.token : () => '';
    for (const flight of this.physical) flight.abort.abort();
    // Do not reset nextAt: grant/account replacement cannot bypass request spacing.
  }
  peek(id: unknown): string | undefined {
    if (!this.enabled || this.denied || !peopleId(id) || !this.relevant.has(id)) return;
    const entry = this.cache.get(id), now = this.now();
    // Names are inert, account-scoped presentation, not freshness/identity
    // authority. Keep the last verified label visible during background refresh.
    return entry && entry.observedAt !== undefined && now >= entry.observedAt
      && now - entry.observedAt < SENDER_NAME_LIMITS.ageMs ? entry.name : undefined;
  }
  /** Call only from accepted store/event transitions. Never a render/getter side effect. */
  observe(ids: readonly unknown[]): void {
    if (!this.enabled || this.denied || !Array.isArray(ids)) return;
    const relevant = new Set<string>();
    for (const id of ids.slice(0, 1000)) {
      if (peopleId(id)) relevant.add(id);
      if (relevant.size === SENDER_NAME_LIMITS.relevant) break;
    }
    this.relevant = relevant;
    for (const flight of this.physical) if (flight.epoch === this.epoch && !relevant.has(flight.id)) flight.abort.abort();
    // Caller orders live-event identities first. Rebuild only this bounded queue,
    // never promises/listeners per message or an unbounded retry backlog.
    this.pending.clear();
    const now = this.now();
    for (const id of relevant) {
      const entry = this.cache.get(id);
      if (entry && now >= entry.at && now < entry.until || [...this.physical].some(flight => flight.epoch === this.epoch && flight.id === id)) continue;
      this.pending.add(id);
      if (this.pending.size === SENDER_NAME_LIMITS.pending) break;
    }
    this.drain();
  }
  diagnostics() { return { relevant: this.relevant.size, cached: this.cache.size, pending: this.pending.size, physical: this.physical.size }; }
  private drain(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.enabled || this.denied || !this.pending.size || this.physical.size >= SENDER_NAME_LIMITS.concurrency) return;
    const delay = Math.max(this.nextAt, this.starts.nextStartAt()) - this.now();
    if (delay > 0) {
      this.timer = setTimeout(() => { this.timer = undefined; this.drain(); }, Math.min(delay, 0x7fffffff));
      this.timer.unref?.(); return;
    }
    const id = this.pending.values().next().value!; this.pending.delete(id);
    const flight: Flight = { id, epoch: this.epoch, abort: new AbortController() };
    this.physical.add(flight); this.starts.take();
    const timer = setTimeout(() => flight.abort.abort(), SENDER_NAME_LIMITS.timeoutMs); timer.unref?.();
    void this.request(flight).finally(() => {
      clearTimeout(timer); this.physical.delete(flight); this.drain();
    });
    this.drain();
  }
  private async request(flight: Flight): Promise<void> {
    let cleanup: Promise<unknown> = Promise.resolve(), name: string | undefined, denied = false;
    const retain = (work: Promise<unknown>) => { cleanup = Promise.allSettled([cleanup, work]); };
    try {
      const { value } = await readPeopleJSON({ personId: flight.id }, this.token(), this.options.fetcher, flight.abort.signal, this.now, retain);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const profile = value as Record<string, unknown>;
        if (profile.id === flight.id && profile.errors === undefined
          && (profile.type === undefined || profile.type === 'person' || profile.type === 'bot' || profile.type === 'appuser')) name = senderName(profile.displayName) || undefined;
      }
    } catch (error) {
      if (flight.epoch === this.epoch && error instanceof PeopleRequestError) {
        denied = error.reason === 'denied';
        if (error.reason === 'rate-limited') this.nextAt = Math.max(this.nextAt, error.retryAt ?? this.now() + SENDER_NAME_LIMITS.negativeMs);
      }
    } finally {
      // Includes response-body cancellation; a logical abort never frees a slot.
      await cleanup;
    }
    if (flight.epoch !== this.epoch || !this.enabled || this.denied || !this.relevant.has(flight.id)) return;
    if (denied) {
      this.denied = true; this.cache.clear(); this.pending.clear();
      for (const other of this.physical) other.abort.abort();
      this.onChange(); return;
    }
    const at = this.now();
    const previousEntry = this.cache.get(flight.id), previous = previousEntry?.name;
    const retained = name && !flight.abort.signal.aborted ? name : previous;
    this.cache.delete(flight.id);
    this.cache.set(flight.id, { ...(retained ? { name: retained } : {}), at,
      ...(name && !flight.abort.signal.aborted ? { observedAt: at } : previousEntry?.observedAt !== undefined ? { observedAt: previousEntry.observedAt } : {}),
      until: at + (name && !flight.abort.signal.aborted ? SENDER_NAME_LIMITS.freshMs : SENDER_NAME_LIMITS.negativeMs) });
    while (this.cache.size > SENDER_NAME_LIMITS.cache) this.cache.delete(this.cache.keys().next().value!);
    this.onChange();
  }
}
