import type { RefObject } from "react";
import { useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { applyCalmStyle } from "./calmStyle";

const ROAD_LINE = /^(road|bridge|tunnel)_(?!.*rail)/;
const ROAD_LABEL = /^(highway-|road_shield|road_one_way)/;
export const MUTED_ROAD_OPACITY = 0.4;

/** Fades the base map's roads and hides their names and numbers while
 * `active`, so region outlines are the loudest thing on the map. Puts the
 * style back when it turns off, and applies it again after a style swap. */
export function useMutedBaseMap(
  mapRef: RefObject<MapRef | null>,
  ready: boolean,
  active: boolean,
  styleKey: string,
) {
  // styleKey only re-runs the effect when the base style is swapped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready || !active) return;
    const lines = new Map<string, unknown>();
    const labels = new Set<string>();
    const apply = () => {
      for (const layer of map.getStyle().layers) {
        if (layer.type === "line" && ROAD_LINE.test(layer.id)) {
          if (!lines.has(layer.id)) {
            lines.set(layer.id, map.getPaintProperty(layer.id, "line-opacity"));
          }
          map.setPaintProperty(layer.id, "line-opacity", MUTED_ROAD_OPACITY);
        } else if (layer.type === "symbol" && ROAD_LABEL.test(layer.id)) {
          if (map.getLayoutProperty(layer.id, "visibility") === "none")
            continue;
          labels.add(layer.id);
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    };
    // isStyleLoaded() is false while tiles load, so it cannot gate this.
    if (map.getStyle()) apply();
    map.on("style.load", apply);
    return () => {
      map.off("style.load", apply);
      if (!map.getStyle()) return;
      for (const [id, value] of lines) {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "line-opacity", value ?? 1);
        }
      }
      for (const id of labels) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", "visible");
        }
      }
    };
  }, [mapRef, ready, active, styleKey]);
}

/** Restyles the vector base map to the calm look at every zoom (see
 * `applyCalmStyle`). Runs after every style load, so it also covers the swap
 * back from satellite. */
export function useCalmBaseMap(
  mapRef: RefObject<MapRef | null>,
  ready: boolean,
  enabled: boolean,
  styleKey: string,
) {
  // styleKey only re-runs the effect when the base style is swapped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready || !enabled) return;
    const apply = () => applyCalmStyle(map);
    // isStyleLoaded() is false while tiles load, so it cannot gate this: the
    // style JSON being there is enough to restyle its layers.
    apply();
    map.on("style.load", apply);
    return () => {
      map.off("style.load", apply);
    };
  }, [mapRef, ready, enabled, styleKey]);
}
