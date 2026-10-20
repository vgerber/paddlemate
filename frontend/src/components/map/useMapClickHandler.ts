import { useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { type AreaCircle, DEFAULT_RADIUS_KM, type LngLat } from "@/lib/geo";
import { REGION_FILL_LAYER, SECTION_HIT_LAYERS } from "./layerIds";
import type { PickMode } from "./PickModeButtons";
import type { RegionChoice } from "./RegionChoicePopup";

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
  for (const feature of event.features ?? []) {
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

interface MapClickHandlerOptions {
  onPickPutIn?: (point: LngLat) => void;
  onPickTakeOut?: (point: LngLat) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  placingFeature?: boolean;
  onMapClick?: (point: LngLat) => void;
  onSectionToggle?: (id: number) => void;
  onSectionClick?: (id: number) => void;
  onRegionSelect?: (regionId: number) => void;
}

/** Owns the put-in/take-out pick mode and dispatches map clicks in priority
 * order: pick mode > area circle > feature placement > section select >
 * region select. A region is the whole ground under the pointer, so it only
 * gets the click nothing narrower wanted, and where regions overlap the
 * click opens the stack to choose from instead of guessing. */
export function useMapClickHandler({
  onPickPutIn,
  onPickTakeOut,
  areaCircle,
  onAreaCircleChange,
  placingFeature,
  onMapClick,
  onSectionToggle,
  onSectionClick,
  onRegionSelect,
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
    if (options.length === 0) return;
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
