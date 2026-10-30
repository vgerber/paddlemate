import { useTokens } from "@/lib/hooks/ui/useTokens";
import { withAlpha } from "@/lib/theme/alpha";
import AccessibleMarker from "./AccessibleMarker";
import MarkerHit from "./MarkerHit";
import type { PointPin } from "./mapTypes";

/** Small dot markers (the note composer's draft pin). */
export function PointPins({ pins }: { pins: PointPin[] }) {
  const tokens = useTokens();
  return pins.map((pin) => (
    <AccessibleMarker
      key={pin.id}
      longitude={pin.lon}
      latitude={pin.lat}
      anchor="center"
      style={{ pointerEvents: "none" }}
    >
      <MarkerHit title={pin.title}>
        <div
          style={{
            width: pin.emphasis ? 14 : 10,
            height: pin.emphasis ? 14 : 10,
            borderRadius: "50%",
            background: pin.color,
            border: `2px solid ${tokens.surfaceLowest}`,
            boxShadow: pin.emphasis
              ? `0 0 0 3px ${withAlpha(pin.color, "hairline")}`
              : tokens.elevation.marker,
          }}
        />
      </MarkerHit>
    </AccessibleMarker>
  ));
}

/** The centre dot of the area-search circle. */
export function AreaCentreDot({ lon, lat }: { lon: number; lat: number }) {
  const tokens = useTokens();
  return (
    <AccessibleMarker
      longitude={lon}
      latitude={lat}
      anchor="center"
      style={{ pointerEvents: "none" }}
    >
      <MarkerHit>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: tokens.mapAreaCircle,
            border: `2px solid ${tokens.white}`,
            boxShadow: tokens.elevation.marker,
          }}
        />
      </MarkerHit>
    </AccessibleMarker>
  );
}

/** The halo dot on a point the panel asked the camera to fly to. */
export function FocusedDot({ point }: { point: [number, number] }) {
  const tokens = useTokens();
  return (
    <AccessibleMarker
      longitude={point[0]}
      latitude={point[1]}
      anchor="center"
      style={{ pointerEvents: "none" }}
    >
      <MarkerHit>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: tokens.primary,
            border: `2px solid ${tokens.surface}`,
            boxShadow: `0 0 0 3px ${withAlpha(tokens.primary, "hairline")}, 0 0 10px ${withAlpha(tokens.primary, "border")}`,
          }}
        />
      </MarkerHit>
    </AccessibleMarker>
  );
}
