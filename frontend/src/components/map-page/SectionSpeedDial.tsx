import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import type { SxProps } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
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
 * add feature). Shared between MobileOverlay (detail view) and MapPane
 * (map view).
 */
export default function SectionSpeedDial({ state, sx }: Props) {
  const {
    selectedSectionId,
    selectedWaterwayId,
    suggestMode,
    setSuggestMode,
    favoritedIds,
    toggleFavorite,
    sections,
  } = state;

  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { current: standingDescent, start: startDescent } = useStandingDescent();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name;
  const isFavorited = favoritedIds?.has(selectedSectionId ?? -1) ?? false;
  const [open, setOpen] = useState(false);

  const show =
    selectedSectionId != null && selectedWaterwayId != null && !suggestMode;

  if (!show) return null;

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
            <StarIcon sx={{ color: "warning.main" }} />
          ) : (
            <StarBorderIcon />
          )
        }
        title={isFavorited ? "Remove favorite" : "Add favorite"}
        onClick={() => toggleFavorite?.(selectedSectionId!)}
      />
      {isAuthenticated && !standingDescent && (
        <SpeedDialAction
          icon={<PlayArrowIcon />}
          title="Start descent"
          onClick={() =>
            startDescent({
              startTime: new Date().toISOString(),
              waterwayId: selectedWaterwayId!,
              sectionId: selectedSectionId!,
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
                waterwayId: selectedWaterwayId!,
                sectionId: selectedSectionId!,
                startTime: undefined,
              },
            })
          }
        />
      )}
      {isAuthenticated && !isMobile && (
        <SpeedDialAction
          icon={<AddLocationAltIcon />}
          title="Add feature"
          onClick={() => setSuggestMode("feature")}
        />
      )}
    </SpeedDial>
  );
}
