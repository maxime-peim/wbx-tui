/** Verified-account display hints and write admission, never live room/unread authority. */
import type { MessageRoom } from './messaging-api.js';
import { validRoomReadStatus, type RoomReadStatus } from './read-status-protocol.js';
import { cachedUnreadFlags, SPACES_CACHE_LIMITS, type SpacesCache, type CachedSpaces, type CachedUnread, type SpacesCacheStatus } from './spaces-cache.js';

export type DiskCacheStorage = Pick<SpacesCache, 'load' | 'save' | 'clear' | 'close'>;
export interface DiskCacheSession {
  key(): Promise<string>;
  current(): boolean;
  allowed(): boolean;
  /** Reuse the verified binding for preferences; no cache-owned preference I/O. */
  verified(key: string): void;
}
export interface DiskCacheOptions {
  create(): DiskCacheStorage;
  /** Detached, bounded, sanitized live metadata; never a mutable store or restored rows. */
  metadata(): MessageRoom[] | undefined;
  changed(): void;
}
interface CacheWrite {
  cache: DiskCacheStorage; key: string; session: DiskCacheSession; epoch: number; observedAt: number;
  rooms: MessageRoom[]; unread: CachedUnread[]; encoded: string;
}
export class DiskCacheError extends Error {
  constructor(readonly reason: 'unbound' | 'clear-failed') { super(reason); }
}
const UNREAD_CACHE_LIMIT = 1000;
export class DiskCacheLifecycle {
  private enabledValue = false;
  private readEnabled = false;
  private liveRoomsReady = false;
  private roomsRefreshFailed = false;
  private restored?: CachedSpaces;
  private flags = new Map<string, CachedUnread>();
  private unreadExpiry?: ReturnType<typeof setTimeout>;
  private status: SpacesCacheStatus = { state: 'off' };
  private cache?: DiskCacheStorage;
  private key?: string;
  private session?: DiskCacheSession;
  private expiry?: ReturnType<typeof setTimeout>;
  private writeTimer?: ReturnType<typeof setTimeout>;
  private writeAt = Number.NEGATIVE_INFINITY;
  private written = '';
  private observedAt?: number;
  private active?: CacheWrite;
  private pending?: CacheWrite;
  private epoch = 0;
  constructor(private readonly options: DiskCacheOptions) {}
  get enabled(): boolean { return this.enabledValue; }
  get browseOnly(): boolean { return this.enabledValue && !this.liveRoomsReady; }
  /** Internal verified binding for section preference fences; never an RPC field. */
  boundKey(): string | undefined { return this.key; }
  snapshot() {
    const entry = this.restored, age = entry ? Date.now() - entry.observedAt : -1;
    const cached = this.browseOnly && entry && age >= 0 && age < SPACES_CACHE_LIMITS.ageMs;
    const status: SpacesCacheStatus = this.status.state === 'stale' && !cached ? { state: 'miss', reason: 'expired' } : this.status;
    return { ...(cached ? { rooms: entry.rooms.map(room => ({ ...room })) } : {}),
      status: { ...status, ...(this.enabledValue ? { verified: this.liveRoomsReady } : {}) } };
  }
  unread(roomId: string): boolean | undefined {
    const flag = this.enabledValue && this.key ? this.flags.get(roomId) : undefined;
    const age = flag ? Date.now() - flag.observedAt : -1;
    return flag && age >= 0 && age < SPACES_CACHE_LIMITS.ageMs ? flag.unread : undefined;
  }
  forget(roomId: string): void { this.flags.delete(roomId); }
  reset(enabled = false, readEnabled = false): void {
    this.stop(); this.enabledValue = enabled; this.readEnabled = readEnabled;
    this.status = { state: enabled ? 'loading' : 'off' };
  }
  stop(): void {
    clearTimeout(this.expiry); clearTimeout(this.unreadExpiry); this.expiry = undefined; this.unreadExpiry = undefined;
    const cache = this.cache; this.cache = undefined; this.key = undefined; this.session = undefined;
    this.invalidateWrites(); cache?.close(); this.restored = undefined; this.flags.clear();
    this.status = { state: 'off' }; this.enabledValue = false; this.readEnabled = false;
    this.liveRoomsReady = false; this.roomsRefreshFailed = false;
  }
  private current(session: DiskCacheSession): boolean { return this.session === session && session.current(); }
  async bind(session: DiskCacheSession): Promise<void> {
    if (!this.enabledValue || !session.current()) return;
    this.session = session;
    if (!session.allowed()) { this.status = { state: 'unavailable', reason: 'scope-required' }; this.options.changed(); return; }
    let identity = false;
    try {
      const key = await session.key();
      if (!this.current(session) || !this.enabledValue || !session.allowed()) return;
      identity = true;
      const cache = this.cache = this.options.create();
      const entry = await cache.load(key);
      if (!this.current(session) || cache !== this.cache || !session.allowed()) return;
      this.key = key; session.verified(key);
      if (this.readEnabled) {
        for (const flag of entry?.unread ?? []) if (!this.flags.has(flag.id) && this.flags.size < UNREAD_CACHE_LIMIT) this.flags.set(flag.id, { ...flag });
        this.scheduleUnreadExpiry();
      }
      if (entry && !this.liveRoomsReady) {
        this.restored = entry;
        this.status = { state: 'stale', observedAt: entry.observedAt, ...(this.roomsRefreshFailed ? { reason: 'refresh-failed' as const } : {}) };
        this.expiry = setTimeout(() => {
          if (!this.current(session)) return;
          this.restored = undefined; this.status = { state: 'miss', reason: 'expired' }; this.options.changed();
        }, Math.max(1, SPACES_CACHE_LIMITS.ageMs - (Date.now() - entry.observedAt)));
        this.expiry.unref?.();
      } else this.status = { state: this.liveRoomsReady ? 'ready' : 'miss' };
      this.persist(); this.options.changed();
    } catch {
      if (!this.current(session) || !this.enabledValue || !session.allowed()) return;
      this.status = { state: 'unavailable', reason: identity ? 'cache-unavailable' : 'identity-unavailable' }; this.options.changed();
    }
  }
  scopeLost(): void {
    if (!this.enabledValue) return;
    const cache = this.cache; this.cache = undefined; this.key = undefined;
    this.invalidateWrites(); cache?.close();
    clearTimeout(this.expiry); clearTimeout(this.unreadExpiry); this.restored = undefined; this.flags.clear();
    this.status = { state: 'unavailable', reason: 'scope-required' };
  }
  /** A genuine SDK observation may renew disk flags, never their live freshness. */
  observe(rooms: RoomReadStatus[], observedAt: number): void {
    if (!this.enabledValue || this.status.reason === 'cleared') return;
    if (rooms.length) this.observedAt = observedAt;
    if (!this.readEnabled) return;
    for (const room of rooms) if (validRoomReadStatus(room)) {
      this.flags.delete(room.id); this.flags.set(room.id, { id: room.id, unread: room.lastActivity > room.lastSeen, observedAt });
    }
    while (this.flags.size > UNREAD_CACHE_LIMIT) this.flags.delete(this.flags.keys().next().value!);
    if (this.key) this.scheduleUnreadExpiry();
  }
  private scheduleUnreadExpiry(): void {
    clearTimeout(this.unreadExpiry); this.unreadExpiry = undefined;
    const now = Date.now(); let remaining = Infinity;
    for (const [id, flag] of this.flags) {
      const age = now - flag.observedAt;
      if (age < 0 || age >= SPACES_CACHE_LIMITS.ageMs) this.flags.delete(id);
      else remaining = Math.min(remaining, SPACES_CACHE_LIMITS.ageMs - age);
    }
    if (!Number.isFinite(remaining)) return;
    const session = this.session;
    this.unreadExpiry = setTimeout(() => {
      if (!session || !this.current(session) || !this.key) return;
      this.scheduleUnreadExpiry(); this.options.changed();
    }, Math.max(1, remaining));
    this.unreadExpiry.unref?.();
  }
  roomsLoaded(success: boolean): void {
    if (!this.enabledValue) return;
    this.roomsRefreshFailed = !success;
    if (success) {
      if (this.status.reason !== 'cleared') this.observedAt = Date.now();
      this.liveRoomsReady = true; this.restored = undefined; clearTimeout(this.expiry);
      if (this.key) this.status = { state: 'ready' };
      this.persist();
    } else if (this.restored) this.status = { state: 'stale', observedAt: this.restored.observedAt, reason: 'refresh-failed' };
    this.options.changed();
  }
  persist(): void {
    if (!this.enabledValue || !this.liveRoomsReady || !this.cache || !this.key || !this.session || this.observedAt === undefined) return;
    const rooms = this.options.metadata(), observedAt = this.observedAt;
    if (!rooms) return;
    const unread = this.readEnabled ? cachedUnreadFlags([...this.flags.values()], rooms, observedAt) : [];
    const encoded = JSON.stringify([rooms, unread, observedAt]);
    if (encoded === this.active?.encoded || !this.active && encoded === this.written) { this.pending = undefined; return; }
    this.pending = { cache: this.cache, key: this.key, session: this.session, epoch: this.epoch, rooms, unread, observedAt, encoded };
    this.flush();
  }
  private owned(work: CacheWrite): boolean {
    return work.cache === this.cache && work.key === this.key && this.current(work.session)
      && work.epoch === this.epoch && this.enabledValue && this.liveRoomsReady;
  }
  private flush(): void {
    if (this.active || this.writeTimer || !this.pending) return;
    const work = this.pending;
    if (!this.owned(work)) { this.pending = undefined; return; }
    const wait = Math.max(0, this.writeAt + 5000 - performance.now());
    if (wait) {
      this.writeTimer = setTimeout(() => { this.writeTimer = undefined; this.flush(); }, wait);
      this.writeTimer.unref?.(); return;
    }
    this.pending = undefined; this.active = work; this.writeAt = performance.now();
    let pending: Promise<void>;
    try { pending = work.cache.save(work.key, work.rooms, work.unread, work.observedAt); }
    catch { this.finished(work, false); return; }
    void pending.then(() => this.finished(work, true), () => this.finished(work, false));
  }
  private finished(work: CacheWrite, saved: boolean): void {
    if (this.active !== work) return;
    this.active = undefined;
    if (!this.owned(work)) return;
    this.written = saved ? work.encoded : '';
    this.status = saved ? { state: 'ready', observedAt: work.observedAt } : { state: 'unavailable', reason: 'cache-unavailable' };
    this.options.changed(); this.flush();
  }
  private invalidateWrites(): void {
    clearTimeout(this.writeTimer); this.writeTimer = undefined;
    this.epoch++; this.active = undefined; this.pending = undefined;
    this.written = ''; this.observedAt = undefined; this.writeAt = Number.NEGATIVE_INFINITY;
  }
  async clear(): Promise<void> {
    const cache = this.cache, key = this.key, session = this.session;
    if (!cache || !key || !session) throw new DiskCacheError('unbound');
    clearTimeout(this.expiry); clearTimeout(this.unreadExpiry); this.invalidateWrites();
    const epoch = this.epoch;
    this.cache = undefined; this.key = undefined; this.restored = undefined; this.flags.clear();
    this.status = { state: 'off', reason: 'cleared' }; this.options.changed();
    try { await cache.clear(key); }
    catch {
      if (this.current(session) && epoch === this.epoch) { this.status = { state: 'unavailable', reason: 'cache-unavailable' }; this.options.changed(); }
      throw new DiskCacheError('clear-failed');
    }
  }
}
