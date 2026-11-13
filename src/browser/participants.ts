import type { Source } from '../protocol.js';

type Listener = (...args: any[]) => void;
export interface RemoteVideo {
  stream: MediaStream; sourceState: string; memberId?: string; csi?: number;
  on(event: string, listener: Listener): void; off?(event: string, listener: Listener): void;
  setSizeHint?(width: number, height: number): void;
}
export interface Member {
  id: string; name?: string; isInMeeting?: boolean; isSelf?: boolean; isPairedWithSelf?: boolean;
  isAudioMuted?: boolean; isVideoMuted?: boolean; isHost?: boolean;
}
export interface Members {
  on(event: string, listener: Listener): void; off?(event: string, listener: Listener): void;
  membersCollection?: { getAll(): Record<string, Member> };
  getCsisForMember(id: string, type: string, content: string): number[];
}
export interface RemoteManager {
  getLayoutId(): string | undefined;
  setLayout(id: string): Promise<void>;
  setRemoteVideoCsis(requests: { remoteMedia: RemoteVideo; csi?: number | null }[]): void;
}
export interface ParticipantMedia { source: Source; member: string; label: string; stream: MediaStream | null }
interface Binding { member: Member; source: Source; pane: string; csi?: number }

/** Receiver-selected streams: never label a slot as a person until CSI matches. */
export class ParticipantViews {
  enabled = false;
  private closed = false;
  private started = false;
  private running = false;
  private dirty = false;
  private failed = false;
  private roster: Member[] = [];
  private primary?: string;
  private bindings: Binding[] = [];
  private panes: Record<string, RemoteVideo> = {};
  private offs: (() => void)[] = [];
  private requested = new WeakMap<RemoteVideo, number | null>();
  private hints = new WeakMap<RemoteVideo, string>();
  constructor(private members: Members, private manager: () => RemoteManager | undefined,
    private publish: (media: ParticipantMedia[]) => void,
    private wait: <T>(promise: Promise<T>) => Promise<T>, private fallback: () => void) {}
  update(full: Record<string, Member> | Member[]): void {
    if (this.closed || this.failed) return;
    const seen = new Set<string>();
    this.roster = Object.values(full ?? {}).filter(member => {
      if (!member || typeof member.id !== 'string' || !member.id.length || member.id.length > 512 || seen.has(member.id)
        || !member.isInMeeting || member.isSelf || member.isPairedWithSelf) return false;
      seen.add(member.id); return true;
    }).slice(0, 12).map(member => ({ ...member }));
    if (this.started) {
      try { this.bind(); } catch { void this.fail(); return; }
    }
    this.dirty = true; void this.reconcile();
  }
  start(): void {
    this.started = true;
    this.update(this.members.membersCollection?.getAll() ?? this.roster);
  }
  layout(panes: Record<string, RemoteVideo>): void {
    if (this.closed) return;
    this.offs.splice(0).forEach(off => off()); this.panes = panes;
    this.requested = new WeakMap();
    for (const remote of Object.values(panes)) for (const event of ['sourceUpdate', 'stopped']) {
      const listener = () => this.emit(); remote.on(event, listener); this.offs.push(() => remote.off?.(event, listener));
    }
    this.emit(); this.dirty = true; void this.reconcile();
  }
  private bind(): void {
    const roster = this.roster;
    this.enabled = roster.length > 0;
    if (!roster.some(member => member.id === this.primary)) this.primary = roster[0]?.id;
    const previous = new Map(this.bindings.map(binding => [binding.member.id, binding.source]));
    // Reserve retained members' slots before assigning newcomers; roster order
    // must not let a newcomer steal an existing person's source ID.
    const used = new Set<Source>(['video']);
    for (const member of roster) {
      const old = previous.get(member.id);
      if (member.id !== this.primary && old && old !== 'video') used.add(old);
    }
    this.bindings = roster.map(member => {
      let source: Source = 'video';
      if (member.id !== this.primary) {
        const old = previous.get(member.id);
        source = old && old !== 'video' ? old : Array.from({ length: 11 }, (_, i) => `remote-${i + 2}` as Source).find(source => !used.has(source))!;
      }
      used.add(source);
      const csi = this.members.getCsisForMember(member.id, 'video', 'main')?.find(csi => Number.isInteger(csi) && csi > 0);
      return { member, source, csi, pane: source === 'video' ? 'person-1' : `person-${source.slice(7)}` };
    });
    // Invalidate removed/muted identities synchronously, even while setLayout
    // is awaiting an SDK promise. Never keep displaying the old binding.
    if (this.enabled) this.emit(); else this.publish([]);
  }
  private async reconcile(): Promise<void> {
    if (this.running || this.closed || this.failed || !this.started) return;
    const manager = this.manager(); if (!manager) return;
    this.running = true;
    try {
      while (this.dirty && !this.closed) {
        this.dirty = false;
        const layout = this.enabled ? 'People' : 'Single';
        if (manager.getLayoutId() !== layout) await this.wait(manager.setLayout(layout));
        if (this.closed) return;
        if (this.dirty || !this.enabled) continue;
        const requests: { remoteMedia: RemoteVideo; csi?: number | null }[] = [];
        for (const [id, remote] of Object.entries(this.panes)) {
          const csi = this.bindings.find(binding => binding.pane === id)?.csi ?? null;
          if (!this.requested.has(remote) || this.requested.get(remote) !== csi) {
            this.requested.set(remote, csi); requests.push({ remoteMedia: remote, csi });
          }
        }
        if (requests.length) manager.setRemoteVideoCsis(requests);
        this.emit();
      }
    } catch { await this.fail(); }
    finally { this.running = false; }
  }
  private async fail(): Promise<void> {
    if (this.closed || this.failed) return;
    this.failed = true; this.enabled = false; this.bindings = []; this.publish([]); this.fallback();
    const manager = this.manager();
    try { if (manager) await this.wait(manager.setLayout('Single')); } catch { /* retain normal session failure handling */ }
  }
  private emit(): void {
    if (!this.enabled || this.closed) return;
    this.publish(this.bindings.map(binding => {
      const remote = this.panes[binding.pane], member = binding.member;
      const matches = remote?.sourceState === 'live' && binding.csi !== undefined && remote.csi === binding.csi
        && (remote.memberId === undefined || remote.memberId === member.id) && !member.isVideoMuted;
      const name = typeof member.name === 'string' ? member.name : 'Participant';
      const label = `${name}${member.isHost ? ' · host' : ''}${member.isAudioMuted ? ' · mic muted' : ''}${member.isVideoMuted ? ' · camera off' : ''}`
        .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 80);
      return { source: binding.source, member: member.id, label, stream: matches ? remote.stream : null };
    }));
  }
  sizeHint(source: Source, width: number, height: number): void {
    const binding = this.bindings.find(binding => binding.source === source);
    const remote = binding && this.panes[binding.pane], key = `${width}x${height}`;
    if (remote && this.hints.get(remote) !== key) {
      try { remote.setSizeHint?.(width, height); this.hints.set(remote, key); } catch { /* advisory hint, not a call failure */ }
    }
  }
  close(): void { this.closed = true; this.offs.splice(0).forEach(off => off()); this.publish([]); }
}
