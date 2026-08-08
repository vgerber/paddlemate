import { Marker } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** Numbered circular marker with the white ring and drop shadow that keep
 * it legible over map tiles (put-in "1", take-out "2", draft vertices). */
export default function MapNumberMarker({
  lat,
  lon,
  num,
}: {
  lat: number;
  lon: number;
  num: number;
}) {
  return (
    <Marker latitude={lat} longitude={lon} anchor="center">
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: tokens.tertiary,
          color: tokens.onTertiary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          border: "2px solid white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
          pointerEvents: "none",
        }}
      >
        {num}
      </div>
    </Marker>
  );
}
