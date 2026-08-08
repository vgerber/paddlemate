import type { GaugeMapPoint, GaugeMapState } from "@/lib/api";

/** Feature properties carried into the MapLibre source. MapLibre only keeps
 * scalar property values, so `params` is joined and nullable text coalesced. */
export interface GaugePointProperties {
  provider: string;
  station_id: string;
  name: string;
  river: string;
  state: GaugeMapState;
  params: string;
}

export type GaugeFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: GaugePointProperties;
  }>;
};

/** Turn the coverage-map points into a GeoJSON FeatureCollection the clustered
 * source consumes. Points with a non-finite lat/lon are dropped defensively -
 * the API only returns points with coordinates, but a bad row must not break
 * the whole layer. */
export function toFeatureCollection(
  points: GaugeMapPoint[],
): GaugeFeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          provider: p.provider,
          station_id: p.station_id,
          name: p.name ?? "",
          river: p.river ?? "",
          state: p.state,
          params: (p.params ?? []).join(", "),
        },
      })),
  };
}
