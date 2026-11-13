/** Presence relevance/pacing/observation lifetime. No messaging store, OAuth, RPC or SDK. */
import { emptyPeopleStatus, type SelectedPeopleStatus } from './people-selected.js';
import { PEOPLE_LIMITS, PeopleReadOwner } from './people-status.js';

export interface PresenceRoom { id: string; type: 'direct' | 'group' }
/** Selected is current/non-revoked even outside a bounded list; directRooms admits viewport observations, never cached rows. */
export interface PresenceContext { selected?: PresenceRoom; directRooms: readonly string[] }
export interface PresenceSession {
  grantedScopes: readonly string[];
  token(): string;
  expiresAt: number;
  active(): boolean;
}
export interface PresenceSource {
  snapshot(): SelectedPeopleStatus;
  selectRoom(room?: PresenceRoom): void;
  setVisibleRooms(rooms: readonly { id: string; type: 'direct' }[]): void;
  retainRooms(ids: readonly string[]): void;
  setParallelBatches(enabled: boolean): void;
  roomSnapshots(): SelectedPeopleStatus[];
  visibleSnapshots(): SelectedPeopleStatus[];
  lookup(): Promise<SelectedPeopleStatus>;
  lookupRoom(id: string): Promise<SelectedPeopleStatus>;
  lookupRooms(ids: readonly string[]): Promise<SelectedPeopleStatus[]>;
  nextStartAt(): number;
  nextBatchAt(): number;
  close(): void;
}
interface Owner { source: PresenceSource; session: PresenceSession }
export interface PresenceOptions {
  create(session: PresenceSession, readOwner: PeopleReadOwner): PresenceSource;
  changed(): void;
  /** Provider/admission clock seam; scheduler/credential expiry retain real Date.now. */
  now?: () => number;
}
const OBSERVATION_LIMIT = 500;
export class PresenceLifecycle {
  private owner?: Owner;
  private readOwner?: PeopleReadOwner;
  private timer?: ReturnType<typeof setTimeout>;
  private enabled = false;
  private mode: 'demo' | 'live' = 'demo';
  private context: PresenceContext = { directRooms: [] };
  private spaces: string[] = [];
  private viewport: string[] = [];
  private values = new Map<string, SelectedPeopleStatus>();
  private spaceCursor = 0;
  private viewportFlight?: Owner;
  constructor(private readonly options: PresenceOptions) {}

