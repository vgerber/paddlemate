import { describe, expect, test } from "bun:test";
import type { TripSection, TripStay } from "@/lib/api";
import {
  baseRanges,
  nearestWatched,
  rangeBounds,
  sectionDistanceKm,
} from "./tripRange";

// Each call is a different run: sharing one section_id made every section
// look like the same one to anything that dedupes by it.
let nextSectionId = 1;

function section(
  name: string,
  coords: [number, number][] | null,
  river = "Test River",
): TripSection {
  const id = nextSectionId++;
  return {
    id,
    stay_id: 1,
    section_id: id,
    section_name: name,
    waterway_name: river,
    sort_order: 1,
    status: "planned",
    location: coords ? { type: "LineString", coordinates: coords } : null,
  } as unknown as TripSection;
}

function stay(
  name: string,
  point: [number, number] | null,
  sections: TripSection[],
): TripStay {
  return {
    id: 1,
    trip_id: 1,
    kind: "camp",
    name,
    location: point ? { type: "Point", coordinates: point } : null,
    sections,
    created_by: "x",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  } as unknown as TripStay;
}

// Oetz, and points roughly north of it.
const BASE: [number, number] = [10.9, 47.2];

describe("sectionDistanceKm", () => {
  test("measures to the nearest point of the run, not its start", () => {
    // The line runs away from the base, so its first vertex is the near end.
    const far = section("Far end first", [
      [10.9, 47.4],
      [10.9, 47.25],
    ]);
    const d = sectionDistanceKm(47.2, 10.9, far);
    // ~0.05 degrees of latitude, not ~0.2.
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(7);
  });

  test("is null for a section with no geometry", () => {
    expect(sectionDistanceKm(47.2, 10.9, section("Unmapped", null))).toBeNull();
  });
});

describe("baseRanges", () => {
  test("the radius reaches the farthest section, so the ring covers them all", () => {
    const near = section("Near", [[10.9, 47.25]]);
    const far = section("Far", [[10.9, 47.5]]);
    const [range] = baseRanges([stay("Camp", BASE, [near, far])]);
    expect(range.farthest).toBe("Far");
    expect(range.sectionCount).toBe(2);
    const nearKm = sectionDistanceKm(47.2, 10.9, near) as number;
    expect(range.radiusKm).toBeGreaterThan(nearKm);
  });

  test("skips a base nobody has placed yet", () => {
    expect(baseRanges([stay("Somewhere in the Oetztal", null, [])])).toEqual(
      [],
    );
  });

  test("a placed base with an empty watch list has no reach, but still shows", () => {
    const [range] = baseRanges([stay("Camp", BASE, [])]);
    expect(range.radiusKm).toBe(0);
    expect(range.farthest).toBeNull();
    expect(range.sectionCount).toBe(0);
  });

  test("sections without geometry do not count towards the reach", () => {
    const [range] = baseRanges([
      stay("Camp", BASE, [section("Unmapped", null)]),
    ]);
    expect(range.sectionCount).toBe(0);
    expect(range.radiusKm).toBe(0);
  });
});

describe("rangeBounds", () => {
  test("is null when there is nothing placed", () => {
    expect(rangeBounds([])).toBeNull();
  });

  test("holds the whole ring, not just its centre", () => {
    const [range] = baseRanges([
      stay("Camp", BASE, [section("Far", [[10.9, 47.5]])]),
    ]);
    const box = rangeBounds([range]) as [[number, number], [number, number]];
    const [[minLon, minLat], [maxLon, maxLat]] = box;
    expect(minLat).toBeLessThan(47.2);
    expect(maxLat).toBeGreaterThan(47.5 - 0.01);
    expect(minLon).toBeLessThan(10.9);
    expect(maxLon).toBeGreaterThan(10.9);
  });
});

describe("nearestWatched", () => {
  const near = section("Near run", [[10.9, 47.25]]);
  const far = section("Far run", [[10.9, 47.6]]);
  const stays = [stay("Camp", BASE, [far]), stay("Hotel", BASE, [near])];

  test("finds the closest run across every watch list, not just the first", () => {
    const hit = nearestWatched(
      { location: { type: "Point", coordinates: BASE } },
      stays,
    );
    expect(hit?.name).toBe("Near run");
  });

  test("names the river as well, since a run name alone is ambiguous", () => {
    const hit = nearestWatched(
      { location: { type: "Point", coordinates: BASE } },
      [
        stay("Camp", BASE, [
          section("Weller Bridge", [[10.9, 47.25]], "Ötztaler Ache"),
        ]),
      ],
    );
    expect(hit?.river).toBe("Ötztaler Ache");
  });

  test("is null for a candidate nobody has placed", () => {
    expect(nearestWatched({ location: null }, stays)).toBeNull();
  });

  test("is null when the trip watches nothing measurable", () => {
    const unmapped = [stay("Camp", BASE, [section("Unmapped", null)])];
    expect(
      nearestWatched(
        { location: { type: "Point", coordinates: BASE } },
        unmapped,
      ),
    ).toBeNull();
  });

  test("counts a run on two lists once, and still finds it", () => {
    const shared = section("Shared", [[10.9, 47.25]]);
    const twice = [stay("A", BASE, [shared]), stay("B", BASE, [shared])];
    const hit = nearestWatched(
      { location: { type: "Point", coordinates: BASE } },
      twice,
    );
    expect(hit?.name).toBe("Shared");
  });
});
