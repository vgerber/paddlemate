import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** Country borders, drawn over every other region so you always know which
 * country you are looking at. Dash-dot over a white casing, so it is never
 * mistaken for the solid line of a region you can pick. */
export default function CountryBorderLayer({
  borders,
}: {
  borders: GeoJSON.FeatureCollection;
}) {
  return (
    <Source id="country-borders" type="geojson" data={borders}>
      <Layer
        id="country-border-casing"
        type="line"
        paint={{
          "line-color": tokens.surfaceLowest,
          "line-width": 4,
          "line-opacity": 0.9,
        }}
      />
      <Layer
        id="country-border-line"
        type="line"
        paint={{
          "line-color": tokens.mapCountryBorder,
          "line-width": 1.5,
          "line-dasharray": [4, 2, 1, 2],
          "line-opacity": 0.85,
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
        paint={{
          "text-color": tokens.onSurfaceVariant,
          "text-halo-color": tokens.mapLabelHalo,
          "text-halo-width": 2,
        }}
      />
    </Source>
  );
}
