import { describe, expect, test } from "bun:test";
import type { GaugeMapPoint } from "@/lib/api";
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

describe("toFeatureCollection", () => {
  test("maps coordinates [lon, lat] and carries state + props", () => {
    const fc = toFeatureCollection([point({ state: "used" })]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.geometry.coordinates).toEqual([5.72, 45.19]);
    expect(f.properties.state).toBe("used");
    expect(f.properties.provider).toBe("hubeau");
    expect(f.properties.params).toBe("W, Q");
  });

  test("coalesces null name/river to empty strings", () => {
    const fc = toFeatureCollection([point({ name: null, river: null })]);
    expect(fc.features[0].properties.name).toBe("");
    expect(fc.features[0].properties.river).toBe("");
  });

  test("drops points with non-finite coordinates", () => {
    const fc = toFeatureCollection([
      point(),
      point({ station_id: "bad", lat: Number.NaN }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.station_id).toBe("X001");
  });
});
