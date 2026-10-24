import { Layer, Source } from "react-map-gl/maplibre";
import { useTokens } from "@/lib/useTokens";

/** Country borders, drawn over every other region so you always know which
 * country you are looking at: one solid line on a white casing. */
export default function CountryBorderLayer({
  borders,
}: {
  borders: GeoJSON.FeatureCollection;
}) {
  const tokens = useTokens();
  const labelPaint = {
    "text-color": tokens.onSurfaceVariant,
    "text-halo-color": tokens.mapLabelHalo,
    "text-halo-width": 2,
  };
  return (
    <Source id="country-borders" type="geojson" data={borders}>
      <Layer
        id="country-border-casing"
        type="line"
        paint={{
          "line-color": tokens.mapCountryBorderCasing,
          "line-width": 4,
        }}
      />
      <Layer
        id="country-border-line"
        type="line"
        paint={{
          "line-color": tokens.mapCountryBorder,
          "line-width": 1.4,
        }}
      />
      <Layer
        id="country-border-label"
        type="symbol"
        layout={{
          "symbol-placement": "line",
          "symbol-spacing": 500,
          "text-field": ["get", "country"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, -0.9],
        }}
        paint={labelPaint}
      />
      <Layer
        id="country-border-neighbour-label"
        type="symbol"
        filter={["!=", ["get", "neighbour"], ""]}
        layout={{
          "symbol-placement": "line",
          "symbol-spacing": 500,
          "text-field": ["get", "neighbour"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, 0.9],
        }}
        paint={labelPaint}
      />
    </Source>
  );
}