  reset(enabled = false, mode: 'demo' | 'live' = 'demo'): void {
    this.stop(); this.enabled = enabled; this.mode = mode;
  }
  start(session: PresenceSession, context: PresenceContext): void {
    this.stop();
    if (!this.enabled || this.mode !== 'live') return;
    // Physical reservations and service backoff survive logical data replacement.
    this.readOwner ??= new PeopleReadOwner(this.options.now ?? Date.now);
    this.owner = { source: this.options.create(session, this.readOwner), session };
    this.sync(context);
  }
  /** Same application/account and unchanged grants; the engine token closure follows renewal. */
  renew(session: PresenceSession): boolean {
    if (!this.owner || !this.current(this.owner)
      || [...this.owner.session.grantedScopes].sort().join(' ') !== [...session.grantedScopes].sort().join(' ')) return false;
    this.owner.session = session;
    return true;
  }
  stop(): void {
    this.pause();
    const owner = this.owner; this.owner = undefined;
    this.spaces = []; this.spaceCursor = 0;
    this.viewport = []; this.values.clear(); this.viewportFlight = undefined;
    this.context = { directRooms: [] };
    owner?.source.close();
  }
  pause(): void { clearTimeout(this.timer); this.timer = undefined; }
  /** Local reconciliation only; room/history publication cannot initiate a read. */
  sync(context: PresenceContext): void {
    this.context = { selected: context.selected ? { ...context.selected } : undefined, directRooms: [...context.directRooms] };
    const source = this.owner?.source, eligible = new Set(this.context.directRooms);
    source?.selectRoom(this.context.selected);
    source?.retainRooms([...this.context.directRooms, ...(this.context.selected?.type === 'direct' ? [this.context.selected.id] : [])]);
    if (source && this.spaces.length) {
      this.spaces = this.spaces.filter(id => eligible.has(id));
      source.setVisibleRooms(this.spaces.map(id => ({ id, type: 'direct' })));
    }
    if (this.viewport.length || this.values.size) {
      this.viewport = this.viewport.filter(id => eligible.has(id));
      for (const id of this.values.keys()) if (!eligible.has(id)) this.values.delete(id);
      if (!this.spaces.length) source?.setVisibleRooms(this.viewport.map(id => ({ id, type: 'direct' })));
    }
  }
  deselect(): void {
    this.context = { ...this.context, selected: undefined };
    this.owner?.source.selectRoom(undefined);
  }
  private selected(): SelectedPeopleStatus {
    return this.owner?.source.snapshot() ?? emptyPeopleStatus(this.enabled,
      this.enabled && this.mode === 'demo' ? 'demo' : this.enabled ? 'not-connected' : 'off');
  }
  snapshot() {
    return { peopleStatus: this.selected(),
      ...(this.spaces.length ? { peopleSpaces: this.owner?.source.visibleSnapshots() ?? [] } : {}),
      ...(this.viewport.length ? { peopleViewport: this.viewportSnapshots() } : {}) };
  }
  async lookup(): Promise<SelectedPeopleStatus> {
    this.pause();
    const owner = this.owner, room = this.context.selected?.id;
    if (!owner) return this.selected();
    const { source } = owner;
    source.selectRoom(this.context.selected);
    const pending = source.lookup(); this.options.changed();
    const observed = await pending;
    if (this.current(owner) && this.context.selected?.id === room) {
      if (room) this.remember(room, observed);
      this.options.changed(); this.schedule(owner, room);
    }
    return this.selected();
  }
  private current(owner: Owner): boolean { return this.owner === owner && owner.session.active(); }
  private readable(owner: Owner): boolean {
    return this.current(owner) && this.enabled && Date.now() < owner.session.expiresAt;
  }
  private schedule(owner: Owner, room?: string): void {
    this.pause();
    if (this.viewport.length) { this.scheduleViewport(owner); return; }
    if (this.spaces.length) { this.scheduleSpaces(owner); return; }
    const { source } = owner, status = source.snapshot(), selected = this.context.selected;
    if (!room || selected?.id !== room || selected.type !== 'direct'
      || !this.readable(owner) || status.capability !== 'ready') return;
    const delay = Math.max(PEOPLE_LIMITS.freshMs, (status.retryAt ?? 0) - Date.now());
    const timer = this.timer = setTimeout(() => {
      if (this.timer !== timer) return;
      this.timer = undefined;
      if (this.readable(owner) && this.context.selected?.id === room && this.context.selected.type === 'direct') void this.lookup().catch(() => {});
    }, Math.min(delay, 2_147_483_647));
    timer.unref?.();
  }
  private retained(roomId: string, selected = this.owner?.source.snapshot()): SelectedPeopleStatus | undefined {
    const cached = this.values.get(roomId);
    if (selected?.roomId !== roomId) return cached;
    return !cached || selected.observedAt !== undefined && selected.state !== 'loading' ? selected : cached;
  }
  private remember(roomId: string, status: SelectedPeopleStatus): void {
    if (status.capability !== 'ready') { this.values.clear(); return; }
    if (!this.context.directRooms.includes(roomId)) return;
    const previous = this.values.get(roomId);
    const transient = ['not-loaded', 'not-relevant', 'failed', 'canceled', 'busy', 'timeout', 'rate-limited'];
    const value = previous?.observedAt !== undefined && status.observedAt === undefined && transient.includes(status.reason ?? '')
      ? { ...previous, ...(status.retryAt !== undefined ? { retryAt: status.retryAt } : {}) } : status;
    this.values.delete(roomId); this.values.set(roomId, { ...value });
    while (this.values.size > OBSERVATION_LIMIT) this.values.delete(this.values.keys().next().value!);
  }
  private viewportSnapshots(): SelectedPeopleStatus[] {
    const selected = this.owner?.source.snapshot();
    return this.viewport.map(roomId => {
      if (selected && selected.capability !== 'ready') return { ...selected, roomId };
      const value = this.retained(roomId, selected);
      if (!value) return { capability: 'ready', state: 'unknown', presence: 'unknown', customStatus: 'unsupported', roomId, reason: 'not-loaded' };
      const age = Date.now() - (value.observedAt ?? Date.now());
      if (age < 0 || age >= PEOPLE_LIMITS.staleMs) return { capability: 'ready', state: 'unknown', presence: 'unknown', customStatus: 'unsupported', roomId, reason: 'expired' };
      return { ...value, ...(age >= PEOPLE_LIMITS.freshMs && value.state === 'fresh' ? { state: 'stale' as const, reason: 'aged' as const } : {}) };
    });
  }
  /** Caller validates the bounded wire report against the loaded live room set. */
  setViewport(roomIds: string[]): void {
    const owner = this.owner;
    if (!this.enabled || !owner || roomIds.length === this.viewport.length && roomIds.every((id, i) => id === this.viewport[i])) return;
    this.pause(); this.spaces = []; this.viewport = [...roomIds];
    owner.source.setParallelBatches(roomIds.length > 0);
    // HTTP relevance is not the lifetime of already observed, session-local text.
    owner.source.setVisibleRooms(roomIds.map(id => ({ id, type: 'direct' as const })));
    this.options.changed(); this.schedule(owner, this.context.selected?.id);
  }
  private scheduleViewport(owner: Owner): void {
    const { source } = owner;
    if (!this.readable(owner) || source.snapshot().capability !== 'ready' || !this.viewport.length) return;
    if (this.viewportFlight === owner) return;
    const selected = this.context.selected?.type === 'direct' ? this.context.selected.id : undefined;
    const ids = [...new Set([...(selected ? [selected] : []), ...this.viewport])];
    const value = (id: string) => this.retained(id, source.snapshot());
    const due = (id: string) => Math.max(value(id)?.retryAt ?? 0, (value(id)?.observedAt ?? -PEOPLE_LIMITS.freshMs) + PEOPLE_LIMITS.freshMs);
    const wait = Math.max(0, source.nextBatchAt() - Date.now(), Math.min(...ids.map(due)) - Date.now());
    const timer = this.timer = setTimeout(() => {
      if (this.timer !== timer || this.owner !== owner) return;
      this.timer = undefined;
      if (!this.readable(owner) || !this.viewport.length) return;
      const targets = ids.filter(id => due(id) <= Date.now()).slice(0, PEOPLE_LIMITS.batch);
      if (!targets.length) { this.schedule(owner, this.context.selected?.id); return; }
      this.viewportFlight = owner;
      const pending = source.lookupRooms(targets);
      void pending.then(statuses => {
        if (this.owner !== owner) return;
        for (const status of statuses) if (status.roomId && (this.viewport.includes(status.roomId) || status.roomId === selected))
          this.remember(status.roomId, status);
      }).finally(() => {
        if (this.viewportFlight === owner) this.viewportFlight = undefined;
        if (this.current(owner)) { this.options.changed(); this.schedule(owner, this.context.selected?.id); }
      }).catch(() => {});
      this.options.changed();
    }, Math.min(wait, 2_147_483_647));
    timer.unref?.();
  }
  /** Legacy at-most-eight report; not a second provider or polling pool. */
  setSpaces(roomIds: string[]): void {
    const owner = this.owner;
    if (!this.enabled || !owner || roomIds.length === this.spaces.length && roomIds.every((id, i) => id === this.spaces[i])) return;
    this.pause(); this.spaces = [...roomIds];
    owner.source.setParallelBatches(false);
    owner.source.setVisibleRooms(this.spaces.map(id => ({ id, type: 'direct' })));
    this.options.changed(); this.schedule(owner, this.context.selected?.id);
  }
  private scheduleSpaces(owner: Owner): void {
    const { source } = owner;
    if (!this.readable(owner) || source.snapshot().capability !== 'ready' || !this.spaces.length) return;
    const now = Date.now(), values = source.roomSnapshots();
    if (!values.length) return;
    const due = (value: SelectedPeopleStatus) => Math.max(value.retryAt ?? 0,
      value.observedAt !== undefined ? value.observedAt + PEOPLE_LIMITS.freshMs : 0);
    const wait = Math.max(PEOPLE_LIMITS.intervalMs, source.nextStartAt() - now, Math.min(...values.map(due)) - now);
    const timer = this.timer = setTimeout(() => {
      if (this.timer !== timer || this.owner !== owner) return;
      this.timer = undefined;
      if (!this.readable(owner)) return;
      if (!this.spaces.length) { this.schedule(owner, this.context.selected?.id); return; }
      const current = source.roomSnapshots();
      let target: SelectedPeopleStatus | undefined;
      for (let i = 0; i < current.length; i++) {
        const index = (this.spaceCursor + i) % current.length, value = current[index]!;
        if (due(value) <= Date.now()) { target = value; this.spaceCursor = index + 1; break; }
      }
      if (!target?.roomId) { this.scheduleSpaces(owner); return; }
      const pending = source.lookupRoom(target.roomId); this.options.changed();
      void pending.finally(() => {
        if (this.current(owner)) { this.options.changed(); this.schedule(owner, this.context.selected?.id); }
      }).catch(() => {});
    }, Math.min(wait, 2_147_483_647));
    timer.unref?.();
  }
}
