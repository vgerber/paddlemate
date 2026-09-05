import AddIcon from "@mui/icons-material/Add";
import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Fab from "@mui/material/Fab";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import type { SxProps } from "@mui/material/styles";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { theme } from "@/lib/theme";
import type { MapPageState } from "./useMapPageState";

interface Props {
  state: MapPageState;
  sx?: SxProps;
}

/**
 * Speed Dial with section-specific actions (favorite, start/log descent,
 * add feature, proposed features). Shared between MobileOverlay (detail
 * view) and MapPane (map view), and the only place these actions live - the
 * detail header used to repeat the favourite and proposed toggles.
 */
export default function SectionSpeedDial({ state, sx }: Props) {
  const {
    selectedSectionId,
    selectedWaterwayId,
    suggestMode,
    setSuggestMode,
    sectionDetailTab,
    favoritedIds,
    toggleFavorite,
    sections,
    showProposedFeatures,
    toggleShowProposedFeatures,
  } = state;

  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { current: standingDescent, start: startDescent } =
    useStandingDescent();

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name;
  const isFavorited = favoritedIds?.has(selectedSectionId ?? -1) ?? false;
  const [open, setOpen] = useState(false);

  if (selectedSectionId == null || selectedWaterwayId == null || suggestMode) {
    return null;
  }

  // The notes tab composes in place; a floating add would mean features.
  if (sectionDetailTab === "notes") return null;

  // The logs tab exists to add a log; the button goes straight to the form
  // instead of opening the action menu.
  if (sectionDetailTab === "logs") {
    if (!isAuthenticated) return null;
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
    <SpeedDial
      ariaLabel="Section actions"
      sx={sx}
      icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
      direction="up"
      open={open}
      onOpen={(_, reason) => {
        if (reason !== "mouseEnter" && reason !== "focus") setOpen(true);
      }}
      onClose={() => setOpen(false)}
    >
      <SpeedDialAction
        icon={
          isFavorited ? (
            <StarIcon sx={{ color: theme.tokens.tertiary }} />
          ) : (
            <StarBorderIcon />
          )
        }
        title={isFavorited ? "Remove favorite" : "Add favorite"}
        onClick={() => toggleFavorite?.(selectedSectionId)}
      />
      {sectionDetailTab === "features" && (
        <SpeedDialAction
          icon={
            <PendingActionsIcon
              sx={
                showProposedFeatures
                  ? { color: theme.tokens.primary }
                  : undefined
              }
            />
          }
          title={
            showProposedFeatures
              ? "Hide proposed features"
              : "Show proposed features"
          }
          onClick={toggleShowProposedFeatures}
        />
      )}
      {isAuthenticated && !standingDescent && (
        <SpeedDialAction
          icon={<PlayArrowIcon />}
          title="Start descent"
          onClick={() =>
            startDescent({
              startTime: new Date().toISOString(),
              waterwayId: selectedWaterwayId,
              sectionId: selectedSectionId,
              sectionName: sectionName ?? "",
            })
          }
        />
      )}
      {isAuthenticated && !standingDescent && (
        <SpeedDialAction
          icon={<DirectionsBoatIcon />}
          title="Log descent"
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
        />
      )}
      {isAuthenticated && (
        <SpeedDialAction
          icon={<AddLocationAltIcon />}
          title="Add feature"
          onClick={() => setSuggestMode("feature")}
        />
      )}
    </SpeedDial>
  );
}
