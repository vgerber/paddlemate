import { useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { type AreaCircle, DEFAULT_RADIUS_KM, type LngLat } from "@/lib/geo";
import {
  FEATURE_LINE_HIT_LAYERS,
  FEATURE_POINT_HIT_LAYERS,
  REGION_FILL_LAYER,
  SECTION_HIT_LAYERS,
} from "./layerIds";
import type { PickMode } from "./PickModeButtons";
import type { RegionChoice } from "./RegionChoicePopup";

/** How far from a tap a region still counts as hit, in pixels. */
const REGION_TAP_SLOP_PX = 10;

/** The regions under one click, when there was more than one to choose from. */
interface RegionMenu {
  at: { lng: number; lat: number };
  options: RegionChoice[];
  pickedId: number;
}

/** Read the region rows out of a click, innermost first and without repeats.
 * MapLibre returns every feature under the pointer in draw order, and the
 * browse layer draws the smallest region last. */
function regionsUnder(event: MapLayerMouseEvent): RegionChoice[] {
  const options: RegionChoice[] = [];
  let hits = event.features ?? [];
  // A valley is a corridor a finger is wider than: when the tap landed beside
  // one, take the regions within reach of it.
  if (!hits.some((f) => f.layer.id === REGION_FILL_LAYER)) {
    const { x, y } = event.point;
    hits = event.target.queryRenderedFeatures(
      [
        [x - REGION_TAP_SLOP_PX, y - REGION_TAP_SLOP_PX],
        [x + REGION_TAP_SLOP_PX, y + REGION_TAP_SLOP_PX],
      ],
      { layers: [REGION_FILL_LAYER] },
    );
  }
  for (const feature of hits) {
    if (feature.layer.id !== REGION_FILL_LAYER) continue;
    const { id, label, sub } = feature.properties ?? {};
    if (typeof id !== "number" || options.some((o) => o.id === id)) continue;
    options.push({
      id,
      label: typeof label === "string" ? label : "",
      sub: typeof sub === "string" ? sub : "",
    });
  }
  return options;
}

/** The feature under a click: a point or pin first, else a line. */
function featureUnder(event: MapLayerMouseEvent): number | null {
  const hits = event.features ?? [];
  for (const layers of [FEATURE_POINT_HIT_LAYERS, FEATURE_LINE_HIT_LAYERS]) {
    for (const hit of hits) {
      if (!layers.includes(hit.layer.id)) continue;
      // A stored put-in or take-out names its feature; a plain end of the
      // section line does not and is left to the section.
      const props = hit.properties ?? {};
      const id = Number(props.feature_id ?? props.id);
      if (Number.isFinite(id)) return id;
    }
  }
  return null;
}

interface MapClickHandlerOptions {
  onPickPutIn?: (point: LngLat) => void;
  onPickTakeOut?: (point: LngLat) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  placingFeature?: boolean;
  onMapClick?: (point: LngLat) => void;
  onFeatureClick?: (id: number) => void;
  onSectionToggle?: (id: number) => void;
  onSectionClick?: (id: number) => void;
  onRegionSelect?: (regionId: number) => void;
  /** Phone: a tap on a region lights it first and only a second tap on the
   * same one picks it. A tap on bare map clears the light. */
  onRegionPreview?: (regionId: number | null) => void;
  regionPreviewId?: number | null;
}

/** Owns the put-in/take-out pick mode and dispatches map clicks in priority
 * order: pick mode > area circle > feature placement > feature open >
 * section select > region select. A region is the whole ground under the pointer, so it only
 * gets the click nothing narrower wanted, and where regions overlap the
 * click opens the stack to choose from instead of guessing. */
export function useMapClickHandler({
  onPickPutIn,
  onPickTakeOut,
  areaCircle,
  onAreaCircleChange,
  placingFeature,
  onMapClick,
  onFeatureClick,
  onSectionToggle,
  onSectionClick,
  onRegionSelect,
  onRegionPreview,
  regionPreviewId,
}: MapClickHandlerOptions) {
  const [pickMode, setPickMode] = useState<PickMode | null>(null);
  const [regionMenu, setRegionMenu] = useState<RegionMenu | null>(null);
  const closeRegionMenu = () => setRegionMenu(null);

  const togglePickMode = (mode: PickMode) =>
    setPickMode((p) => (p === mode ? null : mode));

  const handleClick = (e: MapLayerMouseEvent) => {
    setRegionMenu(null);
    if (pickMode) {
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (pickMode === "put-in") onPickPutIn?.(point);
      else onPickTakeOut?.(point);
      setPickMode(null);
      return;
    }
    if (onAreaCircleChange) {
      onAreaCircleChange({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        radiusKm: areaCircle?.radiusKm ?? DEFAULT_RADIUS_KM,
      });
      return;
    }
    const sectionFeature = e.features?.find((f) =>
      SECTION_HIT_LAYERS.includes(f.layer.id),
    );
    if (placingFeature && onMapClick) {
      onMapClick([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    const featureId = onFeatureClick ? featureUnder(e) : null;
    if (featureId != null) {
      onFeatureClick?.(featureId);
      return;
    }
    if (sectionFeature?.id !== undefined) {
      if (onSectionToggle) {
        onSectionToggle(Number(sectionFeature.id));
      } else if (onSectionClick) {
        onSectionClick(Number(sectionFeature.id));
      }
      return;
    }
    if (!onRegionSelect) return;
    const options = regionsUnder(e);
    if (options.length === 0) {
      onRegionPreview?.(null);
      return;
    }
    if (onRegionPreview) {
      const target =
        options.find((o) => o.id === regionPreviewId) ?? options[0];
      if (target.id !== regionPreviewId) {
        onRegionPreview(target.id);
        return;
      }
      onRegionSelect(target.id);
      return;
    }
    // The innermost region is the answer at once; any others are offered.
    onRegionSelect(options[0].id);
    if (options.length > 1) {
      setRegionMenu({ at: e.lngLat, options, pickedId: options[0].id });
    }
  };

  return {
    pickMode,
    togglePickMode,
    handleClick,
    regionMenu,
    closeRegionMenu,
  };
}
