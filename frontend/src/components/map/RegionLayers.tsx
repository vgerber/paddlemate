import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The regions of the browse layer: the ones on offer, and the one already
 * picked. Both are dashed, because a boundary is search chrome rather than
 * something on the water.
 *
 * The colour rides on the boundary, not in the fill. These regions overlap -
 * a side valley runs into the main one - and two translucent fills on the
 * same ground blend into a third colour belonging to neither, exactly where
 * the eye needs the edge. The fill stays faint, enough to read as a surface
 * and to catch the click.
 *
 * The picked region has a source of its own so a pan that takes it out of
 * the viewport does not take it off the map.
 */
export default function RegionLayers({
  choices,
  picked,
}: {
  choices: GeoJSON.FeatureCollection;
  picked: GeoJSON.FeatureCollection;
}) {
  return (
    <>
      <Source id="region-browse" type="geojson" data={choices}>
        <Layer
          id="region-browse-fill"
          type="fill"
          paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.05 }}
        />
        <Layer
          id="region-browse-line"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": 2,
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

      <Source id="region-picked" type="geojson" data={picked}>
        <Layer
          id="region-picked-fill"
          type="fill"
          paint={{ "fill-color": tokens.mapSelectedLine, "fill-opacity": 0.2 }}
        />
        <Layer
          id="region-picked-line"
          type="line"
          paint={{
            "line-color": tokens.mapSelectedLine,
            "line-width": 3,
            "line-dasharray": [4, 3],
          }}
        />
      </Source>
    </>
  );
}
