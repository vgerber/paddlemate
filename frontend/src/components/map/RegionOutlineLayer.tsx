import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { RegionOutline } from "@/lib/api";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The region being searched in. Painted in the selection colour rather than
 * the area-circle blue that RegionBrowseLayer uses for the regions on offer:
 * the two are on screen together in region mode, and the one already picked
 * has to be the one that reads. */
export default function RegionOutlineLayer({
  outline,
}: {
  outline?: RegionOutline | null;
}) {
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: outline
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: outline.geometry as GeoJSON.Geometry,
            },
          ]
        : [],
    }),
    [outline],
  );

  return (
    <Source id="region-outline" type="geojson" data={data}>
      <Layer
        id="region-outline-fill"
        type="fill"
        paint={{ "fill-color": tokens.mapSelectedLine, "fill-opacity": 0.2 }}
      />
      <Layer
        id="region-outline-line"
        type="line"
        paint={{
          "line-color": tokens.mapSelectedLine,
          "line-width": 3,
          "line-opacity": 1,
          // Dashed like the area circle: the boundary is search chrome, not
          // something on the water.
          "line-dasharray": [4, 3],
        }}
      />
    </Source>
  );
}
