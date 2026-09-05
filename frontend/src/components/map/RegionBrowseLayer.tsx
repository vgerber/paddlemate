import type { ExpressionSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { RegionOutline } from "@/lib/api";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const PALETTE = tokens.mapRegionPalette;

/** Pick this feature's colour from the palette. The server hands out an
 * index per region so that overlapping ones differ; a viewport crowded
 * enough to run past the palette wraps and repeats a hue. */
const PALETTE_COLOR: ExpressionSpecification = [
  "match",
  ["%", ["get", "palette_index"], PALETTE.length],
  0,
  PALETTE[0],
  1,
  PALETTE[1],
  2,
  PALETTE[2],
  3,
  PALETTE[3],
  4,
  PALETTE[4],
  5,
  PALETTE[5],
  PALETTE[0],
];

/** The regions in view, drawn as pickable areas. In region mode the map is
 * the picker: every outline is an option and clicking one filters the rivers
 * to it.
 *
 * The colour rides on the boundary rather than in the fill. These regions
 * overlap - a side valley runs into the main one - and two translucent fills
 * on the same ground blend into a third colour belonging to neither, which
 * is exactly where the eye needs the edge. The fill stays faint, enough to
 * read as a surface and to catch the click.
 *
 * The region already picked is left out, because RegionOutlineLayer draws
 * that one in full and keeps drawing it after a pan takes it out of view. */
export default function RegionBrowseLayer({
  outlines,
  selectedId,
}: {
  outlines?: RegionOutline[] | null;
  selectedId?: number | null;
}) {
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: (outlines ?? [])
        .filter((region) => region.id !== selectedId)
        .map((region) => ({
          type: "Feature",
          id: region.id,
          properties: {
            id: region.id,
            palette_index: region.palette_index,
            // Panning across a border is easy to miss when every label is
            // just a valley name.
            label: region.country
              ? `${region.country} · ${region.name}`
              : region.name,
          },
          geometry: region.geometry as GeoJSON.Geometry,
        })),
    }),
    [outlines, selectedId],
  );

  return (
    <Source id="region-browse" type="geojson" data={data}>
      <Layer
        id="region-browse-fill"
        type="fill"
        paint={{
          "fill-color": PALETTE_COLOR,
          "fill-opacity": 0.05,
        }}
      />
      <Layer
        id="region-browse-line"
        type="line"
        paint={{
          "line-color": PALETTE_COLOR,
          "line-width": 2,
          "line-opacity": 1,
          // Dashed like the area circle: a boundary is search chrome, and a
          // solid blue line reads as one more river.
          "line-dasharray": [4, 3],
        }}
      />
      <Layer
        id="region-browse-label"
        type="symbol"
        layout={{
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-font": ["Noto Sans Regular"],
          "text-padding": 8,
        }}
        paint={{
          "text-color": tokens.white,
          "text-halo-color": tokens.mapLabelHalo,
          "text-halo-width": 2,
        }}
      />
    </Source>
  );
}
