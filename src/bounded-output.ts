/** Ordered transport admission. Only adjacent, explicitly equivalent lanes replace;
 * every other record is a barrier. Transport completion, not a timer, admits work. */
export class BoundedOutput<T> {
  private pending: { value: T; bytes: number; lane?: string }[] = [];
  private bytes = 0;
  private active?: symbol;
  private activeBytes = 0;
  private pumping = false;
  private closed = false;
  private draining?: Promise<void>;
  private resolveDrain?: () => void;
  constructor(private send: (value: T, completed: (error?: Error | null) => void) => void,
    private failed: () => void, private maxBytes: number, private maxRecords = 128) {}
  offer(value: T, bytes: number, lane?: string): void {
    if (this.closed) return;
    const tail = this.pending.at(-1), replace = lane !== undefined && tail?.lane === lane;
    const total = this.bytes + this.activeBytes + bytes - (replace ? tail!.bytes : 0);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || total > this.maxBytes
      || this.pending.length + (this.active ? 1 : 0) + (replace ? 0 : 1) > this.maxRecords) { this.fail(); return; }
    if (replace) this.bytes -= this.pending.pop()!.bytes;
    this.pending.push({ value, bytes, lane }); this.bytes += bytes;
    this.pump();
  }
  private pump(): void {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    try {
      while (!this.closed && !this.active && this.pending.length) {
        const next = this.pending.shift()!, token = this.active = Symbol();
        this.bytes -= next.bytes; this.activeBytes = next.bytes;
        const complete = (error?: Error | null) => {
          if (this.closed || this.active !== token) return;
          if (error) { this.fail(); return; }
          this.active = undefined; this.activeBytes = 0; this.pump(); this.settled();
        };
        try { this.send(next.value, complete); } catch { this.fail(); }
      }
    } finally { this.pumping = false; this.settled(); }
  }
  private settled(): void {
    if (!this.active && !this.pending.length) {
      this.resolveDrain?.(); this.resolveDrain = undefined; this.draining = undefined;
    }
  }
  flush(): Promise<void> {
    if (!this.active && !this.pending.length) return Promise.resolve();
    return this.draining ??= new Promise(resolve => { this.resolveDrain = resolve; });
  }
  close(): void {
    this.closed = true; this.pending = []; this.bytes = 0; this.active = undefined; this.activeBytes = 0; this.settled();
  }
  private fail(): void { if (!this.closed) { this.close(); this.failed(); } }
  diagnostics() { return { active: this.active ? 1 : 0, pending: this.pending.length, bytes: this.bytes + this.activeBytes, closed: this.closed }; }
}
