import { describe, expect, test } from "bun:test";
import {
  DAY_LABELS_MS,
  dayTicks,
  formatTick,
  lastReading,
  scrubOf,
  tickPeriodOf,
  visibleDescentSpans,
  yDomainOf,
} from "./seriesChartMath";
import type { ChartRow } from "./summary";

const row = (over: Partial<ChartRow>): ChartRow =>
  ({ time: 1, value: 5, bucket: 0, ...over }) as ChartRow;

describe("scrubOf", () => {
  test("a raw reading carries no extremes", () => {
    expect(scrubOf({ ...row({}), value: 5 })).toEqual({ time: 1, value: 5 });
  });
  test("a bucket carries extremes and length", () => {
    expect(
      scrubOf({ ...row({ bucket: 900, low: 3, high: 8 }), value: 5 }),
    ).toEqual({ time: 1, value: 5, low: 3, high: 8, bucket: 900 });
  });
});

describe("dayTicks", () => {
  const day = 24 * 3600 * 1000;
  test("one tick per midnight inside the window", () => {
    const from = new Date(2026, 0, 1, 12).getTime();
    const ticks = dayTicks([from, from + 3 * day]);
    expect(ticks).toHaveLength(3);
    expect(new Date(ticks[0]).getHours()).toBe(0);
  });
  test("steps so about four fit", () => {
    const from = new Date(2026, 0, 1).getTime();
    expect(dayTicks([from, from + 30 * day]).length).toBeLessThanOrEqual(5);
  });
});

describe("formatTick", () => {
  test("rounds, and abbreviates thousands", () => {
    expect(formatTick(12.6)).toBe("13");
    expect(formatTick(1500)).toBe("1.5k");
    expect(formatTick(-2400)).toBe("-2.4k");
  });
});

describe("yDomainOf", () => {
  test("null without anything", () => {
    expect(yDomainOf([], [])).toBeNull();
  });
  test("pads 20 percent and floors at zero", () => {
    expect(yDomainOf([10, 20], [])).toEqual({ lo: 8, hi: 22 });
    expect(yDomainOf([0, 10], [])).toEqual({ lo: 0, hi: 12 });
  });
  test("thresholds alone frame an empty chart", () => {
    expect(yDomainOf([], [5])).toEqual({ lo: 4.8, hi: 5.2 });
  });
  test("negative values may go below zero", () => {
    expect(yDomainOf([-10, -5], [])?.lo).toBeCloseTo(-11);
  });
});

describe("visibleDescentSpans", () => {
  test("none without spans", () => {
    expect(visibleDescentSpans(undefined, [0, 100])).toEqual([]);
  });
  test("drops spans outside and clamps those crossing the edge", () => {
    const out = visibleDescentSpans(
      [
        { id: 1, start: -50, end: -10 },
        { id: 2, start: -20, end: 50, name: "a" },
      ],
      [0, 1000],
    );
    expect(out).toEqual([{ id: 2, x1: 0, x2: 50, name: "a" }]);
  });
  test("a short run gets a minimum width", () => {
    const [s] = visibleDescentSpans(
      [{ id: 1, start: 500, end: 500 }],
      [0, 1000],
    );
    expect(s.x2 - s.x1).toBeCloseTo(5);
  });
});

describe("tickPeriodOf", () => {
  test("the preset without a custom range", () => {
    expect(tickPeriodOf("7d", null, 1)).toBe("7d");
    expect(tickPeriodOf(undefined, null, 1)).toBeNull();
  });
  test("a custom range borrows a preset only across days", () => {
    const custom = { from: "a", to: "b" };
    expect(tickPeriodOf("7d", custom, DAY_LABELS_MS - 1)).toBeNull();
    expect(tickPeriodOf("7d", custom, 5 * 24 * 3600 * 1000)).toBe("7d");
  });
});

describe("lastReading", () => {
  test("skips trailing gaps", () => {
    expect(
      lastReading([row({ time: 1, value: 4 }), row({ time: 2, value: null })]),
    ).toEqual({ time: 1, value: 4 });
  });
  test("null when every row is a gap", () => {
    expect(lastReading([])).toBeNull();
  });
});
