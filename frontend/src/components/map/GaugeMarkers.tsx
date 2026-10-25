import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { Popup } from "react-map-gl/maplibre";
import LevelFill from "@/components/LevelFill";
import type { components } from "@/lib/api/schema";
import { transition } from "@/lib/motion";
import { isStale } from "@/lib/staleness";
import { labelSx, theme } from "@/lib/theme";
import { useNow } from "@/lib/useNow";
import { useOnline } from "@/lib/useOnline";
import { levelMarkerColor } from "@/lib/waterLevel";
import AccessibleMarker from "./AccessibleMarker";

const { tokens } = theme;

/** How often a pin re-checks whether its reading has gone stale. */
const STALE_CHECK_MS = 60_000;

type WaterLevel = components["schemas"]["WaterLevel"];

export interface GaugePin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  /** Null for catalog-only stations without readings (neutral color). */
  level: WaterLevel | null;
  /** Newest reading time and its station's fetch interval: with them the pin
   * can tell a silent gauge from a live one. */
  measuredAt?: string | null;
  fetchIntervalSecs?: number;
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
  const online = useOnline();
  const now = useNow(STALE_CHECK_MS);

  return (
    <>
      {pins.map((pin) => {
        const isSelected = selectedId === pin.id;
        const emphasized = isSelected || pin.highlighted;
        const color = pin.level
          ? levelMarkerColor(pin.level)
          : pin.highlighted
            ? theme.tokens.primary
            : theme.tokens.outline;
        // A reading that is old, or no network to trust it over, is shown as
        // a ring: the level is not current.
        const hollow =
          pin.level != null &&
          (!online ||
            (pin.fetchIntervalSecs != null &&
              isStale(pin.measuredAt, now, pin.fetchIntervalSecs)));
        return (
          <AccessibleMarker
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: theme.tokens.touch.min,
                height: theme.tokens.touch.min,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <LevelFill
                color={hollow ? theme.tokens.background : color}
                level={`${pin.level ?? "none"}${hollow ? "-hollow" : ""}`}
                data-level={pin.level ?? "none"}
                data-hollow={hollow ? "true" : "false"}
                style={{
                  width: emphasized ? 18 : 14,
                  height: emphasized ? 18 : 14,
                  borderRadius: "50%",
                  boxSizing: "content-box",
                  border: hollow
                    ? `3px solid ${color}`
                    : isSelected
                      ? `3px solid ${theme.tokens.white}`
                      : `2px solid ${theme.tokens.background}`,
                  boxShadow: isSelected
                    ? tokens.elevation.markerRaised
                    : tokens.elevation.marker,
                  transition: transition(["width", "height"], {
                    duration: "instant",
                  }),
                }}
              />
            </button>
          </AccessibleMarker>
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
                color="textSecondary"
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
