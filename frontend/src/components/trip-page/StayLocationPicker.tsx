import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { factLabelSx } from "@/components/Fact";
import WaterwayMap from "@/components/map/LazyMap";
import { boundsOf, lineCoords, pointCoords } from "@/lib/geo";
import { useTripCandidates, useTripStays } from "@/lib/hooks/useTrips";
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
  const { data: candidates } = useTripCandidates(tripId);

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

  // Open on the point if there is one, else on the trip's other bases, else
  // on the water it watches.
  const focusedPoint = useMemo<[number, number] | null>(
    () => (point ? [point.lon, point.lat] : null),
    [point],
  );
  const focusBounds = useMemo(() => {
    if (point) return null;
    const bases = [...(stays ?? []), ...(candidates ?? [])].flatMap((b) => {
      const at = b.location ? pointCoords(b.location) : null;
      return at ? [at] : [];
    });
    if (bases.length > 0) return boundsOf(bases);
    return boundsOf(sections.flatMap((s) => lineCoords(s.location) ?? []));
  }, [point, stays, candidates, sections]);

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
            onMapClick: ([lon, lat]) => onChange({ lat, lon }),
            featureVertices: point ? [[point.lon, point.lat]] : [],
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
                fontFamily: fonts.body,
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
