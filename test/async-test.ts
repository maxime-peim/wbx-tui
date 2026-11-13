import { performance } from 'node:perf_hooks';
import { setImmediate as turn } from 'node:timers/promises';

/** Monotonic even when tests freeze Date or advance logical scheduler clocks. */
export async function until(condition: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const end = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() >= end) throw new Error(`Timed out waiting for synthetic ${label} (${timeoutMs} ms)`);
    await turn();
  }
}
/** Observe rejection immediately; callers still await the original outcome. */
export function handled<T>(pending: Promise<T>): Promise<T> {
  void pending.catch(() => {});
  return pending;
}
