import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import Fab from "@mui/material/Fab";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import type { TripTab } from "./TripDetail";

/** On a phone, the screen's corner above the bottom nav. On a desktop, the
 * corner of the trip's own column: the column stops at its cap, and a button
 * pinned to the window's corner ended up a screen-width away from the list it
 * adds to. Whatever holds the trip is `position: relative`. */
export const fabSx = {
  position: { xs: "fixed", md: "absolute" } as const,
  bottom: {
    xs: "calc(56px + env(safe-area-inset-bottom) + 16px)",
    md: 24,
  },
  right: { xs: 16, md: 24 },
};

/**
 * One screen, one primary action. Each tab has an obvious thing to do, so the
 * FAB does it directly; only where several actions genuinely share the spot
 * does it open a menu.
 */
export default function TripFab({
  tab,
  isMember,
  isAdmin,
  hasSelf,
  onAddMember,
  onAddDay,
  onAddStay,
  onProposeStay,
  onEditAttendance,
  onLinkLog,
  onNewLog,
  onEdit,
  onDelete,
}: {
  tab: TripTab;
  isMember: boolean;
  isAdmin: boolean;
  hasSelf: boolean;
  onAddMember: () => void;
  onAddDay: () => void;
  onAddStay: () => void;
  onProposeStay: () => void;
  onEditAttendance: () => void;
  onLinkLog: () => void;
  onNewLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (tab === "plan" && isMember) {
    return (
      <Fab
        color="secondary"
        onClick={onAddDay}
        aria-label="Add a day"
        sx={fabSx}
      >
        <AddIcon />
      </Fab>
    );
  }

  // An admin adds a base outright; everyone else puts one up for the group.
  // One action each, so neither needs a menu.
  if (tab === "bases" && isMember) {
    return (
      <Fab
        color="secondary"
        onClick={isAdmin ? onAddStay : onProposeStay}
        aria-label={isAdmin ? "Add base" : "Propose a base"}
        sx={fabSx}
      >
        <AddIcon />
      </Fab>
    );
  }

  // A trip is invite-only, so filling it is the admin's job on this tab.
  // Everyone else's one action here is their own dates.
  if (tab === "members" && isAdmin) {
    return (
      <Fab
        color="secondary"
        onClick={onAddMember}
        aria-label="Add member"
        sx={fabSx}
      >
        <PersonAddOutlinedIcon />
      </Fab>
    );
  }

  if (tab === "members" && isMember && hasSelf) {
    return (
      <Fab
        color="secondary"
        onClick={onEditAttendance}
        aria-label="Set your dates"
        sx={fabSx}
      >
        <EditCalendarOutlinedIcon />
      </Fab>
    );
  }

  if (tab === "logs" && isMember) {
    return (
      <SpeedDial
        ariaLabel="Log actions"
        icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
        // The action corner is one colour across the panel's tabs; a dial
        // that defaulted to cyan turned it into a per-tab change.
        FabProps={{ color: "secondary" }}
        sx={fabSx}
      >
        <SpeedDialAction
          icon={<AddIcon />}
          slotProps={{ tooltip: { title: "Log a descent" } }}
          onClick={onNewLog}
        />
        <SpeedDialAction
          icon={<LinkOutlinedIcon />}
          slotProps={{ tooltip: { title: "Link an existing log" } }}
          onClick={onLinkLog}
        />
      </SpeedDial>
    );
  }

  if (!isAdmin) return null;

  return (
    <SpeedDial
      ariaLabel="Trip actions"
      icon={<SpeedDialIcon icon={<MoreVertIcon />} openIcon={<CloseIcon />} />}
      FabProps={{ color: "secondary" }}
      sx={fabSx}
    >
      <SpeedDialAction
        icon={<EditOutlinedIcon />}
        slotProps={{ tooltip: { title: "Edit trip" } }}
        onClick={onEdit}
      />
      <SpeedDialAction
        icon={<DeleteOutlinedIcon />}
        slotProps={{ tooltip: { title: "Delete trip" } }}
        onClick={onDelete}
      />
    </SpeedDial>
  );
}
