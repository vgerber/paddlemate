import { useLayoutEffect, useRef } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import {
  css,
  durations,
  REDUCED_FADE_MS,
  useReducedMotion,
} from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const SIZE = 36;

export interface RingTarget {
  lon: number;
  lat: number;
}

/** One ring around the selected point target (a feature or a gauge). It is a
 * single element: when the target changes it travels from the old marker to
 * the new one as a transform, and it only grows in when it first appears.
 * Reduced motion jumps, and the first appearance cross-fades. */
export default function TargetRing({ target }: { target: RingTarget | null }) {
  const { current: map } = useMap();
  const reduced = useReducedMotion();
  const ring = useRef<HTMLDivElement>(null);
  const last = useRef<RingTarget | null>(null);

  const lon = target?.lon;
  const lat = target?.lat;
  useLayoutEffect(() => {
    const el = ring.current;
    const before = last.current;
    if (lon == null || lat == null) {
      last.current = null;
      return;
    }
    if (!el) return;
    last.current = { lon, lat };
    if (before && before.lon === lon && before.lat === lat) return;
    if (!before) {
      el.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "scale(0.6)" },
              { opacity: 1, transform: "scale(1)" },
            ],
        {
          duration: reduced ? REDUCED_FADE_MS : durations.base,
          easing: css.easeOut,
        },
      );
      return;
    }
    if (reduced || !map) return;
    const from = map.project([before.lon, before.lat]);
    const to = map.project([lon, lat]);
    el.animate(
      [
        { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: durations.base, easing: css.easeInOut },
    );
  }, [lon, lat, map, reduced]);

  if (!target) return null;
  return (
    <Marker
      longitude={target.lon}
      latitude={target.lat}
      anchor="center"
      style={{ pointerEvents: "none", zIndex: 1 }}
    >
      <div
        ref={ring}
        data-testid="target-ring"
        style={{
          width: SIZE,
          height: SIZE,
          boxSizing: "border-box",
          borderRadius: "50%",
          border: `2px solid ${tokens.primary}`,
          pointerEvents: "none",
        }}
      />
    </Marker>
  );
}
