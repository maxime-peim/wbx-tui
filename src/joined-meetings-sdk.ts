/** SDK 3.13 getActiveMeetings read shape, without loading/registering the meetings plugin. */
import type { ReadStatusSDK } from './read-status-sdk.js';
import { JOINED_MEETINGS_LIMITS as LIMITS, parseJoinedMeetings, type JoinedMeetingsSnapshot } from './joined-meetings.js';
import { readStatusRetryAt } from './read-status-protocol.js';

class DiscoveryDeadline extends Error {}
export class SDKJoinedMeetings {
  private timer?: ReturnType<typeof setTimeout>;
  private active = false;
  private closed = false;
  private dirty = false;
  private nextAt = 0;
  private generation = 0;
  private reported?: JoinedMeetingsSnapshot['state'];
  constructor(private sdk: ReadStatusSDK, private changed: (snapshot: JoinedMeetingsSnapshot) => void, private admitted = () => true) {
    sdk.internal.mercury.on('event:locus', this.invalidate);
    sdk.internal.mercury.on('offline', this.invalidate);
  }
  private invalidate = (): void => {
    if (this.closed) return;
    const publish = !this.dirty;
    this.generation++; this.dirty = true;
    if (publish && this.admitted()) this.publish({ state: 'loading', partial: true, items: [] });
    this.refresh();
  };
  private publish(snapshot: JoinedMeetingsSnapshot): void {
    if (snapshot.state === this.reported && snapshot.state !== 'ready') return;
    this.reported = snapshot.state; this.changed(snapshot);
  }
  refresh(): void {
    if (this.closed || this.active) return;
    clearTimeout(this.timer);
    if (!this.admitted()) {
      this.publish({ state: 'unavailable', partial: true, items: [] });
      this.timer = setTimeout(() => this.refresh(), LIMITS.intervalMs); return;
    }
    const delay = this.nextAt - Date.now();
    if (delay > 0) { this.timer = setTimeout(() => this.refresh(), Math.min(delay, LIMITS.intervalMs)); return; }
    void this.read();
  }
  private async read(): Promise<void> {
    this.active = true; this.dirty = false;
    const generation = this.generation;
    this.nextAt = Date.now() + LIMITS.minimumMs;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const deviceUrl = this.sdk.internal.device.url;
      parseJoinedMeetings({ loci: [] }, deviceUrl); // Unknown local device identity cannot prove "elsewhere".
      const response = await Promise.race([
        this.sdk.internal.conversation.request({ method: 'GET', api: 'locus', resource: 'loci', timeout: LIMITS.timeoutMs,
          followRedirect: false, followAllRedirects: false, maxRedirects: 0, shouldRefreshAccessToken: false }),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new DiscoveryDeadline()), LIMITS.timeoutMs); }),
      ]);
      if (response.statusCode !== 200) throw response;
      const items = parseJoinedMeetings(response.body, deviceUrl);
      if (!this.closed && generation === this.generation)
        this.publish({ state: 'ready', partial: true, observedAt: Date.now(), items });
    } catch (error) {
      this.nextAt = Math.max(this.nextAt, readStatusRetryAt(error, Date.now()) ?? Date.now() + LIMITS.intervalMs);
      if (!this.closed) this.publish({ state: 'unavailable', partial: true, items: [] });
      // A timed-out native SDK request may still run: retire discovery, never overlap it or close messaging.
      if (error instanceof DiscoveryDeadline) { this.close(); return; }
    } finally {
      clearTimeout(deadline); this.active = false;
    }
    if (!this.closed) {
      const delay = this.dirty ? Math.max(1, this.nextAt - Date.now()) : Math.max(LIMITS.intervalMs, this.nextAt - Date.now());
      this.timer = setTimeout(() => this.refresh(), Math.min(LIMITS.intervalMs, delay));
    }
  }
  close(): void {
    this.closed = true; clearTimeout(this.timer);
    this.sdk.internal.mercury.off('event:locus', this.invalidate);
    this.sdk.internal.mercury.off('offline', this.invalidate);
  }
}
