import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { transition } from "@/lib/motion";
import { theme } from "@/lib/theme";
import type { MapPadding } from "./Map";

const { tokens } = theme;

/** MapLibre's own margin from the corner, when no inset replaces it. */
const CTRL_MARGIN = 10;

/** Two 44px keys of the zoom group above it, plus the gap. */
export const BELOW_ZOOM = 2 * tokens.touch.min + 8;

/** One 44px key plus the gap. */
export const BELOW_KEY = tokens.touch.min + 8;

/** Where a key under the zoom group sits, from the map's top-right corner. */
export function stackOffset(inset?: MapPadding) {
  return {
    top: inset ? inset.top : CTRL_MARGIN,
    right: inset ? inset.right : CTRL_MARGIN,
  };
}

/** Below this the map counts as facing north and the key stays away. */
const NORTH_EPSILON = 0.5;

/** The compass key: an arrow that points north and turns with the map. It
 * fades in under the layers key once the map is rotated or pitched, so zoom
 * and layers never move; pressing it puts north back on top. */
export default function MapCompass({ inset }: { inset?: MapPadding }) {
  const { current: map } = useMap();
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      setBearing(map.getBearing());
      setPitch(map.getPitch());
    };
    sync();
    map.on("rotate", sync);
    map.on("pitch", sync);
    return () => {
      map.off("rotate", sync);
      map.off("pitch", sync);
    };
  }, [map]);

  const shown = Math.abs(bearing) > NORTH_EPSILON || pitch > NORTH_EPSILON;

  return (
    <button
      type="button"
      aria-label="Reset bearing to north"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      onClick={() => map?.resetNorthPitch()}
      style={{
        position: "absolute",
        top: stackOffset(inset).top + BELOW_ZOOM + BELOW_KEY,
        right: stackOffset(inset).right,
        zIndex: 2,
        width: tokens.touch.min,
        height: tokens.touch.min,
        padding: 0,
        border: "none",
        borderRadius: tokens.radii.sm,
        background: tokens.surface,
        boxShadow: tokens.elevation.e2,
        cursor: "pointer",
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? "auto" : "none",
        transition: transition(["opacity"]),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <path
          d="M12 3v18M12 3l-5 5M12 3l5 5"
          fill="none"
          stroke={tokens.onSurface}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
