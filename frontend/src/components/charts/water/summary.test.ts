import { describe, expect, test } from "bun:test";
import {
  dayOf,
  defaultDays,
  dragRange,
  periodForSpan,
  pointsForWidth,
  rangeError,
  rangeOfDays,
  readingsStart,
  summaryStaleTime,
  toChartRows,
} from "./summary";

const item = (iso: string, value: number, min = value, max = value) => ({
  measured_at: iso,
  value,
  min,
  max,
  count: 1,
});

describe("pointsForWidth", () => {
  test("is about one point per 2.5px, rounded up to a step of 50", () => {
    expect(pointsForWidth(320)).toBe(150);
    expect(pointsForWidth(1000)).toBe(400);
  });

  test("stays within 10..1000", () => {
    expect(pointsForWidth(0)).toBe(10);
    expect(pointsForWidth(10)).toBe(50);
    expect(pointsForWidth(9000)).toBe(1000);
  });
});

describe("toChartRows", () => {
  test("bucketed rows carry a band, raw rows none", () => {
    const items = [item("2026-01-01T00:00:00Z", 5, 4, 7)];
    expect(toChartRows(items, 3600)[0].band).toEqual([4, 7]);
    expect(toChartRows(items, 0)[0].band).toBeNull();
  });

  test("a missing bucket breaks the line", () => {
    const items = [
      item("2026-01-01T00:00:00Z", 1),
      item("2026-01-01T01:00:00Z", 2),
      item("2026-01-01T03:00:00Z", 3),
    ];
    const rows = toChartRows(items, 3600);
    expect(rows.map((r) => r.value)).toEqual([1, 2, null, 3]);
  });

  test("raw readings tolerate jitter but not a long silence", () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    const at = (min: number) => new Date(base + min * 60000).toISOString();
    const items = [0, 15, 31, 45, 60, 75, 90, 300].map((m) => item(at(m), m));
    const rows = toChartRows(items, 0);
    expect(rows.filter((r) => r.value === null)).toHaveLength(1);
  });

  test("an empty answer is no rows", () => {
    expect(toChartRows([], 0)).toEqual([]);
  });
});

describe("readingsStart", () => {
  const from = Date.parse("2026-01-01T00:00:00Z");
  const to = from + 100 * 24 * 3600 * 1000;

  test("names the first reading when it is well after From", () => {
    const first = from + 30 * 24 * 3600 * 1000;
    expect(readingsStart(first, from, to, 86400)).toBe(first);
  });

  test("is null when the data reaches back to From", () => {
    expect(readingsStart(from + 3600 * 1000, from, to, 86400)).toBeNull();
    expect(readingsStart(undefined, from, to, 0)).toBeNull();
  });
});

describe("rangeError", () => {
  const today = "2026-10-24";

  test("accepts a valid pair", () => {
    expect(rangeError("2026-03-12", "2026-04-04", today)).toBeNull();
    expect(rangeError("2026-09-24", today, today)).toBeNull();
  });

  test("rejects To after today", () => {
    expect(rangeError("2026-03-12", "2026-10-25", today)).toMatch(/today/);
  });

  test("rejects From not before To", () => {
    expect(rangeError("2026-04-04", "2026-04-04", today)).toMatch(/before/);
    expect(rangeError("2026-05-04", "2026-04-04", today)).toMatch(/before/);
  });

  test("rejects a missing date and a span over 5 years", () => {
    expect(rangeError("", "2026-04-04", today)).toMatch(/both/);
    expect(rangeError("2020-01-01", "2026-04-04", today)).toMatch(/5 years/);
  });

  test("accepts exactly 5 calendar years across leap days", () => {
    expect(rangeError("2020-02-28", "2025-02-28", today)).toBeNull();
    expect(rangeError("2021-10-24", today, today)).toBeNull();
    expect(rangeError("2021-10-23", today, today)).toMatch(/5 years/);
  });
});

describe("custom ranges", () => {
  test("defaults to the last 30 days ending today", () => {
    const now = new Date(2026, 9, 24, 15, 0);
    expect(defaultDays(now)).toEqual({ from: "2026-09-24", to: "2026-10-24" });
  });

  test("runs from the start of From to the end of To, never past now", () => {
    const now = new Date(2026, 9, 24, 15, 0);
    const past = rangeOfDays("2026-03-12", "2026-04-04", now);
    expect(new Date(past.to).getHours()).toBe(23);
    expect(dayOf(past.from)).toBe("2026-03-12");
    const today = rangeOfDays("2026-09-24", "2026-10-24", now);
    expect(today.to).toBe(now.toISOString());
  });
});

describe("periodForSpan", () => {
  test("picks the axis by span", () => {
    const day = 24 * 3600 * 1000;
    expect(periodForSpan(day)).toBe("24h");
    expect(periodForSpan(7 * day)).toBe("7d");
    expect(periodForSpan(30 * day)).toBe("1m");
    expect(periodForSpan(90 * day)).toBe("3m");
    expect(periodForSpan(200 * day)).toBe("6m");
    expect(periodForSpan(700 * day)).toBe("1y");
  });
});

describe("dragRange", () => {
  test("orders the ends", () => {
    const r = dragRange(2000000, 1000000, 1000);
    expect(r && new Date(r.from).getTime()).toBe(1000000);
    expect(r && new Date(r.to).getTime()).toBe(2000000);
  });

  test("ignores a drag shorter than the minimum", () => {
    expect(dragRange(1000, 1500, 1000)).toBeNull();
  });
});

describe("summaryStaleTime", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");

  test("a range that ended before today is cached long", () => {
    expect(summaryStaleTime("2026-03-01T00:00:00Z", now)).toBeGreaterThan(
      3600 * 1000,
    );
  });

  test("a range running to now refreshes within minutes", () => {
    expect(summaryStaleTime(undefined, now)).toBe(5 * 60 * 1000);
  });
});
