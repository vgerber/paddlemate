import AddIcon from "@mui/icons-material/Add";
import Fab from "@mui/material/Fab";
import type { SxProps } from "@mui/material/styles";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/hooks/useSession";
import type { MapPageState } from "./useMapPageState";

interface SectionSpeedDialProps {
  state: MapPageState;
  sx?: SxProps;
}

/**
 * The phone's one primary action on a section: add a feature, or log a
 * descent on the logs tab. Shared between MobileOverlay (detail view) and
 * MapPane (map view). Everything else a section can do is in the detail
 * header's menu.
 */
export default function SectionSpeedDial({ state, sx }: SectionSpeedDialProps) {
  const {
    selectedSectionId,
    selectedWaterwayId,
    suggestMode,
    setSuggestMode,
    sectionDetailTab,
  } = state;

  const { isAuthenticated } = useSession();
  const navigate = useNavigate();

  if (selectedSectionId == null || selectedWaterwayId == null || suggestMode) {
    return null;
  }
  if (!isAuthenticated) return null;

  // Notes compose in place and sources only read.
  if (sectionDetailTab === "notes" || sectionDetailTab === "sources") {
    return null;
  }

  if (sectionDetailTab === "logs") {
    return (
      <Fab
        color="primary"
        aria-label="Log descent"
        title="Log descent"
        sx={sx}
        onClick={() =>
          navigate({
            to: "/logs/new",
            search: {
              waterwayId: selectedWaterwayId,
              sectionId: selectedSectionId,
              startTime: undefined,
            },
          })
        }
      >
        <AddIcon />
      </Fab>
    );
  }

  return (
    <Fab
      color="primary"
      aria-label="New feature"
      title="New feature"
      sx={sx}
      onClick={() => setSuggestMode("feature")}
    >
      <AddIcon />
    </Fab>
  );
}
