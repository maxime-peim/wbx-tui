import type { SendReason, SendState } from '../protocol.js';

/** Public media-helper wrapper, not a raw stream passed to the SDK. */
export interface LocalStream {
  outputStream: MediaStream;
  stop(): void | Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  off?(event: string, listener: (...args: any[]) => void): void;
}
export interface SendPort {
  acquire(): Promise<LocalStream>;
  publish(stream: LocalStream): Promise<void>;
  unpublish(stream: LocalStream): Promise<void>;
}
interface Active { stream: LocalStream; publishing: boolean; released: boolean; stopped: boolean; offs: (() => void)[] }
export class OutgoingMedia {
  private wanted = false;
  private closed = false;
  private active?: Active;
  private pending?: Promise<void>;
  constructor(private port: SendPort, private state: (state: SendState, reason?: SendReason) => void,
    private preview: (stream: MediaStream | null) => void = () => {}) {}
  setEnabled(enabled: boolean, reason?: SendReason): void {
    if (this.closed) return;
    this.wanted = enabled;
    if (!enabled) {
      if (this.active) this.release(this.active);
      this.state('off', reason); return;
    }
    if (this.active && !this.active.stopped) return;
    this.state('starting');
    if (!this.pending) {
      this.pending = this.start().finally(() => {
        this.pending = undefined;
        // A new explicit on intent may arrive while an older publish is being
        // canceled. It must use a fresh stream, never a stopped old wrapper.
        if (this.wanted && !this.active && !this.closed) this.setEnabled(true);
      });
    }
  }
  private async start(): Promise<void> {
    let current: Active | undefined;
    try {
      const stream = await this.port.acquire();
      current = { stream, publishing: false, released: false, stopped: false, offs: [] };
      if (!this.wanted || this.closed) { this.stop(current); return; }
      const tracks = stream.outputStream.getTracks().filter(track => track.readyState === 'live');
      if (!tracks.length) throw Object.assign(new Error('No live local media.'), { name: 'NotFoundError' });
      this.active = current;
      const ended = () => {
        if (this.active !== current) return;
        this.wanted = false; this.release(current!); this.state('off', 'ended');
      };
      const muted = (value: boolean) => {
        if (!value || this.active !== current) return;
        this.wanted = false; this.release(current!); this.state('off', 'host-muted');
      };
      for (const track of tracks) { track.addEventListener('ended', ended); current.offs.push(() => track.removeEventListener('ended', ended)); }
      stream.on?.('ended', ended); stream.on?.('muted:byServer', muted);
      current.offs.push(() => { stream.off?.('ended', ended); stream.off?.('muted:byServer', muted); });
      this.preview(stream.outputStream);
      current.publishing = true;
      try { await this.port.publish(stream); } finally { current.publishing = false; }
      if (!this.wanted || this.closed || this.active !== current || current.stopped) { this.release(current); return; }
      if (!stream.outputStream.getTracks().some(track => track.readyState === 'live' && track.enabled)) {
        this.wanted = false; this.release(current); this.state('off', 'ended'); return;
      }
      this.state('on');
    } catch (error) {
      if (current) this.release(current);
      if (this.closed || !this.wanted) return;
      this.wanted = false;
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      const reasons: Record<string, SendReason> = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'unavailable',
        NotReadableError: 'busy', NotSupportedError: 'unsupported', NotConnectedError: 'not-connected' };
      this.state('off', reasons[name] ?? 'failed');
    }
  }
  private stop(active: Active): void {
    if (active.stopped) return;
    active.stopped = true; active.offs.splice(0).forEach(off => off());
    // Privacy does not depend on a network unpublish succeeding or settling.
    for (const track of active.stream.outputStream.getTracks()) { track.enabled = false; track.stop(); }
    try { void Promise.resolve(active.stream.stop()).catch(() => {}); } catch { /* raw tracks are already stopped */ }
    if (this.active === active) { this.active = undefined; this.preview(null); }
  }
  private release(active: Active): void {
    this.stop(active);
    if (active.publishing || active.released) return; // late publish settlement cleans up again
    active.released = true;
    void this.port.unpublish(active.stream).catch(() => {
      if (!this.closed && !this.wanted) this.state('off', 'failed');
    });
  }
  close(): void {
    this.closed = true; this.wanted = false;
    if (this.active) this.release(this.active);
    this.state('off');
  }
}
