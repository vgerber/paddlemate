import { type AreaCircle, DEFAULT_RADIUS_KM, type ViewBounds } from "@/lib/geo";

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
