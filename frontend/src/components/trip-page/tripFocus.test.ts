import { describe, expect, test } from "bun:test";
import type { TripStay, TripStayCandidate } from "@/lib/api";
import { focusBounds } from "./tripFocus";

const stay = (id: number, arrival: string, departure: string, lon: number) =>
  ({
    id,
    arrival,
    departure,
    sections: [],
    location: { type: "Point", coordinates: [lon, 47] },
  }) as unknown as TripStay;
const range = (stayId: number, lon: number) => ({
  stayId,
  name: "x",
  lat: 47,
  lon,
  radiusKm: 0,
  farthest: null,
  sectionCount: 0,
});

describe("focusBounds", () => {
  test("a candidate frames its point", () => {
    const c = {
      id: 3,
      location: { type: "Point", coordinates: [11, 46] },
    } as unknown as TripStayCandidate;
    expect(focusBounds({ kind: "candidate", id: 3 }, [], [c], [], [])).toEqual([
      [11, 46],
      [11, 46],
    ]);
    expect(
      focusBounds({ kind: "candidate", id: 9 }, [], [c], [], []),
    ).toBeNull();
  });

  test("a day frames only the bases it falls in", () => {
    const stays = [
      stay(1, "2026-07-01", "2026-07-03", 10),
      stay(2, "2026-07-04", "2026-07-06", 20),
    ];
    const ranges = [range(1, 10), range(2, 20)];
    const b = focusBounds(
      { kind: "day", date: "2026-07-02" },
      stays,
      [],
      ranges,
      [],
    );
    expect(b?.[1][0]).toBeLessThan(15);
    expect(
      focusBounds({ kind: "day", date: "2026-08-01" }, stays, [], ranges, []),
    ).toBeNull();
  });
});
