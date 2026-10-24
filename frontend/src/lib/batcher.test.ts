import { expect, test } from "bun:test";
import { createBatcher } from "./batcher";

const missing = (key: number) => new Error(`missing ${key}`);

test("keys asked together share one call, repeats included", async () => {
  const calls: number[][] = [];
  const get = createBatcher<number, string>(
    async (keys) => {
      calls.push(keys);
      return new Map(keys.map((k) => [k, `v${k}`]));
    },
    { maxSize: 10, delayMs: 1, missing },
  );
  const out = await Promise.all([get(1), get(2), get(1)]);
  expect(out).toEqual(["v1", "v2", "v1"]);
  expect(calls).toEqual([[1, 2]]);
});

test("a call carries at most maxSize keys", async () => {
  const calls: number[][] = [];
  const get = createBatcher<number, number>(
    async (keys) => {
      calls.push(keys);
      return new Map(keys.map((k) => [k, k]));
    },
    { maxSize: 2, delayMs: 1, missing },
  );
  await Promise.all([1, 2, 3, 4, 5].map(get));
  expect(calls.map((c) => c.length)).toEqual([2, 2, 1]);
});

test("a key the call left out rejects, the others resolve", async () => {
  const get = createBatcher<number, number>(async () => new Map([[1, 1]]), {
    maxSize: 5,
    delayMs: 1,
    missing,
  });
  const [a, b] = await Promise.allSettled([get(1), get(2)]);
  expect(a.status).toBe("fulfilled");
  expect(b.status).toBe("rejected");
});

test("a failed call rejects every key it carried", async () => {
  const get = createBatcher<number, number>(
    async () => {
      throw new Error("down");
    },
    { maxSize: 5, delayMs: 1, missing },
  );
  const results = await Promise.allSettled([get(1), get(2)]);
  expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
});
