/** Collects the keys asked for within a short window and loads them with one
 * call, `maxSize` at most per call. Each asker gets its own key's value; a
 * failed call fails every key it carried, and a key the call left out
 * rejects with `missing`. Hand-rolled because the `dataloader` package has
 * no release since 2022 and none of its caching is wanted here: React Query
 * is the cache. */
export function createBatcher<K, V>(
  load: (keys: K[]) => Promise<Map<K, V>>,
  options: { maxSize: number; delayMs?: number; missing: (key: K) => Error },
) {
  type Waiter = { resolve: (v: V) => void; reject: (e: unknown) => void };
  let waiting = new Map<K, Waiter[]>();
  let scheduled = false;

  const runChunk = async (chunk: [K, Waiter[]][]) => {
    try {
      const found = await load(chunk.map(([key]) => key));
      for (const [key, waiters] of chunk) {
        if (found.has(key)) {
          for (const w of waiters) w.resolve(found.get(key) as V);
        } else {
          for (const w of waiters) w.reject(options.missing(key));
        }
      }
    } catch (err) {
      for (const [, waiters] of chunk) for (const w of waiters) w.reject(err);
    }
  };

  const flush = () => {
    const batch = [...waiting];
    waiting = new Map();
    scheduled = false;
    for (let i = 0; i < batch.length; i += options.maxSize) {
      void runChunk(batch.slice(i, i + options.maxSize));
    }
  };

  return (key: K): Promise<V> =>
    new Promise<V>((resolve, reject) => {
      const waiters = waiting.get(key) ?? [];
      waiters.push({ resolve, reject });
      waiting.set(key, waiters);
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, options.delayMs ?? 10);
      }
    });
}
