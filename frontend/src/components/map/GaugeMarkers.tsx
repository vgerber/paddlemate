import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { Marker, Popup } from "react-map-gl/maplibre";
import type { components } from "@/lib/api/schema";
import { labelSx, theme } from "@/lib/theme";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_COLORS: Record<WaterLevel, string> = {
  empty: theme.tokens.levels.empty.marker,
  low: theme.tokens.levels.low.marker,
  medium: theme.tokens.levels.medium.marker,
  high: theme.tokens.levels.high.marker,
};

export interface GaugePin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  /** Null for catalog-only stations without readings (neutral color). */
  level: WaterLevel | null;
  /** Emphasized pin (e.g. the matched river's own gauges in suggest mode). */
  highlighted?: boolean;
  /** When set, clicking opens an info popup instead of calling onClick. */
  info?: {
    river?: string | null;
    provider: string;
    params: string[];
  };
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
  const [popupPin, setPopupPin] = useState<GaugePin | null>(null);

  return (
    <>
      {pins.map((pin) => {
        const isSelected = selectedId === pin.id;
        const emphasized = isSelected || pin.highlighted;
        const color = pin.level
          ? LEVEL_COLORS[pin.level]
          : pin.highlighted
            ? theme.tokens.primary
            : theme.tokens.outline;
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
              onClick={() =>
                pin.info
                  ? setPopupPin((prev) => (prev?.id === pin.id ? null : pin))
                  : onClick?.(pin)
              }
              style={{
                width: emphasized ? 18 : 14,
                height: emphasized ? 18 : 14,
                borderRadius: "50%",
                background: color,
                border: isSelected
                  ? `3px solid ${theme.tokens.white}`
                  : `2px solid ${theme.tokens.background}`,
                boxShadow: isSelected
                  ? `0 0 0 2px ${theme.tokens.background}, 0 2px 6px rgba(0,0,0,0.6)`
                  : "0 1px 4px rgba(0,0,0,0.5)",
                cursor: "pointer",
                transition: "width 0.1s, height 0.1s",
                padding: 0,
              }}
            />
          </Marker>
        );
      })}

      {popupPin?.info && (
        <Popup
          longitude={popupPin.lon}
          latitude={popupPin.lat}
          anchor="bottom"
          offset={12}
          closeButton={false}
          onClose={() => setPopupPin(null)}
        >
          <Box sx={{ minWidth: 140 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {popupPin.name}
            </Typography>
            {popupPin.info.river && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block" }}
              >
                {popupPin.info.river}
              </Typography>
            )}
            <Typography sx={{ ...labelSx, display: "block", mt: 0.5 }}>
              {popupPin.info.provider}
              {popupPin.info.params.length > 0
                ? ` · ${popupPin.info.params.join(", ")}`
                : ""}
            </Typography>
          </Box>
        </Popup>
      )}
    </>
  );
}
