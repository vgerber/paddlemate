import { describe, expect, test } from "bun:test";
import { readingState, staleAfterMs, trendText } from "./trend";

const now = Date.parse("2026-10-12T12:00:00Z");
const H = 3_600_000;
const at = (hoursAgo: number, value: number) => ({
  measured_at: new Date(now - hoursAgo * H).toISOString(),
  value,
});
const interval = 900;

describe("staleAfterMs", () => {
  test("three hours, or three fetch intervals when longer", () => {
    expect(staleAfterMs(900)).toBe(3 * H);
    expect(staleAfterMs(7200)).toBe(6 * H);
  });
});

describe("readingState", () => {
  test("no readings is stale", () => {
    expect(readingState([], now, interval)).toEqual({ stale: true });
  });

  test("a reading older than the limit is stale", () => {
    expect(readingState([at(3.5, 80), at(27, 60)], now, interval).stale).toBe(
      true,
    );
    expect(readingState([at(2.9, 80), at(27, 60)], now, interval).stale).toBe(
      false,
    );
  });

  test("a slow gauge is stale after three of its intervals", () => {
    expect(readingState([at(5, 80)], now, 7200).stale).toBe(false);
    expect(readingState([at(7, 80)], now, 7200).stale).toBe(true);
  });

  test("falling and rising against the reading 24 h earlier", () => {
    expect(readingState([at(0, 85), at(24, 109)], now, interval, 70)).toEqual({
      stale: false,
      trend: { direction: "falling", change: 24, hours: 24 },
    });
    const up = readingState([at(0, 85), at(24, 60)], now, interval, 70);
    expect(up).toEqual({
      stale: false,
      trend: { direction: "rising", change: 25, hours: 24 },
    });
  });

  test("uses the reading nearest the mark, within 3 h", () => {
    const s = readingState(
      [at(0, 80), at(22, 50), at(24.5, 100), at(27.5, 10)],
      now,
      interval,
      70,
    );
    expect(s).toEqual({
      stale: false,
      trend: { direction: "falling", change: 20, hours: 25 },
    });
  });

  test("no reading near 24 h earlier means no trend", () => {
    expect(readingState([at(0, 80), at(10, 70)], now, interval)).toEqual({
      stale: false,
      trend: null,
    });
    expect(readingState([at(0, 80), at(28, 70)], now, interval)).toEqual({
      stale: false,
      trend: null,
    });
  });

  test("a change under 3% of the high threshold is steady", () => {
    const s = readingState([at(0, 71), at(24, 69.5)], now, interval, 100);
    expect(s).toEqual({
      stale: false,
      trend: { direction: "steady", change: 1.5, hours: 24 },
    });
    const edge = readingState([at(0, 73), at(24, 70)], now, interval, 100);
    expect(edge).toMatchObject({ trend: { direction: "rising" } });
  });

  test("without a high threshold one unit counts", () => {
    expect(
      readingState([at(0, 10.5), at(24, 10)], now, interval),
    ).toMatchObject({ trend: { direction: "steady" } });
    expect(readingState([at(0, 11), at(24, 10)], now, interval)).toMatchObject({
      trend: { direction: "rising" },
    });
  });

  test("readings may come in any order", () => {
    const s = readingState([at(24, 109), at(0, 85)], now, interval, 70);
    expect(s).toMatchObject({ trend: { direction: "falling" } });
  });
});

describe("trendText", () => {
  test("names the change and the span", () => {
    expect(
      trendText({ direction: "falling", change: 24, hours: 24 }, "cm"),
    ).toBe("falling 24 cm in 24 h");
    expect(
      trendText({ direction: "rising", change: 2.34, hours: 24 }, "m3/s"),
    ).toBe("rising 2.3 m3/s in 24 h");
    expect(
      trendText({ direction: "steady", change: 0.2, hours: 24 }, "cm"),
    ).toBe("steady");
  });
});
