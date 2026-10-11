/** Runs async tasks with at most `max` in flight; the rest wait in order.
 * A task whose signal aborts while it waits is dropped without running. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  return async function run<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const at = waiting.indexOf(start);
          if (at >= 0) waiting.splice(at, 1);
          reject(signal?.reason);
        };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
        waiting.push(start);
      });
    }
    // A slot handed over by release() is already counted as active.
    else active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
