import type { MapScene } from "@/components/canvas/scene";
import type {
  AreaCircle,
  MapSubject,
  NotePin,
  PointPin,
} from "@/components/map/Map";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import { lineCoords } from "@/lib/geo";
import { circleBounds } from "./areaFrame";
import type { MapPageState } from "./useMapPageState";

/** The part of the page state the map draws and reacts to. */
const SCENE_KEYS = [
  "selectedWaterwayId",
  "selectedSectionId",
  "sections",
  "filteredSearchSections",
  "suggestMode",
  "suggestGaugePins",
  "gaugePins",
  "selectedGaugeId",
  "handleGaugeClick",
  "handleSectionClick",
  "areaLocked",
  "setAreaCircle",
  "isAreaMode",
  "isRegionMode",
  "regionOutline",
  "countryBorders",
  "regionsHiddenKinds",
  "selectRegion",
  "sectionLevels",
  "searchSectionLevels",
  "focusedPoint",
  "focusBounds",
  "setMapBounds",
  "isMobile",
  "isMobileMapView",
  "notePinPlacing",
  "setNotePin",
  "setNotePinPlacing",
  "selectedNoteId",
  "sectionPreviewCoords",
  "featureVertices",
  "featureGeomType",
  "featurePickingActive",
  "handleMapPick",
  "waterwayNames",
  "labelMode",
  "setLabelMode",
] as const;

type SceneState = Pick<MapPageState, (typeof SCENE_KEYS)[number]>;

export function pickSceneState(state: MapPageState): SceneState {
  const picked: Partial<Record<string, unknown>> = {};
  for (const key of SCENE_KEYS) picked[key] = state[key];
  return picked as SceneState;
}

/** Everything `buildMapScene` reads: the page state plus the values that are
 * derived once, with a stable identity, by `useMapScene`. */
export interface MapSceneInput extends SceneState {
  visibleAreaCircle: AreaCircle | null;
  drawnRegions: MapPageState["regionChoices"];
  mapFeatures: Feature[] | undefined;
  proposedFeatures: Feature[] | undefined;
  notePins: NotePin[];
  draftPin: PointPin[];
  onNoteSelect: (id: number | null) => void;
  onOpenThread: ((id: number) => void) | undefined;
}

type Bounds = [[number, number], [number, number]];

function boundsOf(sections: SectionWithFeatures[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const s of sections) {
    for (const [lon, lat] of lineCoords(s.location) ?? []) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return west > east
    ? null
    : [
        [west, south],
        [east, north],
      ];
}

type SubjectInput = Pick<
  MapSceneInput,
  | "selectedWaterwayId"
  | "selectedSectionId"
  | "sections"
  | "filteredSearchSections"
  | "visibleAreaCircle"
  | "regionOutline"
>;

/** What the canvas keeps inside the free area: the selected section, else the
 * river, else the search area (the circle, framed by its radius, or the
 * picked region), else the search results. */
export function sceneSubject(input: SubjectInput): MapSubject | null {
  const { selectedWaterwayId, selectedSectionId, sections } = input;
  if (selectedWaterwayId != null) {
    const section = sections.find((s) => s.id === selectedSectionId);
    const bounds = section && boundsOf([section]);
    if (section && bounds) {
      return { key: `section:${section.id}`, bounds };
    }
    const river = boundsOf(sections);
    return river
      ? {
          key: `river:${selectedWaterwayId}:${sections.length}`,
          bounds: river,
        }
      : null;
  }
  const circle = input.visibleAreaCircle;
  if (circle) {
    // Keyed by the radius: a new radius refits, a tap that moves the centre
    // leaves the camera where the finger is.
    return { key: `area:${circle.radiusKm}`, bounds: circleBounds(circle) };
  }
  const region = input.regionOutline;
  if (region) {
    const [west, south, east, north] = region.bbox;
    return {
      key: `region:${region.id}`,
      bounds: [
        [west, south],
        [east, north],
      ],
    };
  }
  const results = boundsOf(input.filteredSearchSections);
  if (!results) return null;
  const ids = input.filteredSearchSections.map((s) => s.id);
  return { key: `results:${ids.join(",")}`, bounds: results };
}

/** The map the page wants drawn, as a scene: the canvas host draws it on a
 * wide screen and `MapPane` on a phone, so both show the same thing. */
export function buildMapScene(input: MapSceneInput): MapScene {
  const {
    selectedWaterwayId,
    selectedSectionId,
    suggestMode,
    isMobile,
    notePinPlacing,
  } = input;
  const riverOpen = selectedWaterwayId != null;

  return {
    sections: riverOpen ? input.sections : input.filteredSearchSections,
    features: input.mapFeatures,
    selectedSectionId,
    onSectionClick: suggestMode ? undefined : input.handleSectionClick,
    gauges: {
      pins:
        suggestMode === "waterway" && input.suggestGaugePins.length > 0
          ? input.suggestGaugePins
          : input.gaugePins,
      selectedId: input.selectedGaugeId,
      onClick: suggestMode === "waterway" ? undefined : input.handleGaugeClick,
    },
    area: {
      circle: input.visibleAreaCircle,
      locked: input.areaLocked,
      onChange:
        input.isAreaMode && !riverOpen && !input.areaLocked
          ? input.setAreaCircle
          : undefined,
    },
    regions: {
      // A selected river takes the map over; the regions it was found
      // through would only be clutter behind it.
      choices: riverOpen || !input.isRegionMode ? null : input.drawnRegions,
      picked: riverOpen ? null : input.regionOutline,
      borders: input.countryBorders,
      hiddenKinds:
        riverOpen || !input.isRegionMode ? undefined : input.regionsHiddenKinds,
      onSelect: riverOpen ? undefined : input.selectRegion,
    },
    sectionLevels: riverOpen ? input.sectionLevels : input.searchSectionLevels,
    camera: {
      focusedPoint: input.focusedPoint,
      focusBounds: input.focusBounds,
      // The mobile sheet (suggest mode, note-pin placing) covers the
      // canvas from 45% down; pad focus moves so targets stay above it.
      focusPaddingBottom:
        isMobile && (suggestMode != null || notePinPlacing)
          ? Math.round(window.innerHeight * 0.55)
          : 0,
      onBoundsChange: input.setMapBounds,
    },
    proposedFeatures: input.proposedFeatures,
    pointPins: input.draftPin.length > 0 ? input.draftPin : undefined,
    notes: {
      pins: input.notePins.length > 0 ? input.notePins : undefined,
      selectedId: input.selectedNoteId,
      onSelect: input.onNoteSelect,
      onOpenThread: input.onOpenThread,
    },
    drawing: {
      sectionPreviewCoords: input.sectionPreviewCoords ?? undefined,
      featureVertices: input.featureVertices,
      featureGeomType: input.featureGeomType,
      placingFeature: input.featurePickingActive || notePinPlacing,
      onMapClick: input.featurePickingActive
        ? input.handleMapPick
        : notePinPlacing
          ? (lng, lat) => {
              input.setNotePin([lng, lat]);
              input.setNotePinPlacing(false);
            }
          : undefined,
    },
    chrome: {
      waterwayNames: input.waterwayNames,
      labelMode: input.labelMode,
      onLabelModeChange: input.setLabelMode,
      attributionPosition: isMobile ? "top-left" : "bottom-right",
    },
    subject: sceneSubject(input),
  };
}
