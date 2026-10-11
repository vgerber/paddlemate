import { describe, expect, test } from "bun:test";
import type { SectionWithFeatures } from "@/lib/api";
import { buildMapScene, type MapSceneInput, sceneSubject } from "./mapScene";

const section = (
  id: number,
  coordinates: number[][] | null,
): SectionWithFeatures => ({
  id,
  name: `Section ${id}`,
  waterway_id: 1,
  features: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  location: coordinates
    ? { type: "LineString", coordinates }
    : { type: "Point", coordinates: [0, 0] },
});

const upper = section(1, [
  [10, 47],
  [11, 48],
]);
const lower = section(2, [
  [11, 48],
  [12, 49],
]);
const found = section(3, [
  [5, 40],
  [6, 41],
]);

const noop = () => {
  // Handlers the scene wires through but these tests never call.
};

function input(over: Partial<MapSceneInput> = {}): MapSceneInput {
  return {
    selectedWaterwayId: undefined,
    selectedSectionId: undefined,
    sections: [upper, lower],
    filteredSearchSections: [found],
    suggestMode: null,
    suggestGaugePins: [],
    gaugePins: [],
    selectedGaugeId: null,
    handleGaugeClick: noop,
    handleSectionClick: noop,
    areaLocked: false,
    setAreaCircle: noop,
    isAreaMode: false,
    isRegionMode: false,
    regionOutline: undefined,
    countryBorders: [],
    selectRegion: () => Promise.resolve(),
    sectionLevels: { 1: "low" },
    searchSectionLevels: { 3: "high" },
    focusedPoint: null,
    focusBounds: null,
    setMapBounds: noop,
    isMobile: false,
    isMobileMapView: false,
    notePinPlacing: false,
    setNotePin: noop,
    setNotePinPlacing: noop,
    selectedNoteId: null,
    sectionPreviewCoords: null,
    featureVertices: [],
    featureGeomType: "Point",
    featurePickingActive: false,
    handleMapPick: noop,
    waterwayNames: {},
    labelMode: "section",
    setLabelMode: noop,
    visibleAreaCircle: null,
    drawnRegions: [],
    mapFeatures: undefined,
    proposedFeatures: undefined,
    notePins: [],
    draftPin: [],
    onNoteSelect: noop,
    onOpenThread: undefined,
    ...over,
  };
}

describe("sceneSubject", () => {
  test("a selected section is the subject", () => {
    const subject = sceneSubject(
      input({ selectedWaterwayId: 1, selectedSectionId: 2 }),
    );
    expect(subject?.key).toBe("section:2");
    expect(subject?.bounds).toEqual([
      [11, 48],
      [12, 49],
    ]);
  });

  test("a river without a selected section frames all its sections", () => {
    const subject = sceneSubject(input({ selectedWaterwayId: 1 }));
    expect(subject?.key).toBe("river:1:2");
    expect(subject?.bounds).toEqual([
      [10, 47],
      [12, 49],
    ]);
  });

  test("a section without a line falls back to the river", () => {
    const subject = sceneSubject(
      input({
        selectedWaterwayId: 1,
        selectedSectionId: 9,
        sections: [upper, section(9, null)],
      }),
    );
    expect(subject?.key).toBe("river:1:2");
  });

  test("a river with no sections loaded has no subject yet", () => {
    expect(
      sceneSubject(input({ selectedWaterwayId: 1, sections: [] })),
    ).toBeNull();
  });

  test("with no river the search results are the subject", () => {
    const subject = sceneSubject(input());
    expect(subject?.key).toBe("results:3");
    expect(subject?.bounds).toEqual([
      [5, 40],
      [6, 41],
    ]);
  });

  test("a region search frames its own area, not the results", () => {
    expect(
      sceneSubject(
        input({ regionOutline: { id: 1 } as MapSceneInput["regionOutline"] }),
      ),
    ).toBeNull();
  });

  test("the key changes with the results", () => {
    const a = sceneSubject(input());
    const b = sceneSubject(input({ filteredSearchSections: [found, upper] }));
    expect(a?.key).not.toBe(b?.key);
  });
});

describe("buildMapScene", () => {
  test("draws the river's sections when one is open", () => {
    const scene = buildMapScene(input({ selectedWaterwayId: 1 }));
    expect(scene.sections).toEqual([upper, lower]);
    expect(scene.sectionLevels).toEqual({ 1: "low" });
  });

  test("draws the search results with no river", () => {
    const scene = buildMapScene(input());
    expect(scene.sections).toEqual([found]);
    expect(scene.sectionLevels).toEqual({ 3: "high" });
  });

  test("suggesting a river stops section and gauge clicks", () => {
    const scene = buildMapScene(input({ suggestMode: "waterway" }));
    expect(scene.onSectionClick).toBeUndefined();
    expect(scene.gauges?.onClick).toBeUndefined();
  });

  test("the area can be edited only in area mode, unlocked, with no river", () => {
    expect(buildMapScene(input()).area?.onChange).toBeUndefined();
    expect(
      buildMapScene(input({ isAreaMode: true })).area?.onChange,
    ).toBeDefined();
    expect(
      buildMapScene(input({ isAreaMode: true, areaLocked: true })).area
        ?.onChange,
    ).toBeUndefined();
    expect(
      buildMapScene(input({ isAreaMode: true, selectedWaterwayId: 1 })).area
        ?.onChange,
    ).toBeUndefined();
  });

  test("a river takes the map over from the regions", () => {
    const scene = buildMapScene(
      input({ isRegionMode: true, selectedWaterwayId: 1 }),
    );
    expect(scene.regions?.choices).toBeNull();
    expect(scene.regions?.onSelect).toBeUndefined();
  });

  test("a phone lifts the controls above its strip, a wide screen leaves them to the canvas", () => {
    const phone = buildMapScene(
      input({ isMobile: true, isMobileMapView: true }),
    );
    expect(phone.chrome?.controlsBottomOffset).toBe(60);
    expect(phone.chrome?.attributionPosition).toBe("top-left");
    const wide = buildMapScene(input());
    expect(wide.chrome?.controlsBottomOffset).toBe(0);
    expect(wide.chrome?.attributionPosition).toBe("bottom-right");
  });

  test("placing a note pin routes map clicks to the pin", () => {
    const pins: [number, number][] = [];
    const scene = buildMapScene(
      input({
        notePinPlacing: true,
        setNotePin: (p) => {
          if (Array.isArray(p)) pins.push(p);
        },
      }),
    );
    expect(scene.drawing?.placingFeature).toBe(true);
    scene.drawing?.onMapClick?.(11, 48);
    expect(pins).toEqual([[11, 48]]);
  });

  test("carries the subject for the canvas camera", () => {
    expect(buildMapScene(input()).subject?.key).toBe("results:3");
  });
});
