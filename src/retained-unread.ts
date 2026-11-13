/** Historical SDK observations and actual message activity, not freshness or disk authority. */
import type { RoomReadStatus } from './read-status-protocol.js';

interface ConfirmedUnread { status?: RoomReadStatus; observedActivity?: string }
/** Eviction preference only, never a grant to read or send. */
export interface UnreadRetention { selected?: string; freshRooms: readonly string[] }
export class RetainedUnread {
  private values = new Map<string, ConfirmedUnread>();
  /** Configuration fingerprint, NOT verified account identity. */
  private profile?: string;
  private static readonly limit = 1000;

  get size(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  reset(): void { this.clear(); this.profile = undefined; }
  useProfile(profile: string): void {
    if (this.profile !== undefined && this.profile !== profile) this.clear();
    this.profile = profile;
  }
  forget(roomId: string): void { this.values.delete(roomId); }
  observeStatuses(rooms: readonly RoomReadStatus[], retention: UnreadRetention): void {
    const fresh = new Set(retention.freshRooms);
    for (const room of rooms) this.remember(room.id, { ...this.values.get(room.id), status: { ...room } }, retention.selected, fresh);
  }
  observeActivity(roomId: string, created: readonly string[], latestEndpoint: string | undefined, retention: UnreadRetention): void {
    // The newest endpoint can be withheld by the display cap; loaded rows alone
    // cannot disprove a previously observed, newer actual message.
    const observedActivity = created.reduce((latest, value) => value > latest ? value : latest, latestEndpoint ?? '');
    const previous = this.values.get(roomId);
    if (observedActivity > (previous?.observedActivity ?? ''))
      this.remember(roomId, { ...previous, observedActivity }, retention.selected, new Set(retention.freshRooms));
  }
  private remember(id: string, value: ConfirmedUnread, selected: string | undefined, fresh: ReadonlySet<string>): void {
    this.values.delete(id); this.values.set(id, value);
    while (this.values.size > RetainedUnread.limit) {
      const evict = [...this.values.keys()].find(key => key !== selected && !fresh.has(key))
        ?? this.values.keys().next().value!;
      this.values.delete(evict);
    }
  }
  /** Pure projection: does not reconcile messages, touch insertion order or claim freshness. */
  peek(roomId: string) {
    const value = this.values.get(roomId), status = value?.status;
    if (!status) return;
    return { unread: status.lastActivity > status.lastSeen, unreadActivity: status.lastActivity,
      contradicted: (value.observedActivity ?? '') > status.lastActivity };
  }
}
