import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SearchIcon from "@mui/icons-material/Search";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Fab from "@mui/material/Fab";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";
import { levelMarkerColor, type WaterLevel } from "@/lib/waterLevel";
import SectionSpeedDial from "./SectionSpeedDial";

const { tokens } = theme;

import type { MapPageState } from "./useMapPageState";

interface SelectionBarProps {
  sectionName?: string;
  waterwayName?: string;
  level?: WaterLevel;
  onOpen: () => void;
}

/** The phone's bar at the foot of the map; opens the detail overlay again. */
function SelectionBar({
  sectionName,
  waterwayName,
  level,
  onOpen,
}: SelectionBarProps) {
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: { xs: "flex", md: "none" },
        bgcolor: tokens.surface,
        borderTop: `1px solid ${tokens.outlineVariant}`,
        px: 2,
        py: 1,
        alignItems: "center",
        gap: 1.5,
        zIndex: 1100,
      }}
    >
      {level && (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: levelMarkerColor(level),
            flexShrink: 0,
          }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <Typography
          variant="subtitle2"
          noWrap
          sx={{ fontWeight: 700, lineHeight: 1.3 }}
        >
          {sectionName ?? waterwayName ?? ""}
        </Typography>
        {sectionName && waterwayName && (
          <Typography variant="caption" color="textSecondary" noWrap>
            {waterwayName}
          </Typography>
        )}
      </Box>
      <KeyboardArrowUpIcon
        fontSize="small"
        sx={{ color: "action.active", flexShrink: 0 }}
      />
    </ButtonBase>
  );
}

interface SearchFabProps {
  badge: ReactNode;
  onOpen: () => void;
}

function SearchFab({ badge, onOpen }: SearchFabProps) {
  return (
    <Box
      sx={{
        display: { xs: "block", md: "none" },
        position: "absolute",
        bottom: 16,
        right: 16,
      }}
    >
      <Badge badgeContent={badge} color="secondary" max={99}>
        <Fab color="secondary" aria-label="Open search panel" onClick={onOpen}>
          <SearchIcon />
        </Fab>
      </Badge>
    </Box>
  );
}

interface MapPaneChromeProps extends SelectionBarProps {
  state: MapPageState;
  /** An area or region sheet is open; it brings its own controls. */
  sheetMode: boolean;
  mapView: boolean;
  resultsBadge: ReactNode;
  onOpenSearch: () => void;
}

/** The phone's controls over the map: the selection bar, or the search FAB. */
export default function MapPaneChrome({
  state,
  sheetMode,
  mapView,
  resultsBadge,
  onOpenSearch,
  ...bar
}: MapPaneChromeProps) {
  if (sheetMode) return null;
  if (!mapView) return <SearchFab badge={resultsBadge} onOpen={onOpenSearch} />;
  return (
    <>
      <SectionSpeedDial
        state={state}
        sx={{
          position: "absolute",
          bottom: "calc(60px + 16px)",
          right: 16,
          display: { xs: "flex", md: "none" },
        }}
      />
      <SelectionBar {...bar} />
    </>
  );
}
