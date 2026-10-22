import { theme } from "@/lib/theme";
import AccessibleMarker from "./AccessibleMarker";
import MarkerHit from "./MarkerHit";

const { tokens } = theme;

/** Numbered circular marker with the white ring and drop shadow that keep
 * it legible over map tiles (put-in "1", take-out "2", draft vertices). */
export default function MapNumberMarker({
  lat,
  lon,
  num,
  color = tokens.primary,
}: {
  lat: number;
  lon: number;
  num: number;
  /** Defaults to the accent; put-in and take-out bring their own hue. */
  color?: string;
}) {
  return (
    <AccessibleMarker
      latitude={lat}
      longitude={lon}
      anchor="center"
      style={{ pointerEvents: "none" }}
    >
      <MarkerHit>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: color,
            color: tokens.onPrimary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            border: `2px solid ${tokens.surface}`,
            boxShadow: tokens.elevation.marker,
            pointerEvents: "none",
          }}
        >
          {num}
        </div>
      </MarkerHit>
    </AccessibleMarker>
  );
}
