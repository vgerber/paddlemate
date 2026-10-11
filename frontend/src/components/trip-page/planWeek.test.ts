import { describe, expect, test } from "bun:test";
import { dayAtScroll, pulledOpen, tripStanding, weekDays } from "./planWeek";

describe("weekDays", () => {
  test("runs Monday to Sunday around the date", () => {
    const week = weekDays("2026-10-11");
    expect(week[0]).toBe("2026-10-05");
    expect(week[6]).toBe("2026-10-11");
    expect(week).toHaveLength(7);
  });

  test("crosses a month end", () => {
    expect(weekDays("2026-10-01")[0]).toBe("2026-09-28");
  });
});

describe("dayAtScroll", () => {
  const tops = [
    { date: "a", top: 0 },
    { date: "b", top: 100 },
    { date: "c", top: 200 },
  ];
  test("picks the last card at or above the edge", () => {
    expect(dayAtScroll(tops, 0)).toBe("a");
    expect(dayAtScroll(tops, 95)).toBe("b");
    expect(dayAtScroll(tops, 500)).toBe("c");
  });
  test("is null without cards", () => {
    expect(dayAtScroll([], 10)).toBeNull();
  });
});

describe("pulledOpen", () => {
  test("down opens, up closes, small keeps", () => {
    expect(pulledOpen(60, false)).toBe(true);
    expect(pulledOpen(-60, true)).toBe(false);
    expect(pulledOpen(5, true)).toBe(true);
    expect(pulledOpen(-5, false)).toBe(false);
  });
});

describe("tripStanding", () => {
  test("follows the dates", () => {
    expect(tripStanding("2026-10-08", "2026-10-14", "2026-10-07")).toBe(
      "upcoming",
    );
    expect(tripStanding("2026-10-08", "2026-10-14", "2026-10-11")).toBe(
      "under way",
    );
    expect(tripStanding("2026-10-08", "2026-10-14", "2026-10-15")).toBe("past");
    expect(tripStanding("2026-10-08", null, "2027-01-01")).toBe("under way");
  });
});
