import type { AreaCircle } from "@/lib/geo";

/** The radius the slider starts at. */
export const DEFAULT_RADIUS_KM = 10;

export interface ViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

type Bounds = [[number, number], [number, number]];

/** Where the search circle first lands: the middle of the part of the map
 * left uncovered. `coveredBottom` is the share of the view's height a sheet
 * hides along the foot. */
export function defaultAreaCircle(
  view: ViewBounds,
  radiusKm: number = DEFAULT_RADIUS_KM,
  coveredBottom = 0,
): AreaCircle {
  const visible = 1 - Math.min(Math.max(coveredBottom, 0), 0.9);
  return {
    lat: view.north - ((view.north - view.south) * visible) / 2,
    lon: (view.west + view.east) / 2,
    radiusKm,
  };
}

/** The box that frames a circle: [[west, south], [east, north]]. */
export function circleBounds(circle: AreaCircle): Bounds {
  const latDelta = circle.radiusKm / 111;
  const cosLat = Math.cos((circle.lat * Math.PI) / 180);
  const lonDelta = circle.radiusKm / (111 * Math.max(0.01, Math.abs(cosLat)));
  return [
    [circle.lon - lonDelta, circle.lat - latDelta],
    [circle.lon + lonDelta, circle.lat + latDelta],
  ];
}
