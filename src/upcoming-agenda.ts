/** Session-scoped agenda lifecycle. No messaging store, OAuth, RPC, editor or join side effects. */
import {
  UPCOMING_MEETINGS_SCOPE, type UpcomingMeetingCard, type UpcomingMeetingsSession,
  type UpcomingMeetingsSnapshot,
} from './upcoming-meetings.js';

/** Narrow provider port: the agenda owns scheduling, the provider owns bounded service reads. */
export interface AgendaSource {
  snapshot(): UpcomingMeetingsSnapshot;
  refresh(signal?: AbortSignal): Promise<UpcomingMeetingsSnapshot>;
  setSession(session: UpcomingMeetingsSession): void;
  joinTarget(meetingId: unknown): string | undefined;
  close(): void;
}
export interface AgendaSession {
  credentials: UpcomingMeetingsSession;
  signal?: AbortSignal;
  /** The composition root supplies session validity, never its mutable state. */
  active(): boolean;
}
export interface AgendaOptions {
  create(session: UpcomingMeetingsSession): AgendaSource;
  changed(): void;
}
export type AgendaSnapshot = Omit<UpcomingMeetingsSnapshot, 'items'> & {
  items: Omit<UpcomingMeetingCard, 'joinUrl'>[];
  revision: number;
};
type Projection = Omit<AgendaSnapshot, 'revision'>;
interface Owner { source: AgendaSource; session: AgendaSession }

function project(value: UpcomingMeetingsSnapshot = {
  state: 'off', coverage: 'webex-current-series', requiredScope: UPCOMING_MEETINGS_SCOPE,
  complete: false, items: [], reason: 'off',
}): Projection {
  // Action URLs remain provider-owned. Published rows carry identity/revision only.
  return { ...value, items: value.items.map(({ joinUrl: _url, ...item }) => item) };
}

export class UpcomingAgenda {
  private owner?: Owner;
  private timer?: ReturnType<typeof setTimeout>;
  private value = project();
  private revision = 1;
  private key = JSON.stringify(this.value);
  constructor(private readonly options: AgendaOptions) {}

  /** Detached committed data only: repeated snapshot reads neither age nor revise it. */
  snapshot(): AgendaSnapshot {
    return { ...this.value, items: this.value.items.map(item => ({ ...item })), revision: this.revision };
  }
  /** Explicit publication/action boundary; never called implicitly by snapshot(). */
  reconcile(): boolean {
    const projection = project(this.owner?.source.snapshot()), key = JSON.stringify(projection);
    if (key === this.key) return false;
    this.value = projection; this.key = key; this.revision++;
    return true;
  }
  start(session: AgendaSession): void {
    this.clearTimer();
    const previous = this.owner;
    // Reuse the provider's physical admission owner across credential renewal.
    // Replacing this handle fences old callbacks even when that source is reused.
    this.owner = { source: previous?.source ?? this.options.create(session.credentials), session };
    if (previous) this.owner.source.setSession(session.credentials);
    this.reconcile();
    this.schedule(this.owner);
  }
  stop(): void {
    const owner = this.owner;
    this.owner = undefined;
    this.clearTimer();
    owner?.source.close();
    this.reconcile();
  }
  async refresh(): Promise<AgendaSnapshot> {
    const owner = this.owner;
    if (!owner || !this.current(owner)) return this.snapshot();
    const pending = owner.source.refresh(owner.session.signal);
    this.announce();
    await pending;
    if (this.current(owner)) {
      this.announce();
      this.schedule(owner);
    }
    return this.snapshot();
  }
  /** Resolve, never join/fetch. The caller retains explicit join admission. */
  joinTarget(meetingId: string, revision: number): string | undefined {
    const owner = this.owner;
    if (!owner || !this.current(owner)) return;
    // A delayed timer cannot authorize an expired row.
    this.announce();
    if (!this.current(owner) || revision !== this.revision) return;
    return owner.source.joinTarget(meetingId);
  }
  private current(owner: Owner): boolean {
    return owner === this.owner && owner.session.active() && !owner.session.signal?.aborted;
  }
  private announce(): void {
    // A cache hit is a successful feature response, not an application redraw.
    if (this.reconcile()) this.options.changed();
  }
  private clearTimer(): void {
    clearTimeout(this.timer); this.timer = undefined;
  }
  private schedule(owner: Owner): void {
    if (owner !== this.owner) return;
    this.clearTimer();
    if (['off', 'scope-required'].includes(this.value.state)) return;
    this.timer = setTimeout(() => {
      if (!this.current(owner)) return;
      this.announce(); // Expiry must not wait behind an unresolved service read.
      this.schedule(owner);
      if (this.current(owner) && ['stale', 'unavailable'].includes(this.value.state)) {
        void this.refresh().catch(() => {});
      }
    }, 15_000);
    this.timer.unref?.();
  }
}
