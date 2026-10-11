import { expect, test } from "bun:test";
import { createLimiter } from "./limiter";

function gate() {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { done: promise, open: resolve };
}

test("never runs more than max tasks at once", async () => {
  const run = createLimiter(3);
  let active = 0;
  let peak = 0;
  const release = gate();
  const tasks = Array.from({ length: 10 }, () =>
    run(async () => {
      active++;
      peak = Math.max(peak, active);
      await release.done;
      active--;
    }),
  );
  await Promise.resolve();
  expect(active).toBe(3);
  release.open();
  await Promise.all(tasks);
  expect(peak).toBe(3);
});

test("returns results and keeps going after a failure", async () => {
  const run = createLimiter(1);
  const failed = run(async () => {
    throw new Error("boom");
  });
  const ok = run(async () => 7);
  await expect(failed).rejects.toThrow("boom");
  expect(await ok).toBe(7);
  // The slot was given back, so a later task starts straight away.
  expect(await run(async () => 8)).toBe(8);
});

test("a task aborted while waiting never runs", async () => {
  const run = createLimiter(1);
  const hold = gate();
  const first = run(() => hold.done);
  const controller = new AbortController();
  let ran = false;
  const second = run(async () => {
    ran = true;
  }, controller.signal);
  controller.abort(new Error("aborted"));
  await expect(second).rejects.toThrow("aborted");
  hold.open();
  await first;
  expect(ran).toBe(false);
});
