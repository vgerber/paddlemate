import type { GaugeMapState } from "@/lib/api";
import type { MapGroup } from "./groupByProximity";

/** Scalar feature properties for the source; members are looked up by `group_id`. */
export interface GroupProperties {
  group_id: string;
  state: GaugeMapState;
  name: string;
  river: string;
  provider: string;
  station_id: string;
  count: number;
}

export type GaugeFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: GroupProperties;
  }>;
};

/** Groups to a GeoJSON FeatureCollection: one feature per location, with `count`. */
export function toFeatureCollection(
  groups: MapGroup[],
): GaugeFeatureCollection {
  return {
    type: "FeatureCollection",
    features: groups.map((g) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [g.lon, g.lat] },
      properties: {
        group_id: g.id,
        state: g.state,
        name: g.name,
        river: g.river,
        provider: g.provider,
        station_id: g.station_id,
        count: g.members.length,
      },
    })),
  };
}
