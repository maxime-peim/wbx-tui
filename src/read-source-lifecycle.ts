/** Current SDK source/health/events only. No retained unread ledger, disk cache, OAuth or messaging store. */
import type { AccessCredentials } from './auth-protocol.js';
import type { ReadStatusSource } from './read-status.js';
import { sameRoomReadStatus, validMessageCreated, validReadChange, MESSAGE_EVENT_LIMITS,
  type ReadChange, type MessageCreated, type RoomReadStatus, type ReadStatusFailure } from './read-status-protocol.js';
import { ReactionReadError, type ReactionCommand, type ReactionBatch, type ReactionProgress } from './reaction-contracts.js';
import type { ReaderTarget, MessageReaders } from './message-readers.js';
import { JOINED_MEETINGS_LIMITS, validJoinedMeetings, type JoinedMeetingsSnapshot } from './joined-meetings.js';

export type ReadSourceStatus = 'off' | 'connecting' | 'ready' | 'failed';
export interface ReadSourceSession {
  credentials: AccessCredentials;
  preview: boolean;
  senderNames: boolean;
  joinedMeetings?: boolean;
  current(): boolean;
  phase(): 'connecting' | 'ready' | 'inactive';
}
export interface ReadSourceEffects {
  create(): ReadStatusSource;
  revoked(roomId: string): boolean;
  /** Every genuine observation, even unchanged; never a healthy/empty freshness grant. */
  observed(rooms: RoomReadStatus[], observedAt: number, changed: boolean): void;
  started(rooms: RoomReadStatus[]): void;
  changed(): void;
  eventsChanged(): void;
  changes(changes: ReadChange[]): void;
  invalidated(): void;
  overflow(): void;
}
interface Owner { source: ReadStatusSource; session: ReadSourceSession }
type MessageEvidence = MessageCreated & { observedAt: number };
export class ReadSourceLifecycle {
  private owner?: Owner;
  private fresh = new Map<string, RoomReadStatus>();
  private pending = new Map<string, ReadChange>();
  private state: ReadSourceStatus = 'off';
  private diagnostic = '';
  private epoch = 0;
  private revision = 0;
  private degraded = false;
  private eventState: 'off' | 'connecting' | 'live' | 'polling' | 'failed' = 'off';
  private since = 0;
  private received = 0;
  private events = new Map<string, MessageEvidence>();
  private seen = new Set<string>();
  private senders = false;
  private sourceReady = false;
  private rateLimited = false;
  private joined: JoinedMeetingsSnapshot = { state: 'off', partial: true, items: [] };
  constructor(private readonly effects: ReadSourceEffects) {}
  get status(): ReadSourceStatus { return this.state; }
  get notice(): string { return this.diagnostic; }
  joinedMeetings(): JoinedMeetingsSnapshot {
    const observed = this.joined.observedAt, now = Date.now();
    return this.joined.state === 'ready' && (observed === undefined || now < observed || now - observed > JOINED_MEETINGS_LIMITS.freshMs
      || this.rateLimited || !this.owner || !this.current(this.owner) || this.owner.session.credentials.expiresAt <= now)
      ? { state: 'unavailable', partial: true, items: [] } : structuredClone(this.joined);
  }
  refreshJoinedMeetings(): void {
    if (this.readable() && this.owner?.session.joinedMeetings) this.owner.source.discoverJoinedMeetings?.();
  }
  senderNames(): boolean { return this.senders; }
  hasRoom(id: string): boolean { return this.fresh.has(id); }
  notifications(id:string):boolean|undefined { return this.fresh.get(id)?.notifications; }
  rooms(): RoomReadStatus[] { return [...this.fresh.values()].map(room => ({ ...room })); }
  messages(): MessageEvidence[] { return [...this.events.values()].map(message => ({ ...message })); }
  eventStatus() { return { state: this.eventState, received: this.received }; }
  diagnostics() { return { freshRooms: this.fresh.size, pendingChanges: this.pending.size,
    retainedEvents: this.events.size, seenEvents: this.seen.size }; }
  evidence() { return { epoch: this.epoch, revision: this.revision,
    degraded: !!this.owner && this.degraded && this.state === 'failed',
    ...(this.state === 'failed' && this.readable() ? { readable: true as const } : {}) }; }
  /** Capture source identity without exporting the source or claiming domain authority. */
  lease(): () => boolean {
    const owner = this.owner;
    return () => this.owner === owner;
  }
  private current(owner: Owner): boolean { return this.owner === owner && owner.session.current(); }
  private clear(): void {
    this.effects.invalidated();
    this.epoch++; this.revision = 0; this.degraded = false;
    this.sourceReady = false; this.rateLimited = false;
    this.joined = { state: 'off', partial: true, items: [] };
    const owner = this.owner; this.owner = undefined;
    this.fresh.clear(); this.pending.clear();
    this.eventState = 'off'; this.events.clear(); this.seen.clear(); this.received = 0; this.senders = false;
    owner?.source.close();
  }
  stop(): void { this.clear(); this.state = 'off'; this.diagnostic = ''; }
  sessionFailed(enabled: boolean): void { this.clear(); if (enabled) this.state = 'failed'; }
  takeChanges(): ReadChange[] {
    const changes = [...this.pending.values()].map(change => ({ ...change }));
    this.pending.clear(); return changes;
  }
  forgetRoom(roomId: string): void {
    this.fresh.delete(roomId);
    for (const [key, event] of this.events) if (event.roomId === roomId) this.events.delete(key);
  }
  start(session: ReadSourceSession): Promise<void> {
    if (!session.current()) return Promise.resolve();
    this.clear(); this.diagnostic = '';
    if (session.joinedMeetings) this.joined = { state: 'loading', partial: true, items: [] };
    if (!session.credentials.scope.split(/\s+/).includes('spark:all')) {
      this.state = 'failed';
      if (session.joinedMeetings) this.joined = { state: 'unavailable', partial: true, items: [] };
      this.diagnostic = 'Webex read status needs spark:all (including spark:kms). Update your OAuth integration scopes and reconnect explicitly.';
      this.effects.changed(); return Promise.resolve();
    }
    const owner = this.owner = { source: this.effects.create(), session }, source = owner.source;
    source.onJoinedMeetings = snapshot => {
      if (!this.current(owner) || !session.joinedMeetings || this.rateLimited || !validJoinedMeetings(snapshot)) return;
      this.joined = structuredClone(snapshot); this.effects.changed();
    };
    this.senders = session.preview && session.senderNames
      && session.credentials.scope.split(/\s+/).some(scope => ['spark:all', 'spark:people_read'].includes(scope));
    this.eventState = 'connecting'; this.since = Date.now(); this.state = 'connecting';
    this.effects.changed();
    source.onRooms = rooms => {
      if (!this.current(owner)) return;
      const next = new Map(rooms.slice(0, 500).filter(room => !this.effects.revoked(room.id)
        && !this.pending.has(JSON.stringify(['room-revoked', room.id, '']))).map(room => [room.id, { ...room }]));
      const changed = next.size !== this.fresh.size || [...next.values()].some(room => !sameRoomReadStatus(this.fresh.get(room.id), room));
      if (changed) this.fresh = next;
      this.effects.observed([...next.values()].map(room => ({ ...room })), Date.now(), changed);
    };
    source.onHealth = health => {
      if (!this.current(owner)) return;
      // Preserve same-source degradation even when failed -> ready publications coalesce.
      if (['refresh-unavailable', 'rate-limited'].includes(health) && !this.degraded) this.revision++;
      this.degraded = health === 'refresh-unavailable' || health === 'rate-limited';
      this.rateLimited = health === 'rate-limited';
      if (this.rateLimited && session.joinedMeetings) this.joined = { state: 'unavailable', partial: true, items: [] };
      this.state = this.degraded ? 'failed' : 'ready';
      if (!this.degraded) this.eventState = health === 'polling' ? 'polling' : 'live';
      if (this.degraded) { this.fresh.clear(); this.effects.invalidated(); }
      this.diagnostic = health === 'rate-limited'
        ? 'Server read discovery rate-limited. SDK reads are paused for server backoff; retained observations stay stale. No writes are retried.'
        : health === 'refresh-unavailable'
        ? 'Server read-status refresh failed; last-confirmed flags are retained locally as stale. Never-observed spaces remain unknown. Background status refresh will try again.'
        : health === 'polling' ? 'Live unread events unavailable; read status uses periodic server refresh.'
        : health === 'room-unavailable' ? 'Read status unavailable for some spaces; other spaces remain synced.' : '';
      this.effects.changed();
    };
    source.onMessages = messages => {
      if (!this.current(owner) || session.phase() !== 'ready') return;
      if (!Array.isArray(messages) || messages.length > MESSAGE_EVENT_LIMITS.batch || !messages.every(validMessageCreated)
        || messages.some(item => 'preview' in item && !session.preview || 'senderId' in item && !this.senders)) return;
      const now = Date.now(); let changed = false;
      for (const message of messages) {
        const created = Date.parse(message.created), key = JSON.stringify([message.roomId, message.id]);
        if (this.effects.revoked(message.roomId) || created < this.since || now - created > MESSAGE_EVENT_LIMITS.ageMs
          || created - now > MESSAGE_EVENT_LIMITS.futureMs || this.seen.has(key)) continue;
        this.seen.add(key);
        while (this.seen.size > MESSAGE_EVENT_LIMITS.seen) this.seen.delete(this.seen.values().next().value!);
        this.events.set(key, { ...message, observedAt: now });
        while (this.events.size > MESSAGE_EVENT_LIMITS.retained) this.events.delete(this.events.keys().next().value!);
        this.received++; changed = true;
      }
      if (changed) this.effects.eventsChanged();
    };
    source.onChanges = changes => {
      if (!this.current(owner) || !Array.isArray(changes) || changes.length > MESSAGE_EVENT_LIMITS.batch || !changes.every(validReadChange)) return;
      if (session.phase() === 'connecting') {
        for (const change of changes) {
          if (change.kind === 'readers-changed') continue; // Opening loads a fresh snapshot after startup.
          const key = JSON.stringify([change.kind, change.roomId, change.kind === 'message-deleted' ? change.id : '']);
          if (!this.pending.has(key) && this.pending.size >= MESSAGE_EVENT_LIMITS.batch) { this.effects.overflow(); return; }
          this.pending.set(key, { ...change });
        }
      } else if (session.phase() === 'ready') this.effects.changes(changes);
    };
    const failure = (reason?: ReadStatusFailure) => {
      if (!this.current(owner)) return;
      this.owner = undefined; this.effects.invalidated(); source.close();
      this.joined = { state: session.joinedMeetings ? 'unavailable' : 'off', partial: true, items: [] };
      this.sourceReady = false; this.rateLimited = false;
      this.epoch++; this.revision = 0; this.degraded = false; this.state = 'failed'; this.fresh.clear();
      this.eventState = 'failed'; this.events.clear(); this.senders = false;
      this.diagnostic = `Webex read status unavailable${reason ? ` (${reason})` : ''}. Last-confirmed flags are retained locally as stale; never-observed spaces remain unknown. Check optional SDK dependencies/scopes before reconnecting.`;
      this.effects.eventsChanged();
    };
    source.onFailure = failure;
    const starting = this.senders ? source.start(session.credentials, true, true)
      : session.preview ? source.start(session.credentials, true) : source.start(session.credentials);
    return starting.then(() => {
      if (!this.current(owner)) return;
      this.sourceReady = true;
      if (session.joinedMeetings && !source.discoverJoinedMeetings)
        this.joined = { state: 'unavailable', partial: true, items: [] };
      this.refreshJoinedMeetings();
      this.state = this.degraded ? 'failed' : 'ready';
      this.effects.started(this.rooms());
    }, () => failure());
  }
  available(): boolean { return this.state === 'ready' && !!this.owner; }
  readable(): boolean { return !!this.owner && this.sourceReady && !this.rateLimited; }
  reaction(command: ReactionCommand): Promise<unknown> {
    if (!(command.action === 'summary' ? this.readable() : this.available()) || !this.owner!.source.reaction)
      throw command.action === 'summary' ? new ReactionReadError('worker:unavailable') : new Error('Existing messaging SDK owner unavailable');
    return this.owner!.source.reaction(command);
  }
  reactions(batch: ReactionBatch, progress?: ReactionProgress): Promise<unknown> {
    if (!this.readable() || !this.owner!.source.reactions) throw new ReactionReadError('worker:unavailable');
    return this.owner!.source.reactions(batch, progress);
  }
  readers(target: ReaderTarget): Promise<MessageReaders> {
    if (!this.readable() || !this.owner!.source.readers) throw new Error('Read receipts unavailable.');
    return this.owner!.source.readers(target);
  }
  markRead(roomId: string, messageId: string, check?: () => void): Promise<void> {
    if (!this.available()) throw new Error('Webex read status is unavailable.');
    return this.owner!.source.markRead(roomId, messageId, check);
  }
}
