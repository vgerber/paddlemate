import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { circleGeoJSON } from "@/lib/geo";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** A place and how far it reaches, drawn as a named dot inside its ring. */
export interface RangeRing {
  id: string;
  lat: number;
  lon: number;
  /** Zero draws the dot alone - a place that reaches nothing has no ring. */
  radiusKm: number;
  label: string;
  /** Its own colour, so overlapping rings stay attributable to a place. */
  color: string;
  /** Its position in the list below, printed in the marker: colour alone
   * cannot be read out loud or matched by a colourblind reader. */
  number: number;
  /** Somebody's suggestion rather than a base. Drawn hollow, the way the
   * timeline draws a day that has not happened. */
  proposed?: boolean;
}

/**
 * Named places with the ground they cover. The ring is dashed because it is
 * a reach, not a boundary: nothing stops at it, it just says how far the
 * farthest thing on the list is.
 */
export default function RangeRingLayers({ rings }: { rings: RangeRing[] }) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: rings
      .filter((r) => r.radiusKm > 0)
      // The colour rides on the feature so one layer draws every ring: two
      // overlapping rings in one colour say nothing about whose reach is whose.
      .flatMap((r) =>
        circleGeoJSON(r.lat, r.lon, r.radiusKm).features.map((f) => ({
          ...f,
          properties: { color: r.color },
        })),
      ),
  };

  const centres: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: rings.map((r) => ({
      type: "Feature",
      properties: { label: r.label },
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    })),
  };

  return (
    <>
      <Source id="range-rings" type="geojson" data={data}>
        <Layer
          id="range-rings-fill"
          type="fill"
          paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.07 }}
        />
        <Layer
          id="range-rings-line"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-dasharray": [3, 3],
          }}
        />
      </Source>

      {/* Names go through a symbol layer rather than HTML markers so maplibre
          collides them: two bases a kilometre apart would otherwise print
          their names on top of each other. */}
      <Source id="range-ring-centres" type="geojson" data={centres}>
        <Layer
          id="range-ring-labels"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": ["Noto Sans Regular"],
            // Two bases a kilometre apart still both get named: maplibre
            // tries each anchor in turn and only drops a label when none of
            // them is free.
            "text-variable-anchor": ["top", "bottom", "left", "right"],
            "text-radial-offset": 0.9,
            "text-justify": "auto",
            "text-padding": 4,
          }}
          paint={{
            "text-color": tokens.white,
            "text-halo-color": tokens.mapLabelHalo,
            "text-halo-width": 2,
          }}
        />
      </Source>

      {rings.map((ring) => (
        <Marker
          key={ring.id}
          latitude={ring.lat}
          longitude={ring.lon}
          anchor="center"
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: ring.proposed ? "transparent" : ring.color,
              color: ring.proposed ? ring.color : tokens.white,
              border: ring.proposed
                ? `2px dashed ${ring.color}`
                : "2px solid white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.label,
              fontSize: 12,
              fontWeight: 700,
              boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
              pointerEvents: "none",
            }}
          >
            {ring.proposed ? "?" : ring.number}
          </div>
        </Marker>
      ))}
    </>
  );
}
