import { describe, expect, test } from "bun:test";
import { isStale, staleAfterMs } from "./staleness";

const now = Date.parse("2026-10-12T12:00:00Z");
const H = 3_600_000;
const ago = (hours: number) => new Date(now - hours * H).toISOString();

describe("staleAfterMs", () => {
  test("three hours, or three fetch intervals when longer", () => {
    expect(staleAfterMs(900)).toBe(3 * H);
    expect(staleAfterMs(7200)).toBe(6 * H);
  });
});

describe("isStale", () => {
  test("no reading is stale", () => {
    expect(isStale(null, now, 900)).toBe(true);
    expect(isStale(undefined, now, 900)).toBe(true);
    expect(isStale("not a date", now, 900)).toBe(true);
  });

  test("a reading older than the limit is stale", () => {
    expect(isStale(ago(3.5), now, 900)).toBe(true);
    expect(isStale(ago(2.9), now, 900)).toBe(false);
  });

  test("a slow gauge is stale after three of its intervals", () => {
    expect(isStale(ago(5), now, 7200)).toBe(false);
    expect(isStale(ago(7), now, 7200)).toBe(true);
  });
});
