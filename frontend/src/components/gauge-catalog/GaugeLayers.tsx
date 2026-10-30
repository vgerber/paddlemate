import { Layer, Source } from "react-map-gl/maplibre";
import { useTokens } from "@/lib/hooks/ui/useTokens";
import { POINT_LAYER, SOURCE_ID } from "./useGaugeCatalogMap";

/** The clustered gauge source with its point and name layers. */
export default function GaugeLayers({
  data,
}: {
  data: GeoJSON.FeatureCollection;
}) {
  const tokens = useTokens();
  return (
    <Source
      id={SOURCE_ID}
      type="geojson"
      data={data}
      cluster
      clusterRadius={42}
      clusterMaxZoom={8}
      clusterProperties={{
        used: ["+", ["case", ["==", ["get", "state"], "used"], 1, 0]],
        fetched: ["+", ["case", ["==", ["get", "state"], "fetched"], 1, 0]],
        available: ["+", ["case", ["==", ["get", "state"], "available"], 1, 0]],
      }}
    >
      {/* Unclustered points, colored by state. Also keeps the source loaded
              so querySourceFeatures can read the clusters for the donuts. */}
      <Layer
        id={POINT_LAYER}
        type="circle"
        filter={["!", ["has", "point_count"]]}
        paint={{
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 12, 6],
          "circle-color": [
            "match",
            ["get", "state"],
            "used",
            tokens.success,
            "fetched",
            tokens.gaugeTracked,
            tokens.gaugeUntracked,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": tokens.surface,
        }}
      />
      {/* Gauge names, once zoomed in. Collision detection hides overlaps
              so dense areas stay legible. */}
      <Layer
        id="gauge-labels"
        type="symbol"
        filter={["!", ["has", "point_count"]]}
        minzoom={9}
        layout={{
          // River as the headline, then "(provider · name)" behind it for
          // context. Falls back to the name, then "provider id", and never
          // repeats a value that is already the headline.
          "text-field": [
            "concat",
            [
              "case",
              ["!=", ["get", "river"], ""],
              ["get", "river"],
              ["!=", ["get", "name"], ""],
              ["get", "name"],
              ["concat", ["get", "provider"], " ", ["get", "station_id"]],
            ],
            [
              "case",
              [
                "all",
                ["!=", ["get", "river"], ""],
                ["!=", ["get", "name"], ""],
              ],
              [
                "concat",
                " (",
                ["get", "provider"],
                " · ",
                ["get", "name"],
                ")",
              ],
              [
                "any",
                ["!=", ["get", "river"], ""],
                ["!=", ["get", "name"], ""],
              ],
              ["concat", " (", ["get", "provider"], ")"],
              "",
            ],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        }}
        paint={{
          "text-color": tokens.mapLabelText,
          "text-halo-color": tokens.mapLabelHalo,
          "text-halo-width": 1.5,
        }}
      />
    </Source>
  );
}
