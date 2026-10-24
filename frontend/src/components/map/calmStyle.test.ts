import { describe, expect, test } from "bun:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import { type ResolvedTokens, tokensFor } from "@/lib/useTokens";
import { applyCalmStyle } from "./calmStyle";

const LAYERS = [
  { id: "background", type: "background" },
  { id: "water", type: "fill", source: "ofm" },
  { id: "waterway_river", type: "line", source: "ofm" },
  { id: "park", type: "fill", source: "ofm" },
  { id: "landcover_wood", type: "fill", source: "ofm" },
  { id: "boundary_2", type: "line", source: "ofm" },
  { id: "road_secondary_tertiary", type: "line", source: "ofm" },
  { id: "label_city", type: "symbol", source: "ofm", layout: {} },
  { id: "label_other", type: "symbol", source: "ofm", layout: {} },
  { id: "water_name", type: "symbol", source: "ofm", layout: {} },
  { id: "sections-line", type: "line", source: "app" },
];

/** A map that records every paint write: [layer, property, value]. */
function fakeMap() {
  const paint: [string, string, unknown][] = [];
  const map = {
    getStyle: () => ({ layers: LAYERS }),
    getSource: (id: string) => ({ type: id === "app" ? "geojson" : "vector" }),
    setPaintProperty: (id: string, prop: string, value: unknown) => {
      paint.push([id, prop, value]);
    },
    setLayoutProperty: () => undefined,
    setLayerZoomRange: () => undefined,
  };
  return { map: map as unknown as MapLibreMap, paint };
}

/** The tokens `applyCalmStyle` paints with, each given a value of its own so a
 * write can be traced back to the token it came from. */
const OWNED = [
  "mapGround",
  "mapWater",
  "mapRiver",
  "mapGreen",
  "mapRoad",
  "mapLabelText",
  "mapLabelHalo",
  "outline",
] as const;

function tagged(scheme: "light" | "dark", offset = 0) {
  const tokens: Record<string, unknown> = { ...tokensFor(scheme) };
  OWNED.forEach((key, i) => {
    tokens[key] = `#00${(i + 1 + offset).toString(16).padStart(2, "0")}00`;
  });
  return tokens as ResolvedTokens;
}

describe("applyCalmStyle", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`every map token reaches a paint property (${scheme})`, () => {
      const tokens = tagged(scheme);
      const { map, paint } = fakeMap();
      applyCalmStyle(map, tokens);
      const written = new Set(paint.map(([, , value]) => value));
      for (const key of OWNED) {
        expect(written.has(tokens[key])).toBe(true);
      }
    });

    test(`writes resolved colours, never a var() (${scheme})`, () => {
      const { map, paint } = fakeMap();
      applyCalmStyle(map, tokensFor(scheme));
      expect(paint.length).toBeGreaterThan(0);
      for (const [, , value] of paint) {
        expect(String(value)).not.toContain("var(");
      }
    });
  }

  test("leaves the app's own geojson layers alone", () => {
    const { map, paint } = fakeMap();
    applyCalmStyle(map, tokensFor("light"));
    expect(paint.some(([id]) => id === "sections-line")).toBe(false);
  });

  test("a second run with other tokens repaints every colour", () => {
    const { map, paint } = fakeMap();
    const light = tagged("light");
    const dark = tagged("dark", 32);
    applyCalmStyle(map, light);
    applyCalmStyle(map, dark);
    const grounds = paint
      .filter(
        ([id, prop]) => id === "background" && prop === "background-color",
      )
      .map(([, , value]) => value);
    expect(grounds).toEqual([light.mapGround, dark.mapGround]);
  });
});
