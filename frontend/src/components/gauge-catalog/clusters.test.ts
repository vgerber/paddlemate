import { describe, expect, test } from "bun:test";
import {
  type ClusterFeature,
  clusterSignature,
  clustersOf,
  countByState,
  toggled,
} from "./clusters";
import type { MapGroup } from "./groupByProximity";

const feat = (
  id: number,
  over: Record<string, number> = {},
): ClusterFeature => ({
  properties: { cluster_id: id, point_count: 3, used: 1, ...over },
  geometry: { coordinates: [11, 47] },
});

describe("clustersOf", () => {
  test("dedupes by id, sorts, defaults missing tallies to 0", () => {
    const out = clustersOf([feat(5), feat(2), feat(5)]);
    expect(out.map((c) => c.id)).toEqual([2, 5]);
    expect(out[0]).toEqual({
      id: 2,
      lng: 11,
      lat: 47,
      total: 3,
      counts: { used: 1, fetched: 0, available: 0 },
    });
  });
  test("skips features without properties", () => {
    expect(
      clustersOf([{ properties: null, geometry: { coordinates: [0, 0] } }]),
    ).toEqual([]);
  });
});

describe("clusterSignature", () => {
  test("differs when a tally changes", () => {
    const a = clusterSignature(clustersOf([feat(1)]));
    const b = clusterSignature(clustersOf([feat(1, { fetched: 1 })]));
    expect(a).toBe("1:3:1.0.0");
    expect(b).not.toBe(a);
  });
  test("empty for no clusters", () => {
    expect(clusterSignature([])).toBe("");
  });
});

describe("countByState", () => {
  test("tallies groups by their state", () => {
    const g = (state: MapGroup["state"]) => ({ state }) as MapGroup;
    expect(countByState([g("used"), g("used"), g("available")])).toEqual({
      used: 2,
      fetched: 0,
      available: 1,
    });
  });
});

describe("toggled", () => {
  test("adds, removes and leaves the input alone", () => {
    const empty = new Set<"used" | "fetched" | "available">();
    const one = toggled(empty, "used");
    expect(one.has("used")).toBe(true);
    expect(empty.size).toBe(0);
    expect(toggled(one, "used").size).toBe(0);
  });
});
