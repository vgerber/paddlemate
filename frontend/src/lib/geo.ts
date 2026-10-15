/** Haversine distance between two lat/lon points in kilometers. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parse a whitewater difficulty string (I-VI, X) into a numeric grade. */
export function parseDifficulty(diff: string | undefined): number | null {
  if (!diff) return null;
  if (/^X/i.test(diff)) return 10;
  if (/^VI/i.test(diff)) return 6;
  if (/^V/i.test(diff)) return 5;
  if (/^IV/i.test(diff)) return 4;
  if (/^III/i.test(diff)) return 3;
  if (/^II/i.test(diff)) return 2;
  if (/^I/i.test(diff)) return 1;
  return null;
}

/** Generate a GeoJSON polygon approximating a circle (n-sided). */
export function circleGeoJSON(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64,
): GeoJSON.FeatureCollection {
  const R = 6371;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dlat = (radiusKm / R) * (180 / Math.PI) * Math.cos(angle);
    const dlon =
      ((radiusKm / R) * (180 / Math.PI) * Math.sin(angle)) /
      Math.cos((lat * Math.PI) / 180);
    coords.push([lon + dlon, lat + dlat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    ],
  };
}

export interface AreaCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

/** The radius a search circle starts at. */
export const DEFAULT_RADIUS_KM = 10;

/** [longitude, latitude], the GeoJSON axis order. */
export type LngLat = [number, number];

/** The one box type: [[west, south], [east, north]], what the map fits. */
export type Bounds = [LngLat, LngLat];

/** The same box as the API sends a region's: [west, south, east, north]. */
export type Bbox = readonly [number, number, number, number];

/** The same box as the map reports its view. */
export interface ViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** A region's box (the API types it as a plain number list). */
export function bboxToBounds(bbox: readonly number[]): Bounds {
  const [west, south, east, north] = bbox;
  return [
    [west, south],
    [east, north],
  ];
}

/** The box holding every coordinate, or null for none. */
export function boundsOf(
  coords: readonly (readonly number[])[],
): Bounds | null {
  if (coords.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of coords) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** The box holding both boxes; a null box is skipped. */
export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a || !b) return a ?? b;
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}

/** The box that frames a circle (a degree of latitude is about 111 km;
 * longitude degrees shrink with the cosine of the latitude). */
export function circleBounds(circle: AreaCircle): Bounds {
  const latDelta = circle.radiusKm / 111;
  const cosLat = Math.cos((circle.lat * Math.PI) / 180);
  const lonDelta = circle.radiusKm / (111 * Math.max(0.01, Math.abs(cosLat)));
  return [
    [circle.lon - lonDelta, circle.lat - latDelta],
    [circle.lon + lonDelta, circle.lat + latDelta],
  ];
}

interface AnyGeometry {
  type: string;
  coordinates: unknown;
}

/** Coordinates of a LineString geometry, or null for any other type.
 * Central owner of the geometry narrowing - callers should not cast. */
export function lineCoords(
  geom: AnyGeometry | null | undefined,
): [number, number][] | null {
  if (geom?.type !== "LineString") return null;
  return (geom.coordinates as number[][]).map((c): [number, number] => [
    c[0],
    c[1],
  ]);
}

/** Coordinates of a Point geometry, or null for any other type. */
export function pointCoords(
  geom: AnyGeometry | null | undefined,
): [number, number] | null {
  if (geom?.type !== "Point") return null;
  const c = geom.coordinates as number[];
  return [c[0], c[1]];
}

/** Get a representative [lng, lat] for any GeoJSON geometry. */
export function representativePoint(geom: AnyGeometry): [number, number] {
  if (geom.type === "Point") {
    const c = geom.coordinates as number[];
    return [c[0], c[1]];
  }
  if (geom.type === "LineString") {
    const c = geom.coordinates as number[][];
    const mid = Math.floor(c.length / 2);
    return [c[mid][0], c[mid][1]];
  }
  if (geom.type === "Polygon") {
    const ring = (geom.coordinates as number[][][])[0];
    if (!ring || ring.length === 0) return [0, 0];
    const n = ring.length;
    const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [sum[0] / n, sum[1] / n];
  }
  return [0, 0];
}

/**
 * Dot product of a proposed put-in→take-out direction vs. the estimated
 * river flow (summed start→end direction of the given lines, [lng, lat]
 * order). Negative → the proposed take-out is upstream of the put-in.
 */
export function downstreamDot(
  lines: [number, number][][],
  putIn: { lat: number; lon: number },
  takeOut: { lat: number; lon: number },
): number {
  let dx = 0;
  let dy = 0;
  for (const coords of lines) {
    if (coords.length >= 2) {
      const start = coords[0];
      const end = coords[coords.length - 1];
      dx += end[0] - start[0];
      dy += end[1] - start[1];
    }
  }
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 1;
  const fx = dx / len;
  const fy = dy / len;
  return (takeOut.lon - putIn.lon) * fx + (takeOut.lat - putIn.lat) * fy;
}

/**
 * Arc-length distance in meters from the start of `line` to the
 * nearest point on it from `pt` (both in [lng, lat] order).
 */
export function distanceAlongLineM(
  pt: [number, number],
  line: [number, number][],
): number {
  if (line.length < 2) return 0;
  let bestDistToLine = Number.POSITIVE_INFINITY;
  let bestArc = 0;
  let arcSoFar = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLenM = haversineKm(a[1], a[0], b[1], b[0]) * 1000;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq > 0
        ? Math.max(
            0,
            Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq),
          )
        : 0;
    const distToSegment = Math.hypot(
      a[0] + t * dx - pt[0],
      a[1] + t * dy - pt[1],
    );
    if (distToSegment < bestDistToLine) {
      bestDistToLine = distToSegment;
      bestArc = arcSoFar + t * segLenM;
    }
    arcSoFar += segLenM;
  }
  return bestArc;
}
