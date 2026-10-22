import type { MapScene } from "@/components/canvas/scene";
import type {
  AreaCircle,
  MapSubject,
  NotePin,
  PointPin,
} from "@/components/map/Map";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import {
  type Bounds,
  bboxToBounds,
  boundsOf,
  circleBounds,
  lineCoords,
} from "@/lib/geo";
import type { MapPageState } from "./useMapPageState";

/** The part of the page state the map draws and reacts to. */
const SCENE_KEYS = [
  "selectedWaterwayId",
  "selectedSectionId",
  "selectedFeatureId",
  "openFeatureFromMap",
  "sections",
  "mapSearchSections",
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
  "regionPreviewId",
  "setRegionPreviewId",
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

function sectionBounds(sections: SectionWithFeatures[]): Bounds | null {
  return boundsOf(sections.flatMap((s) => lineCoords(s.location) ?? []));
}

type SubjectInput = Pick<
  MapSceneInput,
  | "selectedWaterwayId"
  | "selectedSectionId"
  | "sections"
  | "mapSearchSections"
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
    const bounds = section && sectionBounds([section]);
    if (section && bounds) {
      return { key: `section:${section.id}`, bounds };
    }
    const river = sectionBounds(sections);
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
    return { key: `region:${region.id}`, bounds: bboxToBounds(region.bbox) };
  }
  const results = sectionBounds(input.mapSearchSections);
  if (!results) return null;
  const ids = input.mapSearchSections.map((s) => s.id);
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
    sections: riverOpen ? input.sections : input.mapSearchSections,
    features: input.mapFeatures,
    selectedSectionId,
    selectedFeatureId: input.selectedFeatureId,
    onFeatureClick:
      suggestMode || selectedSectionId == null
        ? undefined
        : input.openFeatureFromMap,
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
      // A phone shows what a tap would pick before it picks.
      previewId: isMobile ? input.regionPreviewId : null,
      onPreview: riverOpen || !isMobile ? undefined : input.setRegionPreviewId,
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
      featureVertices: input.featureVertices,
      featureGeomType: input.featureGeomType,
      placingFeature: input.featurePickingActive || notePinPlacing,
      onMapClick: input.featurePickingActive
        ? input.handleMapPick
        : notePinPlacing
          ? (point) => {
              input.setNotePin(point);
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
