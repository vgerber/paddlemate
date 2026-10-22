import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import ChipRow from "@/components/ChipRow";
import {
  partOf,
  partOfChips,
  rangesHiddenByNesting,
  regionSubtitle,
} from "@/components/map/regionGeometry";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import type { RegionOutline } from "@/lib/api";
import { useRegionSearch } from "@/lib/hooks/useRegions";
import { REGION_KINDS } from "@/lib/regionKinds";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** What the region search needs from the map page. */
export interface RegionBrowseProps {
  /** The region searched in, with its outline. */
  picked: RegionOutline | null | undefined;
  /** Every region in view, as the map draws them. */
  choices: RegionOutline[];
  loading: boolean;
  /** The level the map is limited to, or null for every level. */
  level: string | null;
  onLevelChange: (kind: string | null) => void;
  onPick: (regionId: number) => void;
}

function RegionChip({
  label,
  set = false,
  onClick,
}: {
  label: string;
  set?: boolean;
  onClick: () => void;
}) {
  return (
    <Chip
      variant="outlined"
      clickable
      onClick={onClick}
      aria-pressed={set}
      color={set ? "primary" : "default"}
      label={label}
      sx={{
        border: "none",
        height: tokens.touch.min,
        borderRadius: `${tokens.radii.pill}px`,
        bgcolor: set ? `${tokens.primary}${alphas.wash}` : "transparent",
        boxShadow: set
          ? `inset 0 0 0 2px ${tokens.primary}`
          : `inset 0 0 0 1px ${tokens.outlineVariant}`,
        "&:hover": { bgcolor: "transparent" },
      }}
    />
  );
}

/** Beside the region field: the levels the map can be limited to before a
 * pick, and after one the regions it lies in and the ranges the map left
 * out. The map is the other way to pick, so this stays short. */
export default function RegionBrowse({
  picked,
  choices,
  loading,
  level,
  onLevelChange,
  onPick,
}: RegionBrowseProps) {
  const verb = useMapVerb();
  const [rangesOpen, setRangesOpen] = useState(false);
  // Only the search carries real parents; the picked outline is matched up
  // by id, and the bounding-box guess stands in until then.
  const { data: found } = useRegionSearch(picked?.name ?? "");
  const guessed = useMemo(
    () => (picked ? partOf(choices, picked) : []),
    [choices, picked],
  );
  const parents = partOfChips(
    found?.find((r) => r.id === picked?.id)?.parents,
    guessed,
  );
  const hiddenRanges = useMemo(
    () => rangesHiddenByNesting(choices, picked?.id),
    [choices, picked?.id],
  );

  return (
    <>
      {!picked && (
        <>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            {/* A viewport the server has not seen takes ten seconds to fetch
                from OSM; without this the map just sits empty. */}
            {loading && <CircularProgress size={12} color="inherit" />}
            {loading
              ? "Finding the regions here…"
              : `${verb} a region on the map, or search one by name.`}
          </Typography>
          <ChipRow>
            {REGION_KINDS.map(({ kind, label }) => (
              <RegionChip
                key={kind}
                label={label}
                set={level === kind}
                onClick={() => onLevelChange(level === kind ? null : kind)}
              />
            ))}
          </ChipRow>
        </>
      )}

      {picked && parents.length > 0 && (
        <>
          <Typography variant="caption" color="textSecondary">
            Part of
          </Typography>
          <ChipRow>
            {parents.map((parent) => (
              <RegionChip
                key={parent.id}
                label={parent.name}
                onClick={() => onPick(parent.id)}
              />
            ))}
          </ChipRow>
        </>
      )}

      {hiddenRanges.length > 0 && (
        <>
          <ListItemButton
            onClick={() => setRangesOpen((was) => !was)}
            aria-expanded={rangesOpen}
            sx={{ px: 0, minHeight: tokens.touch.min }}
          >
            <ListItemText
              primary={`Mountain ranges in view (${hiddenRanges.length})`}
              slotProps={{ primary: { variant: "subtitle2" } }}
            />
          </ListItemButton>
          {rangesOpen &&
            hiddenRanges.map((range) => (
              <ListItemButton
                key={range.id}
                onClick={() => onPick(range.id)}
                sx={{ px: 0, minHeight: tokens.touch.min }}
              >
                <ListItemText
                  primary={range.name}
                  secondary={regionSubtitle(range.country, range.kind)}
                />
              </ListItemButton>
            ))}
        </>
      )}
    </>
  );
}
