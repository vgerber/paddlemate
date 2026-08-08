import { describe, expect, test } from "bun:test";
import {
  durationLabel,
  formatDate,
  formatReading,
  formatTime,
  humanize,
  timeAgo,
} from "./format";

describe("formatDate", () => {
  // Noon UTC keeps the calendar day stable in every timezone the tests
  // might run in.
  test("formats day month year", () => {
    expect(formatDate("2026-01-05T12:00:00Z")).toBe("05 Jan 2026");
  });

  test("prepends the weekday when asked", () => {
    expect(formatDate("2026-01-05T12:00:00Z", { weekday: true })).toBe(
      "Mon, 05 Jan 2026",
    );
  });
});

describe("formatTime", () => {
  test("is 24h HH:MM", () => {
    expect(formatTime(new Date(2026, 0, 5, 9, 7).toISOString())).toBe("09:07");
  });
});

describe("durationLabel", () => {
  const at = (h: number, m = 0) =>
    new Date(Date.UTC(2026, 0, 1, h, m)).toISOString();

  test("hours and minutes", () => {
    expect(durationLabel(at(8), at(10, 15))).toBe("2h 15m");
  });

  test("whole hours drop the minutes part", () => {
    expect(durationLabel(at(8), at(11))).toBe("3h");
  });

  test("under an hour shows minutes only", () => {
    expect(durationLabel(at(8), at(8, 45))).toBe("45m");
  });

  test("zero, negative and sub-minute spans are null", () => {
    expect(durationLabel(at(8), at(8))).toBeNull();
    expect(durationLabel(at(9), at(8))).toBeNull();
    expect(
      durationLabel(
        at(8),
        new Date(Date.UTC(2026, 0, 1, 8, 0, 30)).toISOString(),
      ),
    ).toBeNull();
  });
});

describe("timeAgo", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  test("scales through the units", () => {
    expect(timeAgo(ago(5 * MIN))).toBe("5m ago");
    expect(timeAgo(ago(3 * HOUR))).toBe("3h ago");
    expect(timeAgo(ago(3 * DAY))).toBe("3d ago");
    expect(timeAgo(ago(21 * DAY))).toBe("3w ago");
    expect(timeAgo(ago(90 * DAY))).toBe("3mo ago");
    expect(timeAgo(ago(3 * 365 * DAY))).toBe("3y ago");
  });
});

describe("humanize", () => {
  test("replaces every underscore", () => {
    expect(humanize("put_in")).toBe("put in");
    expect(humanize("a_b_c")).toBe("a b c");
    expect(humanize("plain")).toBe("plain");
  });
});

describe("formatReading", () => {
  test("rounds to one decimal and trims trailing zeros", () => {
    expect(formatReading(85.44, "cm")).toBe("85.4 cm");
    expect(formatReading(85.0, "cm")).toBe("85 cm");
    expect(formatReading(85.06, "m3/s")).toBe("85.1 m3/s");
  });
});
