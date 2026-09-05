import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** Country borders, drawn over every other region so you always know which
 * country you are looking at. Solid, where the regions on offer are dashed:
 * a border is a fact about the world, not something you can pick. */
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
          "line-color": tokens.mapCountryBorderCasing,
          "line-width": 4,
          "line-opacity": 0.8,
        }}
      />
      <Layer
        id="country-border-line"
        type="line"
        paint={{
          "line-color": tokens.mapCountryBorder,
          "line-width": 1.5,
          "line-opacity": 0.85,
        }}
      />
    </Source>
  );
}
