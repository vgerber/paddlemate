import { Marker } from "react-map-gl/maplibre";
import type { components } from "@/lib/api/schema";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_COLORS: Record<WaterLevel, string> = {
  empty: "#9eaab0",
  low: "#4caf50",
  medium: "#ff9800",
  high: "#f44336",
};

export interface GaugePin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  level: WaterLevel;
}

interface GaugeMarkersProps {
  pins: GaugePin[];
  selectedId?: number | null;
  onClick?: (pin: GaugePin) => void;
}

export default function GaugeMarkers({
  pins,
  selectedId,
  onClick,
}: GaugeMarkersProps) {
  return (
    <>
      {pins.map((pin) => {
        const isSelected = selectedId === pin.id;
        return (
          <Marker
            key={pin.id}
            longitude={pin.lon}
            latitude={pin.lat}
            anchor="center"
          >
            <button
              type="button"
              title={pin.name}
              onClick={() => onClick?.(pin)}
              style={{
                width: isSelected ? 18 : 14,
                height: isSelected ? 18 : 14,
                borderRadius: "50%",
                background: LEVEL_COLORS[pin.level],
                border: isSelected ? "3px solid #fff" : "2px solid #121416",
                boxShadow: isSelected
                  ? "0 0 0 2px #121416, 0 2px 6px rgba(0,0,0,0.6)"
                  : "0 1px 4px rgba(0,0,0,0.5)",
                cursor: "pointer",
                transition: "width 0.1s, height 0.1s",
                padding: 0,
              }}
            />
          </Marker>
        );
      })}
    </>
  );
}
