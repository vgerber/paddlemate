import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { factLabelSx } from "@/components/Fact";
import WaterwayMap from "@/components/map/LazyMap";
import { useIsSwipeGhost } from "@/components/SwipeGhost";
import { theme } from "@/lib/theme";
import { rangeBounds } from "@/lib/tripRange";
import { useBasesScene } from "./useBasesScene";

/**
 * Every placed base at once, each named and ringed by how far it reaches -
 * the radius is the section on its watch list it sits farthest from, so the
 * ring covers the lot. Read together the rings answer the question the list
 * cannot: which base actually reaches which water, and where they overlap.
 * Phones draw it inline; from `md` the canvas draws the same scene.
 */
export default function BasesMap({
  tripId,
  isMember,
}: {
  tripId: number;
  /** Candidates are visible to members only. */
  isMember: boolean;
}) {
  const { ranges, rings, watched, isEmpty } = useBasesScene(tripId, isMember);
  const ghost = useIsSwipeGhost();
  const focusBounds = useMemo(() => rangeBounds(ranges), [ranges]);

  // Nothing placed yet is the normal state early on, and an empty map says
  // less than the list below it.
  if (isEmpty) return null;

  const furthest = ranges.reduce<(typeof ranges)[number] | null>(
    (a, b) => (a && a.radiusKm > b.radiusKm ? a : b),
    null,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, pb: 2 }}>
      <Box
        sx={{
          // Short on a phone, so the bases below it stay in view.
          height: { xs: "min(200px, 40vh)", md: 400 },
          borderRadius: `${theme.tokens.radii.md}px`,
          boxShadow: theme.tokens.elevation.e1,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* A map never mounts in a swipe preview. */}
        {ghost ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: theme.tokens.surfaceLow,
            }}
          />
        ) : (
          <WaterwayMap
            sections={watched}
            rings={rings}
            camera={{ focusBounds }}
            // The tab scrolls past the map, so zoom needs Ctrl/two fingers.
            chrome={{ cooperativeGestures: true }}
          />
        )}
      </Box>
      <Typography
        sx={{
          ...factLabelSx,
          fontSize: "0.8125rem",
          fontWeight: 400,
          px: { xs: `${theme.tokens.phone.inner}px`, md: 0 },
        }}
      >
        {furthest && furthest.radiusKm > 0
          ? `Rings reach the farthest section on each base's list - ${furthest.radiusKm.toFixed(1)} km from ${furthest.name}`
          : "No sections on any watch list yet"}
      </Typography>
    </Box>
  );
}
