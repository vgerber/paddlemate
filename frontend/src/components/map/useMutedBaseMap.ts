import type { RefObject } from "react";
import { useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

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
          labels.add(layer.id);
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    };
    if (map.isStyleLoaded()) apply();
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

const GREEN_FILL = /^(park$|landcover_(wood|grass))/;

/** Restyles the vector base map to the calm look at every zoom: warm ground,
 * soft greens, pale water, no hatching, and place names in sentence case
 * instead of the style's capitals. Runs after every style load, so it also
 * covers the swap back from satellite. */
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
    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id === "background") {
          map.setPaintProperty(layer.id, "background-color", tokens.mapGround);
        } else if (layer.id === "water") {
          map.setPaintProperty(layer.id, "fill-color", tokens.mapWater);
        } else if (layer.type === "fill" && GREEN_FILL.test(layer.id)) {
          map.setPaintProperty(layer.id, "fill-color", tokens.mapGreen);
          map.setPaintProperty(layer.id, "fill-opacity", 1);
        } else if (layer.id === "landcover_wetland") {
          map.setLayoutProperty(layer.id, "visibility", "none");
        } else if (
          layer.type === "symbol" &&
          layer.layout?.["text-transform"] != null
        ) {
          map.setLayoutProperty(layer.id, "text-transform", "none");
        }
      }
    };
    // isStyleLoaded() is false while tiles load, so it cannot gate this: the
    // style JSON being there is enough to restyle its layers.
    apply();
    map.on("style.load", apply);
    return () => {
      map.off("style.load", apply);
    };
  }, [mapRef, ready, enabled, styleKey]);
}
