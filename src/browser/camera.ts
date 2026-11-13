import type { CameraReason, CameraState } from '../protocol.js';

/** Owns local preview capture only. It has no reference to the meeting/SDK. */
export class CameraPreview {
  private wanted = false;
  private closed = false;
  private active?: MediaStream;
  private pending?: Promise<void>;
  private offs: (() => void)[] = [];
  constructor(
    private getMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
    private stream: (value: MediaStream | null) => void,
    private state: (state: CameraState, reason?: CameraReason) => void,
  ) {}

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.closed) return;
    this.wanted = enabled;
    if (!enabled) { this.stopTracks(); this.state('off'); return; }
    if (this.active) return;
    this.state('starting');
    // getUserMedia/permission prompts cannot be canceled natively. Retain the
    // admission until settlement, including when off/on is pressed repeatedly.
    if (this.pending) return this.pending;
    this.pending = this.capture();
    try { await this.pending; } finally { this.pending = undefined; }
  }
  private async capture(): Promise<void> {
    let value: MediaStream | undefined;
    try {
      value = await this.getMedia({ audio: false, video: {
        width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 24 },
      } });
      if (!this.wanted || this.closed) { value.getTracks().forEach(track => track.stop()); return; }
      const tracks = value.getVideoTracks().filter(track => track.readyState === 'live');
      if (!tracks.length) throw Object.assign(new Error('No live camera track.'), { name: 'NotFoundError' });
      this.active = value;
      for (const track of tracks) {
        const ended = () => {
          if (this.active !== value) return;
          this.wanted = false; this.stopTracks(); this.state('off', 'ended');
        };
        track.addEventListener('ended', ended, { once: true });
        this.offs.push(() => track.removeEventListener('ended', ended));
      }
      this.stream(value); this.state('on');
    } catch (error) {
      value?.getTracks().forEach(track => track.stop());
      if (this.closed || !this.wanted) return;
      this.wanted = false; this.stopTracks();
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      const reasons: Record<string, CameraReason> = { NotAllowedError: 'denied', SecurityError: 'denied',
        NotFoundError: 'unavailable', NotReadableError: 'busy', NotSupportedError: 'unsupported' };
      this.state('off', reasons[name] ?? 'failed'); // never expose device labels or native error text
    }
  }
  private stopTracks(): void {
    this.offs.splice(0).forEach(off => off());
    const value = this.active; this.active = undefined;
    this.stream(null);
    value?.getTracks().forEach(track => track.stop());
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.wanted = false;
    this.stopTracks(); this.state('off');
  }
}
