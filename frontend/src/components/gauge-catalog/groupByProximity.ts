import type { GaugeMapPoint, GaugeMapState } from "@/lib/api";

const STATE_RANK: Record<GaugeMapState, number> = {
  used: 3,
  fetched: 2,
  available: 1,
};

/** Co-located gauge points (one physical station, possibly several providers). */
export interface MapGroup {
  id: string;
  lat: number;
  lon: number;
  /** Strongest member state (used > fetched > available). */
  state: GaugeMapState;
  /** Representative member fields, for the marker label and color. */
  name: string;
  river: string;
  provider: string;
  station_id: string;
  members: GaugeMapPoint[];
}

/** Merge points within ~`meters` (grid-bucketed) into one group; state and
 * label come from the strongest member. */
export function groupByProximity(
  points: GaugeMapPoint[],
  meters = 250,
): MapGroup[] {
  const cell = meters / 111_320; // approx degrees of latitude per `meters`
  const buckets = new Map<string, GaugeMapPoint[]>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const key = `${Math.round(p.lat / cell)}:${Math.round(p.lon / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  const groups: MapGroup[] = [];
  for (const [id, members] of buckets) {
    let rep = members[0];
    let latSum = 0;
    let lonSum = 0;
    for (const m of members) {
      latSum += m.lat;
      lonSum += m.lon;
      const stronger = STATE_RANK[m.state] > STATE_RANK[rep.state];
      const sameButNamed =
        STATE_RANK[m.state] === STATE_RANK[rep.state] && !rep.name && !!m.name;
      if (stronger || sameButNamed) rep = m;
    }
    groups.push({
      id,
      lat: latSum / members.length,
      lon: lonSum / members.length,
      state: rep.state,
      name: rep.name ?? "",
      river: rep.river ?? "",
      provider: rep.provider,
      station_id: rep.station_id,
      members,
    });
  }
  return groups;
}
