import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import PanelHeader from "@/components/PanelHeader";
import type { SwipeTrack } from "@/lib/hooks/useSwipeTabs";
import { MapIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import type {
  SearchMode,
  WaterwaySearchFilters,
} from "./useWaterwaySearchFilters";

const { tokens } = theme;

const MODES: { value: SearchMode; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "area", label: "Area" },
  { value: "region", label: "Region" },
];

interface SearchFiltersHeaderProps {
  filters: WaterwaySearchFilters;
  /** Swipe state from `useSwipeTabs`, so the underline follows a drag. */
  swipe: {
    track: SwipeTrack;
    gestureProps: React.HTMLAttributes<HTMLElement>;
  };
  onClose?: () => void;
  /** In the phone's peek sheet: the tabs only, the sheet's handle is the title. */
  sheet?: boolean;
}

/** The panel header: the title and the underlined Name, Area and Region
 * tabs. The mode itself lives in the URL, see `useWaterwaySearchFilters`. */
export default function SearchFiltersHeader({
  filters,
  swipe,
  onClose,
  sheet = false,
}: SearchFiltersHeaderProps) {
  // The design sets the title at panel-title size, larger than the title
  // PanelHeader draws, so the title row is drawn here and PanelHeader keeps
  // the tab bar.
  return (
    <Box
      sx={{
        flexShrink: 0,
        bgcolor: tokens.surface,
        // One shadow under the title and the tabs together, on the grey
        // ground of a phone; the desktop card is white already.
        boxShadow: { xs: tokens.elevation.e1, md: "none" },
        position: "relative",
        zIndex: 1,
        "& > *:last-child": { boxShadow: "none" },
      }}
    >
      <Box
        sx={{
          // The desktop card draws the title in its own header.
          display: sheet ? "none" : { xs: "flex", md: "none" },
          alignItems: "center",
          gap: 1,
          px: { xs: `${tokens.phone.line}px`, md: 2 },
          minHeight: tokens.canvas.panel.headerRow,
        }}
      >
        <Typography variant="h3" component="h1" noWrap sx={{ flex: 1 }}>
          Search
        </Typography>
        {onClose && (
          <IconButton
            onClick={onClose}
            aria-label="Map"
            sx={{
              display: { xs: "flex", md: "none" },
              width: tokens.touch.min,
              height: tokens.touch.min,
              mr: -1.25,
              color: tokens.onSurfaceVariant,
            }}
          >
            <MapIcon sx={{ fontSize: 24 }} />
          </IconButton>
        )}
      </Box>
      {/* The handle row holds 44px and keeps them (it stacks above); the tabs
          slide up under its foot so the labels start about 20px below the
          bar, the panel's 8/16/24 rhythm, not 30. */}
      <Box sx={{ mt: sheet ? "-18px" : 0 }}>
        <PanelHeader
          tabs={{
            value: filters.mode,
            onChange: filters.setMode,
            options: MODES,
            track: swipe.track,
            gesture: swipe.gestureProps,
          }}
        />
      </Box>
    </Box>
  );
}
