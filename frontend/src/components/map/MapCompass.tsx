import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";
import type { MapPadding } from "./Map";

const { tokens } = theme;

/** MapLibre's own margin from the corner, when no inset replaces it. */
const CTRL_MARGIN = 10;

/** Two 44px keys of the zoom group above it, plus the gap. */
export const BELOW_ZOOM = 2 * tokens.touch.min + 8;

/** Where a key under the zoom group sits, from the map's top-right corner. */
export function stackOffset(inset?: MapPadding) {
  return {
    top: inset ? inset.top : CTRL_MARGIN,
    right: inset ? inset.right : CTRL_MARGIN,
  };
}

/** The compass key: an arrow that points north and turns with the map.
 * Pressing it puts north back on top. */
export default function MapCompass({ inset }: { inset?: MapPadding }) {
  const { current: map } = useMap();
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;
    const sync = () => setBearing(map.getBearing());
    sync();
    map.on("rotate", sync);
    return () => {
      map.off("rotate", sync);
    };
  }, [map]);

  return (
    <button
      type="button"
      aria-label="Reset bearing to north"
      onClick={() => map?.resetNorthPitch()}
      style={{
        position: "absolute",
        top: stackOffset(inset).top + BELOW_ZOOM,
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
