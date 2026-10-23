import { describe, expect, test } from "bun:test";
import { addDays, format, parseISO } from "date-fns";
import {
  dayAtScroll,
  openingDay,
  pulledOpen,
  sortByStanding,
  tripStanding,
  weekDays,
} from "./planWeek";

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

describe("sortByStanding", () => {
  const trip = (id: number, start_date: string, end_date: string | null) => ({
    id,
    start_date,
    end_date,
  });

  test("lists under way, then upcoming, then past, keeping the given order", () => {
    const sorted = sortByStanding(
      [
        trip(1, "2026-12-01", "2026-12-05"),
        trip(2, "2026-09-01", "2026-09-05"),
        trip(3, "2026-10-20", "2026-10-26"),
        trip(4, "2026-10-22", null),
      ],
      "2026-10-23",
    );
    expect(sorted.map((t) => t.id)).toEqual([3, 4, 1, 2]);
  });
});

describe("openingDay", () => {
  const dates = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      format(addDays(parseISO(from), i), "yyyy-MM-dd"),
    );

  test("opens on today for every weekday of a trip that started 4 days ago", () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = format(
        addDays(parseISO("2026-10-19"), offset),
        "yyyy-MM-dd",
      );
      const shown = dates(
        format(addDays(parseISO(today), -4), "yyyy-MM-dd"),
        8,
      );
      const open = openingDay(shown, today);
      expect(open).toBe(today);
      expect(weekDays(open)).toContain(today);
    }
  });

  test("opens on the first day before and after the trip", () => {
    const shown = ["2026-10-20", "2026-10-21"];
    expect(openingDay(shown, "2026-10-01")).toBe("2026-10-20");
    expect(openingDay(shown, "2026-11-01")).toBe("2026-10-20");
  });

  test("falls back to today without days", () => {
    expect(openingDay([], "2026-10-23")).toBe("2026-10-23");
  });
});
