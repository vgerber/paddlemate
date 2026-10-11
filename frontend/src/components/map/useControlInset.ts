import { type RefObject, useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { MapPadding } from "./Map";

const CORNERS = [
  [".maplibregl-ctrl-top-right", "top", "right"],
  [".maplibregl-ctrl-bottom-right", "bottom", "right"],
  [".maplibregl-ctrl-top-left", "top", "left"],
  [".maplibregl-ctrl-bottom-left", "bottom", "left"],
] as const;

/** Moves MapLibre's own control corners (zoom, attribution) in from the map's
 * edges, so on a canvas screen they sit in the free area and not under a
 * card. Without an inset the corners are left where MapLibre puts them. */
export function useControlInset(
  mapRef: RefObject<MapRef | null>,
  mapLoaded: boolean,
  inset: MapPadding | undefined,
) {
  const { top, right, bottom, left } = inset ?? {};
  useEffect(() => {
    const root = mapRef.current?.getContainer();
    if (!root || !mapLoaded) return;
    const px = { top, right, bottom, left };
    for (const [selector, a, b] of CORNERS) {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) continue;
      el.style[a] = px[a] == null ? "" : `${px[a]}px`;
      el.style[b] = px[b] == null ? "" : `${px[b]}px`;
    }
  }, [mapRef, mapLoaded, top, right, bottom, left]);
}
