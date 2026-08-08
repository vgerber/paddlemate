import { useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { AreaCircle } from "@/lib/geo";
import type { PickMode } from "./PickModeButtons";

interface MapClickHandlerOptions {
  onPickPutIn?: (lat: number, lon: number) => void;
  onPickTakeOut?: (lat: number, lon: number) => void;
  areaCircle?: AreaCircle | null;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
  onSectionToggle?: (id: number) => void;
  onSectionClick?: (id: number) => void;
}

/** Owns the put-in/take-out pick mode and dispatches map clicks in priority
 * order: pick mode > area circle > feature placement > section select. */
export function useMapClickHandler({
  onPickPutIn,
  onPickTakeOut,
  areaCircle,
  onAreaCircleChange,
  placingFeature,
  onMapClick,
  onSectionToggle,
  onSectionClick,
}: MapClickHandlerOptions) {
  const [pickMode, setPickMode] = useState<PickMode | null>(null);

  const togglePickMode = (mode: PickMode) =>
    setPickMode((p) => (p === mode ? null : mode));

  const handleClick = (e: MapLayerMouseEvent) => {
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
    }
  };

  return { pickMode, togglePickMode, handleClick };
}
