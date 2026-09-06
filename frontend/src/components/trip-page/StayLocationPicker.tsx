import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { factLabelSx } from "@/components/Fact";
import WaterwayMap from "@/components/map/Map";
import { useTripStays } from "@/lib/hooks/useTrips";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";
import { fonts, theme } from "@/lib/theme";

export interface StayPoint {
  lat: number;
  lon: number;
}

interface Props {
  tripId: number;
  point: StayPoint | null;
  onChange: (point: StayPoint | null) => void;
}

/**
 * Place the base on the map. The rivers the trip is already watching are
 * drawn underneath, because where you camp is chosen relative to them - a
 * pair of coordinate fields cannot show that.
 */
export default function StayLocationPicker({ tripId, point, onChange }: Props) {
  const { data: stays } = useTripStays(tripId);

  const waterwayIds = useMemo(
    () => [
      ...new Set(
        (stays ?? [])
          .flatMap((s) => s.sections)
          .map((s) => s.waterway_id)
          .filter((id): id is number => id != null),
      ),
    ],
    [stays],
  );
  const { sections } = useWaterwaySections(waterwayIds, waterwayIds.length > 0);

  // Open on the point if there is one, else on the water the trip watches.
  const focusedPoint = useMemo<[number, number] | null>(
    () => (point ? [point.lon, point.lat] : null),
    [point],
  );
  const focusBounds = useMemo(() => {
    if (point || sections.length === 0) return null;
    const coords = sections.flatMap((s) =>
      s.location.type === "LineString"
        ? (s.location.coordinates as number[][])
        : [],
    );
    if (coords.length === 0) return null;
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [point, sections]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          height: 300,
          border: "1px solid",
          borderColor: "divider",
          position: "relative",
        }}
      >
        <WaterwayMap
          sections={sections}
          drawing={{
            placingFeature: true,
            onMapClick: (lng, lat) => onChange({ lat, lon: lng }),
            featureVertices: point ? [{ lng: point.lon, lat: point.lat }] : [],
            featureGeomType: "Point",
          }}
          camera={{ focusedPoint, focusBounds }}
          // The dialog scrolls past the map, so zoom needs Ctrl/two fingers.
          chrome={{ cooperativeGestures: true }}
        />
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {point ? (
          <>
            <Typography
              sx={{
                fontFamily: fonts.mono,
                fontSize: "0.75rem",
                color: theme.tokens.outline,
                flex: 1,
              }}
            >
              {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
            </Typography>
            <Button size="small" onClick={() => onChange(null)}>
              Clear
            </Button>
          </>
        ) : (
          <Typography sx={factLabelSx}>
            Tap the map to place the base
          </Typography>
        )}
      </Box>
    </Box>
  );
}
