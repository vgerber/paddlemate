import { describe, expect, test } from "bun:test";
import type { Descent, TripMember, TripStay } from "@/lib/api";
import {
  buildTimeline,
  dayNumber,
  monthGrid,
  paddledByRiver,
} from "./tripTimeline";

const START = "2026-06-01";

function member(name: string, arrival?: string, departure?: string) {
  return {
    trip_id: 1,
    user_id: name,
    username: name,
    role: "member",
    arrival,
    departure,
    created_at: "2026-05-01T00:00:00Z",
  } as TripMember;
}

function stay(name: string, arrival?: string) {
  return {
    id: 1,
    trip_id: 1,
    kind: "camp",
    name,
    arrival,
    sections: [],
    created_by: "x",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  } as unknown as TripStay;
}

function descent(startTime: string) {
  return {
    id: 1,
    user_id: "x",
    start_time: startTime,
    end_time: startTime,
    visibility: { type: "private" },
    sections: [],
    created_at: startTime,
    updated_at: startTime,
  } as unknown as Descent;
}

describe("dayNumber", () => {
  test("the start date is day 1", () => {
    expect(dayNumber("2026-06-01", START)).toBe(1);
  });

  test("counts forward from the start", () => {
    expect(dayNumber("2026-06-08", START)).toBe(8);
  });

  test("the day before the start is -1, and there is no day 0", () => {
    expect(dayNumber("2026-05-31", START)).toBe(-1);
    expect(dayNumber("2026-05-30", START)).toBe(-2);
  });

  test("reads the day out of a timestamp", () => {
    expect(dayNumber("2026-06-02T08:00:00Z", START)).toBe(2);
  });
});

describe("buildTimeline", () => {
  test("groups by day, in date order, early arrivals first", () => {
    const days = buildTimeline({
      startDate: START,
      members: [member("early", "2026-05-31"), member("late", "2026-06-02")],
      stays: [],
      descents: [],
    });
    expect(days.map((d) => d.day)).toEqual([-1, 1, 2]);
    expect(days[0].date).toBe("2026-05-31");
  });

  test("orders a day as base, arrivals, paddling, departures", () => {
    const days = buildTimeline({
      startDate: START,
      members: [member("a", "2026-06-01", "2026-06-01")],
      stays: [stay("Camp", "2026-06-01")],
      descents: [descent("2026-06-01T09:00:00Z")],
    });
    expect(days).toHaveLength(1);
    expect(days[0].events.map((e) => e.kind)).toEqual([
      "base",
      "arrives",
      "paddled",
      "leaves",
    ]);
  });

  test("skips a stay with no date - a placeholder is not a move", () => {
    const days = buildTimeline({
      startDate: START,
      members: [],
      stays: [stay("Somewhere in the Oetztal")],
      descents: [],
    });
    expect(days).toHaveLength(1);
    expect(days[0].events).toEqual([]);
  });

  test("fills the days in between, so a quiet middle is still a day", () => {
    const days = buildTimeline({
      startDate: START,
      members: [member("a", "2026-06-01", "2026-06-08")],
      stays: [],
      descents: [],
    });
    expect(days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(days[0].events).toHaveLength(1);
    expect(days[3].events).toEqual([]);
  });

  test("runs to the trip's end even when nothing is planned", () => {
    const days = buildTimeline({
      startDate: START,
      endDate: "2026-06-04",
      members: [],
      stays: [],
      descents: [],
    });
    expect(days.map((d) => d.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  test("starts at an early arrival rather than at the trip's start", () => {
    const days = buildTimeline({
      startDate: START,
      members: [member("early", "2026-05-30")],
      stays: [],
      descents: [],
    });
    expect(days[0].day).toBe(-2);
    expect(days.map((d) => d.day)).toEqual([-2, -1, 1]);
  });
});

function paddle(
  user: string,
  sections: [number, string, number, string][],
  startTime = "2026-06-01T09:00:00Z",
) {
  return {
    kind: "paddled" as const,
    date: startTime.slice(0, 10),
    descent: {
      id: Math.random(),
      user_id: user,
      username: user,
      start_time: startTime,
      end_time: startTime,
      visibility: { type: "private" },
      sections: sections.map(([id, name, wid, wname], i) => ({
        section_id: id,
        section_name: name,
        waterway_id: wid,
        waterway_name: wname,
        sort_order: i + 1,
      })),
      created_at: startTime,
      updated_at: startTime,
    } as unknown as Descent,
  };
}

describe("paddledByRiver", () => {
  test("groups sections under their river", () => {
    const { rivers } = paddledByRiver([
      paddle("vincent", [[1, "Upper Test", 10, "Test River"]]),
      paddle("mara", [[2, "Wellerbrücke", 20, "Ötztaler Ache"]]),
    ]);
    expect(rivers).toHaveLength(2);
    expect(rivers.find((r) => r.name === "Test River")?.sections).toEqual([
      { sectionId: 1, name: "Upper Test", paddlers: ["vincent"] },
    ]);
  });

  test("orders rivers the way a reader expects, not by code point", () => {
    const { rivers } = paddledByRiver([
      paddle("vincent", [[1, "Zoo", 10, "Zillertal"]]),
      paddle("mara", [[2, "Weller", 20, "Ötztaler Ache"]]),
      paddle("tobi", [[3, "Oberlauf", 30, "Otta"]]),
    ]);
    // Ö belongs with O, not after Z, which is why this sorts by locale.
    expect(rivers.map((r) => r.name)).toEqual([
      "Otta",
      "Ötztaler Ache",
      "Zillertal",
    ]);
  });

  test("one line per section, with everybody who ran it", () => {
    const { rivers } = paddledByRiver([
      paddle("vincent", [
        [1, "Upper Test", 10, "Test River"],
        [2, "Lower Test", 10, "Test River"],
      ]),
      paddle("mara", [[2, "Lower Test", 10, "Test River"]]),
    ]);
    expect(rivers).toHaveLength(1);
    expect(rivers[0].sections).toEqual([
      { sectionId: 1, name: "Upper Test", paddlers: ["vincent"] },
      { sectionId: 2, name: "Lower Test", paddlers: ["vincent", "mara"] },
    ]);
  });

  test("keeps a log that has no sections rather than dropping it", () => {
    const { rivers, unsectioned } = paddledByRiver([paddle("tobi", [])]);
    expect(rivers).toEqual([]);
    expect(unsectioned).toHaveLength(1);
  });

  test("ignores everything that is not a paddle", () => {
    const { rivers } = paddledByRiver([
      {
        kind: "arrives",
        date: "2026-06-01",
        member: member("a", "2026-06-01"),
      },
    ]);
    expect(rivers).toEqual([]);
  });
});

describe("monthGrid", () => {
  test("is six Monday-first weeks, padded from the neighbours", () => {
    const weeks = monthGrid(2026, 9);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
    // 01 Sept 2026 is a Tuesday, so the grid opens on Monday the 31st.
    expect(weeks[0][0]).toBe("2026-08-31");
    expect(weeks[0][1]).toBe("2026-09-01");
  });

  test("handles a month that starts on a Monday without a blank week", () => {
    // 01 June 2026 is a Monday.
    expect(monthGrid(2026, 6)[0][0]).toBe("2026-06-01");
  });
});
