import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import ChipRow from "@/components/ChipRow";
import {
  partOf,
  partOfChips,
  regionSubtitle,
} from "@/components/map/regionGeometry";
import DelayedSpinner from "@/components/states/DelayedSpinner";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import { withAlpha } from "@/lib/alpha";
import type { RegionOutline } from "@/lib/api";
import { useRegionSearch } from "@/lib/hooks/useRegions";
import { CollapseIcon, ExpandIcon } from "@/lib/icons";
import {
  type BrowseKind,
  hiddenKindsLabel,
  REGION_KINDS,
  regionKindLabel,
  regionKindSingular,
} from "@/lib/regionKinds";
import { cardTitleSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** What the region search needs from the map page. */
export interface RegionBrowseProps {
  /** The region searched in, with its outline. */
  picked: RegionOutline | null | undefined;
  /** The regions of the drawn kind, as the map draws them. */
  choices: RegionOutline[];
  /** The regions of the drawn kind that are in view, by name. */
  listed: RegionOutline[];
  loading: boolean;
  /** The kind the map draws and a click picks. */
  kind: BrowseKind;
  /** Kinds asked for that the view is too wide to draw. */
  hiddenKinds: string[];
  onKindToggle: (kind: BrowseKind) => void;
  /** Phone: the region a first tap lit, waiting for "Pick". */
  preview: RegionOutline | null;
  onPick: (regionId: number) => void;
}

/** "Valley - AT": the kind and where it lies, under a name. */
function previewSubtitle(region: RegionOutline): string {
  const kind = regionKindSingular(region.kind);
  return [kind.charAt(0).toUpperCase() + kind.slice(1), region.country]
    .filter(Boolean)
    .join(" - ");
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
        bgcolor: set ? withAlpha(tokens.primary, "wash") : "transparent",
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
  listed,
  loading,
  kind,
  hiddenKinds,
  onKindToggle,
  preview,
  onPick,
}: RegionBrowseProps) {
  const verb = useMapVerb();
  const [listOpen, setListOpen] = useState(false);
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

  const kindLabel = regionKindLabel(kind) ?? "Regions";
  const hidden = hiddenKinds.includes(kind);
  const others = listed.filter((r) => r.id !== picked?.id);

  return (
    <>
      {!picked && preview && (
        <Box
          data-testid="region-preview"
          sx={{ display: "flex", alignItems: "center", gap: 2, py: 0.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={cardTitleSx}>
              {preview.name}
            </Typography>
            <Typography variant="body2" color="textSecondary" noWrap>
              {previewSubtitle(preview)}
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={() => onPick(preview.id)}
            sx={{ minHeight: tokens.touch.min, px: 3 }}
          >
            Pick
          </Button>
        </Box>
      )}

      {!picked && !preview && (
        <>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            {/* A viewport the server has not seen takes ten seconds to fetch
                from OSM; without this the map just sits empty. */}
            {loading && <DelayedSpinner size={12} color="inherit" />}
            {loading
              ? "Finding the regions here…"
              : `${verb} a ${regionKindSingular(kind)} on the map, or search one by name.`}
          </Typography>
          <ToggleButtonGroup
            value={kind}
            exclusive
            fullWidth
            aria-label="Kind of region"
            sx={{
              "& .MuiToggleButton-root": {
                flex: 1,
                minWidth: 0,
                px: 0.5,
                fontSize: "0.8125rem",
              },
            }}
          >
            {REGION_KINDS.map(({ kind: k, short }) => (
              <ToggleButton key={k} value={k} onClick={() => onKindToggle(k)}>
                {short}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {hidden && (
            <Typography
              variant="caption"
              color="textSecondary"
              role="status"
              data-testid="region-too-wide"
            >
              Zoom in to see {hiddenKindsLabel([kind])}
            </Typography>
          )}
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

      {others.length > 0 && !hidden && (
        <>
          <ListItemButton
            onClick={() => setListOpen((was) => !was)}
            aria-expanded={listOpen}
            data-testid="region-list-toggle"
            sx={{ px: 0, minHeight: tokens.touch.min }}
          >
            <ListItemText
              primary={`${kindLabel} in view (${others.length})`}
              slotProps={{ primary: { variant: "subtitle2" } }}
            />
            {listOpen ? <CollapseIcon /> : <ExpandIcon />}
          </ListItemButton>
          {listOpen &&
            others.map((region) => (
              <ListItemButton
                key={region.id}
                data-testid="region-list-row"
                onClick={() => onPick(region.id)}
                sx={{ px: 0, minHeight: tokens.touch.min }}
              >
                <ListItemText
                  primary={region.name}
                  secondary={regionSubtitle(region.country, region.kind)}
                />
              </ListItemButton>
            ))}
        </>
      )}
    </>
  );
}
