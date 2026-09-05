import { useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { AreaCircle } from "@/lib/geo";
import type { PickMode } from "./PickModeButtons";
import type { RegionChoice } from "./RegionChoicePopup";

/** The regions under one click, when there was more than one to choose from. */
interface RegionMenu {
  at: { lng: number; lat: number };
  options: RegionChoice[];
}

/** Read the region rows out of a click, innermost first and without repeats.
 * MapLibre returns every feature under the pointer in draw order, and the
 * browse layer draws the smallest region last. */
function regionsUnder(event: MapLayerMouseEvent): RegionChoice[] {
  const options: RegionChoice[] = [];
  for (const feature of event.features ?? []) {
    if (feature.layer.id !== "region-browse-fill") continue;
    const { id, label, palette_index } = feature.properties ?? {};
    if (typeof id !== "number" || options.some((o) => o.id === id)) continue;
    options.push({
      id,
      label: typeof label === "string" ? label : "",
      paletteIndex: typeof palette_index === "number" ? palette_index : 0,
    });
  }
  return options;
}

interface MapClickHandlerOptions {
  onPickPutIn?: (lat: number, lon: number) => void;
  onPickTakeOut?: (lat: number, lon: number) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
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
      const { lng, lat } = e.lngLat;
      if (pickMode === "put-in") onPickPutIn?.(lat, lng);
      else onPickTakeOut?.(lat, lng);
      setPickMode(null);
      return;
    }
    if (onAreaCircleChange) {
      onAreaCircleChange({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        radiusKm: areaCircle?.radiusKm ?? 20,
      });
      return;
    }
    const sectionFeature = e.features?.find(
      (f) =>
        f.layer.id === "sections-line" ||
        f.layer.id === "sections-line-casing" ||
        f.layer.id === "sections-line-hitbox",
    );
    if (placingFeature && onMapClick) {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
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
    // One region under the pointer is not a choice, it is the answer.
    if (options.length === 1) {
      onRegionSelect(options[0].id);
    } else if (options.length > 1) {
      setRegionMenu({ at: e.lngLat, options });
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
