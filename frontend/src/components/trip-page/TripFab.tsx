import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Fab from "@mui/material/Fab";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import DockedAction from "@/components/DockedAction";
import { BOTTOM_NAV_SPACE } from "@/lib/theme";
import type { TripTab } from "./TripDetail";

/** On a phone, the screen's corner above the bottom nav. From `md` up the
 * primary action is docked at the foot of the pane instead (`TripDock`), so
 * the button never floats over the content it adds to. */
export const fabSx = {
  position: "fixed" as const,
  bottom: `calc(${BOTTOM_NAV_SPACE} + 16px)`,
  right: 16,
  display: { xs: "flex", md: "none" },
};

interface Actions {
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
}

/** What the tab's docked buttons say and do, top to bottom. The same
 * decisions the phone's FAB makes, so the two never offer different things. */
function dockedActions(p: Actions): { label: string; onClick: () => void }[] {
  if (p.tab === "plan" && p.isMember)
    return [{ label: "Add a day", onClick: p.onAddDay }];
  if (p.tab === "bases" && p.isMember)
    return p.isAdmin
      ? [{ label: "Add base", onClick: p.onAddStay }]
      : [{ label: "Propose a base", onClick: p.onProposeStay }];
  if (p.tab === "members" && p.isAdmin)
    return [{ label: "Add member", onClick: p.onAddMember }];
  if (p.tab === "members" && p.isMember && p.hasSelf)
    return [{ label: "Set your dates", onClick: p.onEditAttendance }];
  if (p.tab === "logs" && p.isMember)
    return [
      { label: "Log a descent", onClick: p.onNewLog },
      { label: "Link an existing log", onClick: p.onLinkLog },
    ];
  return [];
}

/** The tab's actions at the foot of the detail pane, desktop only. */
export function TripDock(props: Actions) {
  return (
    <>
      {dockedActions(props).map((a) => (
        <DockedAction key={a.label} label={a.label} onClick={a.onClick} />
      ))}
    </>
  );
}

/**
 * One screen, one primary action. Each tab has an obvious thing to do, so the
 * FAB does it directly; only where several actions genuinely share the spot
 * does it open a menu.
 */
function PrimaryFab({
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
        <AddIcon />
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

  return null;
}

/** Edit and delete sit apart from the tab's primary action, in the opposite
 * corner, so an admin reaches them on every tab. */
function AdminDial({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <SpeedDial
      ariaLabel="Trip actions"
      icon={<SpeedDialIcon icon={<MoreVertIcon />} openIcon={<CloseIcon />} />}
      FabProps={{ color: "default" }}
      sx={{
        ...fabSx,
        // Docked actions own the pane's foot on a desktop, so the dial sits
        // above them.
        position: { xs: "fixed", md: "absolute" },
        bottom: { xs: fabSx.bottom, md: 88 },
        right: "auto",
        left: { xs: 16, md: 24 },
        display: "flex",
      }}
    >
      <SpeedDialAction
        icon={<EditOutlinedIcon />}
        slotProps={{ tooltip: { title: "Edit trip", placement: "right" } }}
        onClick={onEdit}
      />
      <SpeedDialAction
        icon={<DeleteOutlinedIcon />}
        slotProps={{ tooltip: { title: "Delete trip", placement: "right" } }}
        onClick={onDelete}
      />
    </SpeedDial>
  );
}

export default function TripFab({
  onEdit,
  onDelete,
  ...actions
}: Actions & { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <PrimaryFab {...actions} />
      {actions.isAdmin && <AdminDial onEdit={onEdit} onDelete={onDelete} />}
    </>
  );
}
