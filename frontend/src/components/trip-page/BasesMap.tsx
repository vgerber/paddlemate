import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { factLabelSx } from "@/components/Fact";
import type { RangeRing } from "@/components/map/Map";
import WaterwayMap from "@/components/map/Map";
import type { TripStay, TripStayCandidate } from "@/lib/api";
import { pointCoords } from "@/lib/geo";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";
import { theme } from "@/lib/theme";
import {
  baseColors,
  baseNumbers,
  baseRanges,
  rangeBounds,
} from "@/lib/tripRange";

/**
 * Every placed base at once, each named and ringed by how far it reaches -
 * the radius is the section on its watch list it sits farthest from, so the
 * ring covers the lot. Read together the rings answer the question the list
 * cannot: which base actually reaches which water, and where they overlap.
 */
export default function BasesMap({
  stays,
  candidates = [],
}: {
  stays: TripStay[];
  /** Drawn hollow beside the real bases, so an argument in progress shows on
   * the same map that settles it. */
  candidates?: TripStayCandidate[];
}) {
  const ranges = useMemo(() => baseRanges(stays), [stays]);
  const colors = useMemo(() => baseColors(stays), [stays]);
  const numbers = useMemo(() => baseNumbers(stays), [stays]);

  const waterwayIds = useMemo(
    () => [
      ...new Set(
        stays
          .flatMap((s) => s.sections)
          .map((s) => s.waterway_id)
          .filter((id): id is number => id != null),
      ),
    ],
    [stays],
  );
  const { sections: allSections } = useWaterwaySections(
    waterwayIds,
    waterwayIds.length > 0,
  );

  // Fetching a waterway brings all of its sections; the map is about the ones
  // the trip watches, and drawing the rest would frame the wrong ground.
  const watched = useMemo(() => {
    const ids = new Set(
      stays.flatMap((s) => s.sections.map((x) => x.section_id)),
    );
    return allSections.filter((s) => ids.has(s.id));
  }, [allSections, stays]);

  const rings = useMemo<RangeRing[]>(
    () =>
      ranges.map((r) => ({
        id: String(r.stayId),
        lat: r.lat,
        lon: r.lon,
        radiusKm: r.radiusKm,
        label: r.name,
        color: colors[r.stayId],
        number: numbers[r.stayId],
      })),
    [ranges, colors, numbers],
  );

  const proposed = useMemo<RangeRing[]>(
    () =>
      candidates.flatMap((c) => {
        const point = pointCoords(c.location);
        if (!point) return [];
        return [
          {
            id: `candidate-${c.id}`,
            lat: point[1],
            lon: point[0],
            // A candidate has no watch list of its own, so there is no reach
            // to draw - only where somebody is pointing.
            radiusKm: 0,
            label: c.name,
            color: theme.tokens.onSurfaceVariant,
            number: 0,
            proposed: true,
          },
        ];
      }),
    [candidates],
  );

  const focusBounds = useMemo(() => rangeBounds(ranges), [ranges]);

  // Nothing placed yet is the normal state early on, and an empty map says
  // less than the list below it.
  if (ranges.length === 0 && proposed.length === 0) return null;

  const furthest = ranges.reduce((a, b) => (a.radiusKm > b.radiusKm ? a : b));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, pb: 2 }}>
      <Box
        sx={{
          height: { xs: 300, md: 400 },
          border: "1px solid",
          borderColor: "divider",
          position: "relative",
        }}
      >
        <WaterwayMap
          sections={watched}
          rings={[...rings, ...proposed]}
          camera={{ focusBounds }}
          // The tab scrolls past the map, so zoom needs Ctrl/two fingers.
          chrome={{ cooperativeGestures: true }}
        />
      </Box>
      <Typography sx={factLabelSx}>
        {furthest.radiusKm > 0
          ? `Rings reach the farthest section on each base's list - ${furthest.radiusKm.toFixed(1)} km from ${furthest.name}`
          : "No sections on any watch list yet"}
      </Typography>
    </Box>
  );
}
