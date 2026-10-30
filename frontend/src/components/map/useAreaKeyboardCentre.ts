import { type RefObject, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { type AreaCircle, DEFAULT_RADIUS_KM } from "@/lib/map/geo";

/** Enter on the focused map drops the area centre where the arrow keys have
 * panned it to: the keyboard counterpart of a click. */
export function useAreaKeyboardCentre(
  mapRef: RefObject<MapRef | null>,
  mapLoaded: boolean,
  circle: AreaCircle | null | undefined,
  onChange: ((circle: AreaCircle | null) => void) | undefined,
) {
  const radius = useRef(circle?.radiusKm);
  radius.current = circle?.radiusKm;
  const change = useRef(onChange);
  change.current = onChange;
  const enabled = onChange != null;
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !enabled) return;
    const canvas = map.getCanvas();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const c = map.getCenter();
      change.current?.({
        lat: c.lat,
        lon: c.lng,
        radiusKm: radius.current ?? DEFAULT_RADIUS_KM,
      });
      e.preventDefault();
    };
    canvas.addEventListener("keydown", onKey);
    return () => canvas.removeEventListener("keydown", onKey);
  }, [mapRef, mapLoaded, enabled]);
}
