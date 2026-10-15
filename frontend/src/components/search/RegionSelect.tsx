import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { regionContext } from "@/components/map/regionGeometry";
import type { Region, RegionKind } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRegionSearch } from "@/lib/hooks/useRegions";
import { REGION_KINDS } from "@/lib/regionKinds";
import { theme } from "@/lib/theme";
import ListGroupHeader from "./ListGroupHeader";
import { flatRowSx } from "./RiverRow";

const { tokens } = theme;

/** Group order: what a paddler names a place by, smallest first. */
const GROUPS: { kind: RegionKind; label: string }[] = [
  ...REGION_KINDS,
  { kind: "country", label: "Countries" },
];

/** True while the region field has text worth listing regions for. */
export function isListingRegions(query: string) {
  return query.trim().length >= 2;
}

/** Under the region field, typed into or not. */
export function RegionHint() {
  return (
    <Typography variant="body2" color="textSecondary" sx={{ px: 0.25 }}>
      Type a valley, district, state or range
    </Typography>
  );
}

interface RegionSuggestionsProps {
  query: string;
  onPick: (region: Region) => void;
}

/** Regions matching the typed text, grouped, as cards. Only regions with an
 * imported outline are offered - the map draws that outline and the search
 * runs against it. */
export default function RegionSuggestions({
  query,
  onPick,
}: RegionSuggestionsProps) {
  const debounced = useDebouncedValue(query);
  const { data: options = [], isFetching } = useRegionSearch(debounced);

  if (!isListingRegions(query)) return null;

  const groups = GROUPS.map((g) => ({
    ...g,
    items: options.filter((o) => o.kind === g.kind),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary" sx={{ px: 0.25 }}>
        {isFetching ? "…" : "No regions found."}
      </Typography>
    );
  }

  return (
    <Box>
      {groups.map((g) => (
        <Box key={g.kind} data-testid="region-group" data-label={g.label}>
          <ListGroupHeader label={g.label} />
          <Box sx={{ display: "grid", gap: { xs: 1, md: 0 }, pt: 0.5, pb: 1 }}>
            {g.items.map((region) => (
              <ButtonBase
                key={region.id}
                data-testid="region-option"
                data-name={region.name}
                onClick={() => onPick(region)}
                sx={{
                  display: "grid",
                  width: "100%",
                  // ButtonBase centres its content; the rows read left.
                  justifyContent: "stretch",
                  justifyItems: "start",
                  alignContent: "center",
                  minHeight: 56,
                  px: 1.75,
                  py: 1,
                  textAlign: "left",
                  borderRadius: `${tokens.radii.md}px`,
                  bgcolor: tokens.surface,
                  boxShadow: tokens.elevation.e1,
                  [theme.breakpoints.up("md")]: flatRowSx,
                }}
              >
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {region.name}
                </Typography>
                {regionContext(region.country, region.parents) && (
                  <Typography variant="body2" color="textSecondary">
                    {regionContext(region.country, region.parents)}
                  </Typography>
                )}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
