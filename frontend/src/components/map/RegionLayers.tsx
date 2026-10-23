import type { ExpressionSpecification } from "maplibre-gl";
import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

import { REGION_FILL_LAYER } from "./layerIds";

const { tokens } = theme;

const IS_VALLEY: ExpressionSpecification = ["==", ["get", "kind"], "valley"];

/** The regions of the browse layer: the ones on offer, and the one already
 * picked.
 *
 * Every boundary is one thin solid line in one ink, so an edge two regions
 * share reads once and no region has a colour of its own. The fill is faint
 * and neutral: it only has to catch the click. Valleys are outlined like
 * the rest, a touch deeper in fill because they are narrow. The one teal on
 * the map is the picked region; the region under the pointer, or lit by a
 * first tap, is dark ink.
 *
 * The picked region has a source of its own so a pan that takes it out of
 * the viewport does not take it off the map.
 */
export default function RegionLayers({
  choices,
  labels,
  lit,
  picked,
  dimmed = false,
}: {
  choices: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
  /** The region whose row in the choice card has focus. */
  lit: GeoJSON.FeatureCollection;
  picked: GeoJSON.FeatureCollection;
  /** A region is picked: the others fall back. */
  dimmed?: boolean;
}) {
  return (
    <>
      <Source id="region-browse" type="geojson" data={choices}>
        <Layer
          id={REGION_FILL_LAYER}
          type="fill"
          paint={{
            "fill-color": tokens.onSurfaceVariant,
            "fill-opacity": ["case", IS_VALLEY, 0.05, 0.04],
          }}
        />
        <Layer
          id="region-browse-line"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{
            "line-color": tokens.onSurfaceVariant,
            "line-width": 1,
            "line-opacity": dimmed ? 0.3 : 1,
          }}
        />
      </Source>

      <Source id="region-lit" type="geojson" data={lit}>
        <Layer
          id="region-lit-fill"
          type="fill"
          paint={{
            "fill-color": tokens.onSurfaceVariant,
            "fill-opacity": 0.1,
          }}
        />
        <Layer
          id="region-lit-line"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{ "line-color": tokens.onSurface, "line-width": 2 }}
        />
      </Source>

      <Source id="region-picked" type="geojson" data={picked}>
        <Layer
          id="region-picked-fill"
          type="fill"
          paint={{
            "fill-color": tokens.mapSelectedLine,
            "fill-opacity": 0.12,
            "fill-opacity-transition": {
              duration: tokens.motion.fast,
              delay: 0,
            },
          }}
        />
        <Layer
          id="region-picked-line"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{
            "line-color": tokens.mapSelectedLine,
            "line-width": 2.5,
            "line-opacity-transition": {
              duration: tokens.motion.fast,
              delay: 0,
            },
          }}
        />
      </Source>

      <Source id="region-labels" type="geojson" data={labels}>
        {/* Quiet on purpose: small and in the secondary ink, except the
            picked region, which is bold teal. The style serves Regular, Bold
            and Italic only. */}
        <Layer
          id="region-label"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": ["case", ["get", "picked"], 14, 12],
            "text-font": [
              "case",
              ["get", "picked"],
              ["literal", ["Noto Sans Bold"]],
              ["literal", ["Noto Sans Regular"]],
            ],
            "text-padding": 8,
            "text-max-width": 8,
          }}
          paint={{
            "text-color": [
              "case",
              ["get", "picked"],
              tokens.mapSelectedLine,
              tokens.onSurfaceVariant,
            ],
            "text-opacity": dimmed ? ["case", ["get", "picked"], 1, 0.55] : 1,
            "text-halo-color": tokens.mapLabelHalo,
            "text-halo-width": 2,
          }}
        />
      </Source>
    </>
  );
}
