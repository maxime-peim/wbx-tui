/** Bound foreign async work, including synchronous throws and late rejection.
 * A deadline is not cancellation: callers must invalidate stale continuations.
 */
export function deadline<T>(work: () => T | PromiseLike<T>, ms: number, message = 'Operation timed out.', signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown, value?: T) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error !== undefined) reject(error); else resolve(value as T);
    };
    const cancel = () => finish(new Error('Operation canceled.'));
    const timer = setTimeout(() => finish(new Error(message)), ms);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    try { Promise.resolve(work()).then(value => finish(undefined, value), error => finish(error ?? new Error('Operation failed.'))); }
    catch (error) { finish(error ?? new Error('Operation failed.')); }
  });
}

/** Start every cleanup independently; a broken branch cannot skip another. */
export async function cleanupAll(work: Array<() => unknown | PromiseLike<unknown>>, ms: number): Promise<void> {
  await Promise.all(work.map(cleanup => deadline(cleanup, ms).catch(() => {})));
}
