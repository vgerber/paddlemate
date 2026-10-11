import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ChipRow from "@/components/ChipRow";
import type { RegionOutline } from "@/lib/api";
import { alphas, BOTTOM_NAV_SPACE, theme } from "@/lib/theme";
import { LEVELS, regionSubtitle } from "./regionGeometry";

const { tokens } = theme;

/** What shows above the bottom navigation, which stands over the sheet. */
const PEEK_CONTENT = 136;
const PEEK_HEIGHT = PEEK_CONTENT + tokens.chrome.bottomNav;

/** How far the map's own controls sit above the screen edge to clear the peek. */
export const REGION_SHEET_CLEARANCE = PEEK_HEIGHT + 12;

interface RegionSheetProps {
  picked: RegionOutline | null | undefined;
  loading: boolean;
  /** The level the map is limited to, or null for every level. */
  level: string | null;
  onLevelChange: (kind: string | null) => void;
  /** The regions the picked one lies in. */
  parents: RegionOutline[];
  /** Ranges the map leaves out because they hold other ranges. */
  hiddenRanges: RegionOutline[];
  onPick: (regionId: number) => void;
  /** The way back to the results, at the right edge of the peek. */
  action: ReactNode;
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
      sx={
        set
          ? {
              bgcolor: `${tokens.primary}${alphas.wash}`,
              borderColor: tokens.primary,
              borderWidth: 1.5,
            }
          : undefined
      }
    />
  );
}

/** The phone's region picker: a peek sheet over the map, so the map keeps
 * most of the screen. Before a pick it holds the level chips; after one, the
 * region's name, and (dragged up) the regions it is part of and the ranges
 * the map left out. */
export default function RegionSheet({
  picked,
  loading,
  level,
  onLevelChange,
  parents,
  hiddenRanges,
  onPick,
  action,
}: RegionSheetProps) {
  const [state, setState] = useState<"peek" | "open">("peek");
  const [rangesOpen, setRangesOpen] = useState(false);

  return (
    <BottomSheet
      state={state}
      onStateChange={(next) => setState(next === "open" ? "open" : "peek")}
      label="Regions"
      peekHeight={PEEK_HEIGHT}
    >
      <Box sx={{ px: 2, pb: BOTTOM_NAV_SPACE }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {picked ? (
              <Typography variant="subtitle2" noWrap>
                {[picked.country, picked.name].filter(Boolean).join(" · ")}
              </Typography>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {/* A viewport the server has not seen takes ten seconds to
                    fetch from OSM; without this the map just sits empty. */}
                {loading && <CircularProgress size={12} color="inherit" />}
                <Typography variant="body2" color="textSecondary" noWrap>
                  {loading
                    ? "Finding the regions here…"
                    : "Tap a region on the map to search in it"}
                </Typography>
              </Box>
            )}
          </Box>
          {action}
        </Box>

        {!picked && (
          <ChipRow>
            {LEVELS.map(({ kind, label }) => (
              <RegionChip
                key={kind}
                label={label}
                set={level === kind}
                onClick={() => onLevelChange(level === kind ? null : kind)}
              />
            ))}
          </ChipRow>
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
      </Box>
    </BottomSheet>
  );
}
