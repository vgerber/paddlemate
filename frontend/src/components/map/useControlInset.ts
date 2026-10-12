import { type RefObject, useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { MapPadding } from "./Map";

const CORNERS = [
  [".maplibregl-ctrl-top-right", "top", "right"],
  [".maplibregl-ctrl-bottom-right", "bottom", "right"],
  [".maplibregl-ctrl-top-left", "top", "left"],
  [".maplibregl-ctrl-bottom-left", "bottom", "left"],
] as const;

/** MapLibre keeps each control 10px off its corner. */
const CTRL_MARGIN = 10;

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
    // The controls' own margin is taken out, so the inset is where they sit.
    const px = {
      top: top == null ? top : Math.max(0, top - CTRL_MARGIN),
      right: right == null ? right : Math.max(0, right - CTRL_MARGIN),
      bottom: bottom == null ? bottom : Math.max(0, bottom - CTRL_MARGIN),
      left: left == null ? left : Math.max(0, left - CTRL_MARGIN),
    };
    for (const [selector, a, b] of CORNERS) {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) continue;
      el.style[a] = px[a] == null ? "" : `${px[a]}px`;
      el.style[b] = px[b] == null ? "" : `${px[b]}px`;
    }
  }, [mapRef, mapLoaded, top, right, bottom, left]);
}
