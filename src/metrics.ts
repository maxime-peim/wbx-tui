import { monitorEventLoopDelay } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import type { Frame } from './protocol.js';

export function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]!;
}
export class Metrics {
  private start = performance.now();
  private cpu = process.cpuUsage();
  private lag = monitorEventLoopDelay({ resolution: 10 });
  private ages: number[] = [];
  private ackAges: number[] = [];
  private captureAges: number[] = [];
  private requestAges: number[] = [];
  private prepareAges: number[] = [];
  private writeAges: number[] = [];
  private ackWaits: number[] = [];
  private sources = new Map<string, { last: number; frames: number; uniqueFrames: number; skipped: number }>();
  frames = 0; uniqueFrames = 0; sourceFramesSkipped = 0; unavailable = 0; bytes = 0; terminalBytes = 0; acknowledgedFrames = 0; renderErrors = 0;
  constructor() { this.lag.enable(); }
  frame(frame: Frame, writtenAt = Date.now(), acknowledgedAt?: number, terminalBytes = 0,
    stages?: { requestStartedAt: number; receivedAt: number; writeStartedAt: number; source?: string }): void {
    this.frames++; this.bytes += frame.data.byteLength;
    const name = stages?.source ?? 'video';
    const source = this.sources.get(name) ?? { last: -1, frames: 0, uniqueFrames: 0, skipped: 0 };
    source.frames++;
    if (frame.sourceFrame !== source.last) { this.uniqueFrames++; source.uniqueFrames++; }
    if (source.last >= 0 && frame.sourceFrame > source.last) {
      const skipped = frame.sourceFrame - source.last - 1;
      this.sourceFramesSkipped += skipped; source.skipped += skipped;
    }
    source.last = frame.sourceFrame;
    if (this.sources.size < 32 || this.sources.has(name)) this.sources.set(name, source);
    this.terminalBytes += terminalBytes;
    const age = Math.max(0, writtenAt - frame.capturedAt);
    if (this.ages.length === 2048) this.ages.shift();
    this.ages.push(age);
    if (stages) {
      for (const list of [this.captureAges, this.requestAges, this.prepareAges, this.writeAges]) if (list.length === 2048) list.shift();
      this.captureAges.push(Math.max(0, stages.receivedAt - frame.capturedAt));
      this.requestAges.push(Math.max(0, stages.receivedAt - stages.requestStartedAt));
      this.prepareAges.push(Math.max(0, stages.writeStartedAt - stages.receivedAt));
      this.writeAges.push(Math.max(0, writtenAt - stages.writeStartedAt));
    }
    if (acknowledgedAt !== undefined) {
      this.acknowledgedFrames++;
      if (this.ackAges.length === 2048) this.ackAges.shift();
      this.ackAges.push(Math.max(0, acknowledgedAt - frame.capturedAt));
      if (this.ackWaits.length === 2048) this.ackWaits.shift();
      this.ackWaits.push(Math.max(0, acknowledgedAt - writtenAt));
    }
  }
  summary() {
    const seconds = Math.max(.001, (performance.now() - this.start) / 1000);
    const cpu = process.cpuUsage(this.cpu);
    return { seconds: +seconds.toFixed(1), frames: this.frames, uniqueFrames: this.uniqueFrames,
      averageUniqueFps: +(this.uniqueFrames / seconds).toFixed(1), sourceFramesSkipped: this.sourceFramesSkipped, unavailable: this.unavailable,
      perSource: Object.fromEntries([...this.sources].map(([name, source]) => [name, { frames: source.frames, uniqueFrames: source.uniqueFrames,
        averageUniqueFps: +(source.uniqueFrames / seconds).toFixed(1), sourceFramesSkipped: source.skipped }])),
      transferredMB: +(this.bytes / 1e6).toFixed(2), captureToTTYWriteP95Ms: this.frames ? +percentile(this.ages, .95).toFixed(1) : null,
      terminalOutputMB: +(this.terminalBytes / 1e6).toFixed(2),
      terminalAcknowledgedFrames: this.acknowledgedFrames,
      captureToTerminalAckP95Ms: this.ackAges.length ? +percentile(this.ackAges, .95).toFixed(1) : null,
      captureAndBridgeP95Ms: this.captureAges.length ? +percentile(this.captureAges, .95).toFixed(1) : null,
      captureRequestP95Ms: this.requestAges.length ? +percentile(this.requestAges, .95).toFixed(1) : null,
      framePreparationP95Ms: this.prepareAges.length ? +percentile(this.prepareAges, .95).toFixed(1) : null,
      terminalWriteP95Ms: this.writeAges.length ? +percentile(this.writeAges, .95).toFixed(1) : null,
      terminalAckWaitP95Ms: this.ackWaits.length ? +percentile(this.ackWaits, .95).toFixed(1) : null,
      renderErrors: this.renderErrors,
      nodeEventLoopP95Ms: +(this.lag.percentile(95) / 1e6).toFixed(1), nodeRssMB: +(process.memoryUsage().rss / 1e6).toFixed(1),
      nodeCpuSeconds: +((cpu.user + cpu.system) / 1e6).toFixed(2) };
  }
  stop(): void { this.lag.disable(); }
}
/** Linux-only resource snapshot, bounded to the owned browser process tree. */
export async function browserRssMB(pid?: number): Promise<number | null> {
  if (!pid || process.platform !== 'linux') return null;
  const queue = [pid];
  let sum = 0, seen = 0;
  while (queue.length && seen++ < 128) {
    const current = queue.shift()!;
    try {
      const status = await readFile(`/proc/${current}/status`, 'utf8');
      sum += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0);
      const children = await readFile(`/proc/${current}/task/${current}/children`, 'utf8');
      queue.push(...children.trim().split(/\s+/).filter(Boolean).map(Number));
    } catch { /* a child may exit during sampling */ }
  }
  return +(sum / 1024).toFixed(1);
}
