import AddIcon from "@mui/icons-material/Add";
import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Fab from "@mui/material/Fab";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps } from "@mui/material/styles";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { RowAction } from "@/components/RowMenu";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { theme } from "@/lib/theme";
import type { MapPageState } from "./useMapPageState";

interface Props {
  state: MapPageState;
  sx?: SxProps;
}

/**
 * A round button opening the section-specific actions (favorite, start/log descent,
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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

  const actions: RowAction[] = [
    {
      label: isFavorited ? "Remove favorite" : "Add favorite",
      icon: isFavorited ? (
        <StarIcon fontSize="small" sx={{ color: theme.tokens.tertiary }} />
      ) : (
        <StarBorderIcon fontSize="small" />
      ),
      onClick: () => toggleFavorite?.(selectedSectionId),
    },
  ];
  if (sectionDetailTab === "features") {
    actions.push({
      label: showProposedFeatures
        ? "Hide proposed features"
        : "Show proposed features",
      icon: (
        <PendingActionsIcon
          fontSize="small"
          sx={
            showProposedFeatures ? { color: theme.tokens.primary } : undefined
          }
        />
      ),
      onClick: toggleShowProposedFeatures,
    });
  }
  if (isAuthenticated && !standingDescent) {
    actions.push(
      {
        label: "Start descent",
        icon: <PlayArrowIcon fontSize="small" />,
        onClick: () =>
          startDescent({
            startTime: new Date().toISOString(),
            waterwayId: selectedWaterwayId,
            sectionId: selectedSectionId,
            sectionName: sectionName ?? "",
          }),
      },
      {
        label: "Log descent",
        icon: <DirectionsBoatIcon fontSize="small" />,
        onClick: () =>
          navigate({
            to: "/logs/new",
            search: {
              waterwayId: selectedWaterwayId,
              sectionId: selectedSectionId,
              startTime: undefined,
            },
          }),
      },
    );
  }
  if (isAuthenticated) {
    actions.push({
      label: "Add feature",
      icon: <AddLocationAltIcon fontSize="small" />,
      onClick: () => setSuggestMode("feature"),
    });
  }

  return (
    <>
      <Fab
        color="primary"
        aria-label="Section actions"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        sx={sx}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <AddIcon />
      </Fab>
      {/* A menu, not a stack of round buttons: the stack ran off the top of
          a 320x568 screen, a menu keeps itself inside the viewport. */}
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            sx={{ minHeight: theme.tokens.touch.min, gap: 1.5 }}
            onClick={() => {
              setAnchor(null);
              action.onClick();
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 0 }}>
              {action.icon}
            </ListItemIcon>
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
