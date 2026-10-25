import type { LngLatBoundsLike, LngLatLike } from "maplibre-gl";
import type { MapRef } from "react-map-gl/maplibre";
import {
  cameraMs,
  cubicBezier,
  durations,
  prefersReducedMotion,
} from "@/lib/motion";
import { theme } from "@/lib/theme";

const { motion } = theme.tokens;

/** One zoom level counts as this many screens of travel. */
export const SCREENS_PER_ZOOM = 0.5;

export const cameraEasing = cubicBezier(motion.easeOut);

/** Distance of a camera move in screens: the pan as a fraction of the
 * viewport (the larger axis) plus the zoom change at SCREENS_PER_ZOOM. */
export function cameraScreens(move: {
  panX: number;
  panY: number;
  width: number;
  height: number;
  zoomDelta: number;
}): number {
  const w = Math.max(move.width, 1);
  const h = Math.max(move.height, 1);
  const pan = Math.max(Math.abs(move.panX) / w, Math.abs(move.panY) / h);
  return pan + Math.abs(move.zoomDelta) * SCREENS_PER_ZOOM;
}

/** Screens between the camera now and a target centre and zoom. */
export function screensTo(
  map: MapRef,
  center: LngLatLike,
  zoom: number,
): number {
  const el = map.getContainer();
  const now = map.project(map.getCenter());
  const to = map.project(center);
  return cameraScreens({
    panX: to.x - now.x,
    panY: to.y - now.y,
    width: el.clientWidth,
    height: el.clientHeight,
    zoomDelta: zoom - map.getZoom(),
  });
}

/** Camera time for a fixed-length move (areas, regions, fits): base, or slow
 * for a far one; 0 under reduced motion. */
export function fitMs(far = false): number {
  if (prefersReducedMotion()) return 0;
  return far ? durations.slow : durations.base;
}

/** Fit bounds with the camera time chosen by distance: 260 ms near, 360 ms up
 * to 1.5 screens, a jump beyond. */
export function fitSelection(
  map: MapRef,
  bounds: LngLatBoundsLike,
  options: { padding: number | MapPadding; maxZoom?: number },
) {
  const cam = map.cameraForBounds(bounds, options);
  const duration = cam?.center
    ? cameraMs(screensTo(map, cam.center, cam.zoom ?? map.getZoom()))
    : fitMs();
  map.fitBounds(bounds, { ...options, duration, easing: cameraEasing });
}

type MapPadding = { top: number; right: number; bottom: number; left: number };
