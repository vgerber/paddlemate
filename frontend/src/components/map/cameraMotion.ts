import type { LngLatBoundsLike, LngLatLike } from "maplibre-gl";
import type { MapRef } from "react-map-gl/maplibre";
import { cameraMs, durations, prefersReducedMotion } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { motion } = theme.tokens;

/** One zoom level counts as this many screens of travel. */
export const SCREENS_PER_ZOOM = 0.5;

/** Solve a CSS cubic-bezier(x1, y1, x2, y2) string into an easing function
 * for MapLibre, which takes a function rather than a CSS curve. */
export function cubicBezier(css: string): (t: number) => number {
  const m = css.match(/cubic-bezier\(([^)]+)\)/);
  const p = m?.[1].split(",").map(Number);
  if (!p || p.length !== 4 || p.some(Number.isNaN)) return (t) => t;
  const [x1, y1, x2, y2] = p;
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) =>
    3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = at(x1, x2, s) - x;
      if (Math.abs(err) < 1e-6) return at(y1, y2, s);
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 24; i++) {
      const v = at(x1, x2, s);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return at(y1, y2, s);
  };
}

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
