import { describe, expect, test } from "bun:test";
import type { WaterRangeWithStatus } from "@/lib/api";
import {
  activeMeasurementType,
  measurementTypesOf,
  readingPerType,
  seriesGroups,
} from "./series";

function range(
  id: number,
  type: string,
  seriesId: number,
  feature: number,
  low: number | null = null,
): WaterRangeWithStatus {
  return {
    id,
    feature_id: feature,
    series: { id: seriesId, measurement_type: type, unit: "cm" },
    range_low: low,
  } as unknown as WaterRangeWithStatus;
}

const level = range(1, "water_level", 10, 100, 60);
const levelB = range(2, "water_level", 10, 101, 50);
const flow = range(3, "discharge", 20, 100);

describe("measurementTypesOf", () => {
  test("lists each type once", () => {
    expect(measurementTypesOf([level, levelB, flow])).toEqual([
      "water_level",
      "discharge",
    ]);
  });
});

describe("activeMeasurementType", () => {
  test("keeps a chosen type the ranges have", () => {
    expect(activeMeasurementType([level, flow], "discharge")).toBe("discharge");
  });
  test("ignores a chosen type they lack", () => {
    expect(activeMeasurementType([level], "discharge")).toBe("water_level");
  });
  test("prefers the calibrated type", () => {
    expect(activeMeasurementType([flow, level])).toBe("water_level");
  });
  test("is null without ranges", () => {
    expect(activeMeasurementType([])).toBeNull();
  });
});

describe("seriesGroups", () => {
  test("one group per series of the type", () => {
    const groups = seriesGroups([level, levelB, flow], "water_level");
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toHaveLength(2);
  });
  test("the preferred feature's range is primary", () => {
    expect(seriesGroups([level, levelB], "water_level", 101)[0].primary).toBe(
      levelB,
    );
  });
});

describe("readingPerType", () => {
  test("one range per type", () => {
    expect(readingPerType([level, levelB, flow]).map((r) => r.range)).toEqual([
      level,
      flow,
    ]);
  });
});
