import type { Map as MapLibreMap } from "maplibre-gl";
import type { ResolvedTokens } from "@/lib/useTokens";

const GREEN_FILL = /^(park$|landcover_(wood|grass))/;
const HIDDEN =
  /^(natural_earth|park_outline|landcover_(wetland|ice|sand)|landuse_|aeroway_|building|road_area_pattern|waterway_tunnel|poi_|airport|boundary_(3|disputed)|highway-(name-path|name-minor|shield)|road_(shield|one_way)|(tunnel|road|bridge)_(.*casing|.*rail|path_pedestrian|transit))/;

/** Road classes with the zoom they first appear at: the design's low-zoom
 * map carries no road atlas, so only the main roads show, later and thinner. */
const ROAD_MIN_ZOOM: [RegExp, number][] = [
  [/^(road|bridge|tunnel)_(motorway|trunk_primary)$/, 8],
  [/^(road|bridge|tunnel)_secondary_tertiary$/, 10],
  [
    /^(road|bridge|tunnel)_(minor|street|link|motorway_link|service_track)$/,
    12,
  ],
];
const ROAD_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  0.4,
  14,
  1.2,
  18,
  4,
];

const SOFT_PLACE = /^label_(other|village)$/;
const PLACE_MIN_ZOOM: [RegExp, number][] = [
  [/^label_town$/, 8],
  [/^label_(other|village)$/, 11],
  [/^label_city/, 5],
];
const PLACE_NAME = ["coalesce", ["get", "name_en"], ["get", "name"]];

/** Restyles OpenFreeMap Liberty to the calm base map: warm ground, soft
 * greens, pale water, thin pale roads that appear late, a single dashed
 * country border and few place names in ink on a white halo. Section
 * lines, markers and region layers are added by the app and are not
 * touched. Safe to run again after a style swap or a scheme switch: the
 * colours are resolved values (MapLibre cannot parse a `var()`). */
export function applyCalmStyle(map: MapLibreMap, tokens: ResolvedTokens) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const { id } = layer;
    // The app's own layers (regions, sections, markers) carry their own paint.
    if ("source" in layer && map.getSource(layer.source)?.type === "geojson") {
      continue;
    }
    if (id === "background") {
      map.setPaintProperty(id, "background-color", tokens.mapGround);
    } else if (HIDDEN.test(id)) {
      map.setLayoutProperty(id, "visibility", "none");
    } else if (id === "water") {
      map.setPaintProperty(id, "fill-color", tokens.mapWater);
    } else if (/^waterway_(river|other)$/.test(id)) {
      map.setPaintProperty(id, "line-color", tokens.mapRiver);
    } else if (layer.type === "fill" && GREEN_FILL.test(id)) {
      map.setPaintProperty(id, "fill-color", tokens.mapGreen);
      map.setPaintProperty(id, "fill-opacity", 1);
      map.setPaintProperty(id, "fill-outline-color", tokens.mapGreen);
    } else if (id === "boundary_2") {
      map.setPaintProperty(id, "line-color", tokens.outline);
      map.setPaintProperty(id, "line-opacity", 0.7);
      map.setPaintProperty(id, "line-width", 1);
      map.setPaintProperty(id, "line-dasharray", [4, 3]);
    } else if (layer.type === "line" && /^(road|bridge|tunnel)_/.test(id)) {
      const rule = ROAD_MIN_ZOOM.find(([re]) => re.test(id));
      if (!rule) continue;
      map.setPaintProperty(id, "line-color", tokens.mapRoad);
      map.setPaintProperty(id, "line-width", ROAD_WIDTH);
      map.setPaintProperty(id, "line-opacity", 1);
      map.setLayerZoomRange(id, rule[1], layer.maxzoom ?? 24);
    } else if (layer.type === "symbol") {
      map.setPaintProperty(id, "text-color", tokens.mapLabelText);
      map.setPaintProperty(id, "text-halo-color", tokens.mapLabelHalo);
      map.setPaintProperty(id, "text-halo-width", 1.5);
      map.setPaintProperty(id, "text-halo-blur", 0);
      if (layer.layout?.["text-transform"] != null) {
        map.setLayoutProperty(id, "text-transform", "none");
      }
      if (/^label_/.test(id)) {
        map.setLayoutProperty(id, "text-field", PLACE_NAME);
        map.setLayoutProperty(id, "icon-image", "");
      }
      if (id === "label_state") {
        map.setLayoutProperty(id, "visibility", "none");
      }
      const place = PLACE_MIN_ZOOM.find(([re]) => re.test(id));
      if (place) {
        map.setLayerZoomRange(id, place[1], layer.maxzoom ?? 24);
      }
      if (SOFT_PLACE.test(id) || /^(water|waterway)_/.test(id)) {
        map.setPaintProperty(id, "text-color", tokens.outline);
      }
    }
  }
}
