import { describe, expect, test } from "bun:test";
import type { GaugeMapPoint } from "@/lib/api";
import { groupByProximity } from "./groupByProximity";
import { toFeatureCollection } from "./toFeatureCollection";

const point = (overrides: Partial<GaugeMapPoint> = {}): GaugeMapPoint => ({
  provider: "hubeau",
  station_id: "X001",
  name: "Isère / Grenoble",
  river: "Isère",
  lat: 45.19,
  lon: 5.72,
  state: "available",
  params: ["W", "Q"],
  ...overrides,
});

describe("groupByProximity", () => {
  test("merges points within ~250m into one group", () => {
    const groups = groupByProximity([
      point({
        provider: "rivermap",
        station_id: "a",
        lat: 46.8594,
        lon: 10.9145,
        state: "fetched",
      }),
      point({
        provider: "tirol",
        station_id: "b",
        lat: 46.85945,
        lon: 10.91456,
        state: "available",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    // Strongest state wins (fetched > available).
    expect(groups[0].state).toBe("fetched");
  });

  test("keeps points far apart in separate groups", () => {
    const groups = groupByProximity([
      point({ station_id: "a", lat: 45.19, lon: 5.72 }),
      point({ station_id: "b", lat: 48.2, lon: 11.6 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  test("used beats fetched/available for the group state and label", () => {
    const groups = groupByProximity([
      point({ station_id: "a", lat: 45.19, lon: 5.72, state: "available" }),
      point({
        station_id: "b",
        lat: 45.1901,
        lon: 5.7201,
        state: "used",
        name: "Weir",
      }),
    ]);
    expect(groups[0].state).toBe("used");
    expect(groups[0].name).toBe("Weir");
  });

  test("drops points with non-finite coordinates", () => {
    const groups = groupByProximity([
      point(),
      point({ station_id: "bad", lat: Number.NaN }),
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe("toFeatureCollection", () => {
  test("maps a group to one feature with [lon,lat], state and member count", () => {
    const groups = groupByProximity([
      point({ state: "used", lat: 45.19, lon: 5.72 }),
      point({
        station_id: "X002",
        state: "available",
        lat: 45.1901,
        lon: 5.7201,
      }),
    ]);
    const fc = toFeatureCollection(groups);
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.properties.state).toBe("used");
    expect(f.properties.count).toBe(2);
    expect(f.geometry.coordinates[0]).toBeCloseTo(5.72, 2);
  });
});
