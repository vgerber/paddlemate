import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ChipRow from "@/components/ChipRow";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import type { RegionOutline } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRegionSearch } from "@/lib/hooks/useRegions";
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
  /** Drops the picked region and goes back to browsing. */
  onClear?: () => void;
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

/** The floating field on the map: find a region by name instead of by
 * looking for it. */
function RegionSearchField({
  level,
  onPick,
}: {
  level: string | null;
  onPick: (regionId: number) => void;
}) {
  const [text, setText] = useState("");
  const term = useDebouncedValue(text, 300);
  const { data } = useRegionSearch(term);
  const found = (data ?? []).filter((r) => r.id != null).slice(0, 6);
  const tier = LEVELS.find((l) => l.kind === level);
  return (
    <Box
      sx={{
        position: "fixed",
        top: 12,
        left: 12,
        right: 12,
        zIndex: 1100,
        display: "grid",
        gap: 1,
        justifyItems: "start",
      }}
    >
      <TextField
        fullWidth
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search regions..."
        slotProps={{
          htmlInput: { "aria-label": "Search regions", enterKeyHint: "search" },
          input: {
            endAdornment: text ? (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Clear search"
                  onClick={() => setText("")}
                  sx={{ width: tokens.touch.min, height: tokens.touch.min }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
        sx={{
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radii.md}px`,
          boxShadow: tokens.elevation.e2,
          "& .MuiInputBase-root": {
            minHeight: 48,
            borderRadius: `${tokens.radii.md}px`,
          },
          "& .MuiInputBase-input": { fontSize: 16, py: 0, height: 48 },
        }}
      />
      {found.length > 0 && (
        <Paper
          sx={{
            width: "100%",
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e2,
            overflow: "hidden",
          }}
        >
          {found.map((r) => (
            <ListItemButton
              key={r.id}
              onClick={() => {
                if (r.id != null) onPick(r.id);
                setText("");
              }}
              sx={{ minHeight: tokens.touch.min }}
            >
              <ListItemText
                primary={r.name}
                secondary={regionSubtitle(r.country, r.kind)}
              />
            </ListItemButton>
          ))}
        </Paper>
      )}
      {tier && (
        <Chip
          size="small"
          label={tier.label}
          sx={{
            bgcolor: tokens.surface,
            boxShadow: tokens.elevation.e1,
            fontWeight: 600,
          }}
        />
      )}
    </Box>
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
  onClear,
}: RegionSheetProps) {
  const verb = useMapVerb();
  const [state, setState] = useState<"peek" | "open">("peek");
  const [rangesOpen, setRangesOpen] = useState(false);

  return (
    <>
      {!picked && <RegionSearchField level={level} onPick={onPick} />}
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
                <>
                  <Typography
                    noWrap
                    sx={{
                      color: tokens.primary,
                      fontSize: 17,
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {picked.name}
                  </Typography>
                  <Typography variant="body2" color="textSecondary" noWrap>
                    {regionSubtitle(picked.country, picked.kind)}
                  </Typography>
                </>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {/* A viewport the server has not seen takes ten seconds to
                    fetch from OSM; without this the map just sits empty. */}
                  {loading && <CircularProgress size={12} color="inherit" />}
                  <Typography variant="body2" color="textSecondary" noWrap>
                    {loading
                      ? "Finding the regions here…"
                      : `${verb} a region on the map, or search one by name.`}
                  </Typography>
                </Box>
              )}
            </Box>
            {picked && onClear && (
              <IconButton
                aria-label="Clear region"
                onClick={onClear}
                sx={{ width: tokens.touch.min, height: tokens.touch.min }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
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
    </>
  );
}
