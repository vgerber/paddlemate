import type { GaugeMapState } from "@/lib/api";
import type { MapGroup } from "./groupByProximity";

export interface ClusterInfo {
  id: number;
  lng: number;
  lat: number;
  total: number;
  counts: Record<GaugeMapState, number>;
}

/** The slice of a MapLibre cluster feature that is read. */
export interface ClusterFeature {
  properties: Record<string, number> | null;
  geometry: { coordinates: number[] };
}

/** One entry per cluster id (a cluster can come back once per tile), sorted by
 * id, with the per-state tallies from `clusterProperties`. */
export function clustersOf(feats: ClusterFeature[]): ClusterInfo[] {
  const seen = new Set<number>();
  const next: ClusterInfo[] = [];
  for (const f of feats) {
    const p = f.properties;
    if (!p || seen.has(p.cluster_id)) continue;
    seen.add(p.cluster_id);
    const [lng, lat] = f.geometry.coordinates;
    next.push({
      id: p.cluster_id,
      lng,
      lat,
      total: p.point_count,
      counts: {
        used: p.used ?? 0,
        fetched: p.fetched ?? 0,
        available: p.available ?? 0,
      },
    });
  }
  return next.sort((a, b) => a.id - b.id);
}

/** Changes whenever a cluster's id, size or mix does. */
export function clusterSignature(clusters: ClusterInfo[]): string {
  return clusters
    .map(
      (c) =>
        `${c.id}:${c.total}:${c.counts.used}.${c.counts.fetched}.${c.counts.available}`,
    )
    .join("|");
}

/** How many merged locations are in each state. */
export function countByState(
  groups: MapGroup[],
): Record<GaugeMapState, number> {
  const c: Record<GaugeMapState, number> = {
    used: 0,
    fetched: 0,
    available: 0,
  };
  for (const g of groups) c[g.state] += 1;
  return c;
}

/** A copy of the set with the state added when absent, removed when present. */
export function toggled(
  hidden: Set<GaugeMapState>,
  state: GaugeMapState,
): Set<GaugeMapState> {
  const next = new Set(hidden);
  if (next.has(state)) next.delete(state);
  else next.add(state);
  return next;
}
