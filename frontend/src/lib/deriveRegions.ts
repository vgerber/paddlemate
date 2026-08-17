import {
  type Coordinate,
  type OverpassElement,
  runOverpass,
} from "./riverSnap";

/** OSM valleys are lines, never polygons, so containment queries can't find
 * them - proximity is the only way to get names like "Ötztal" or "Engadin". */
const VALLEY_RADIUS_M = 2000;

/** Region names found around one sample point, by kind. */
export interface PointRegions {
  valleys: string[];
  districts: string[];
  states: string[];
  ranges: string[];
}

function regionQuery(lat: number, lon: number): string {
  return `[out:json][timeout:25];
is_in(${lat},${lon})->.a;
(
  area.a[boundary=administrative][admin_level~"^(4|6)$"];
  area.a[place=region]["region:type"="mountain_area"];
);
out tags;
(
  way(around:${VALLEY_RADIUS_M},${lat},${lon})[natural=valley][name];
  relation(around:${VALLEY_RADIUS_M},${lat},${lon})[natural=valley][name];
);
out tags;`;
}

export function classifyElements(elements: OverpassElement[]): PointRegions {
  const out: PointRegions = {
    valleys: [],
    districts: [],
    states: [],
    ranges: [],
  };
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name) continue;
    if (el.type === "area") {
      const level = el.tags?.admin_level;
      if (level === "6") out.districts.push(name);
      else if (level === "4") out.states.push(name);
      else out.ranges.push(name);
    } else if (el.tags?.natural === "valley") {
      out.valleys.push(name);
    }
  }
  return out;
}

/** Sample up to three points (start, middle, end) of the section line. */
export function samplePoints(coords: Coordinate[]): Coordinate[] {
  const points: Coordinate[] = [];
  for (const idx of [0, Math.floor(coords.length / 2), coords.length - 1]) {
    const p = coords[idx];
    if (p && !points.some(([lon, lat]) => lon === p[0] && lat === p[1])) {
      points.push(p);
    }
  }
  return points;
}

/** Merge per-point results into one ordered list: the valley names the most
 * sample points agree on (side valleys near one endpoint drop out), then
 * districts, states and mountain ranges, deduplicated in first-seen order. */
export function mergeRegions(samples: PointRegions[]): string[] {
  const votes = new Map<string, number>();
  for (const s of samples) {
    for (const v of s.valleys) votes.set(v, (votes.get(v) ?? 0) + 1);
  }
  const maxVotes = Math.max(0, ...votes.values());
  const regions = [...votes.entries()]
    .filter(([, n]) => n === maxVotes)
    .map(([name]) => name);

  for (const kind of ["districts", "states", "ranges"] as const) {
    for (const s of samples) {
      for (const name of s[kind]) {
        if (!regions.includes(name)) regions.push(name);
      }
    }
  }
  return regions;
}

/** Derive region names (valley, district, state, range - most specific
 * first) for a section line from OSM. Uses the shared throttled Overpass
 * queue; failures on individual points are skipped rather than fatal. */
export async function deriveRegions(
  coords: Coordinate[],
  signal?: AbortSignal,
): Promise<string[]> {
  const samples: PointRegions[] = [];
  for (const [lon, lat] of samplePoints(coords)) {
    try {
      const elements = await runOverpass(regionQuery(lat, lon), signal);
      samples.push(classifyElements(elements));
    } catch (error) {
      if (signal?.aborted) throw error;
      // One failed sample point still leaves the others usable.
    }
  }
  return mergeRegions(samples);
}
