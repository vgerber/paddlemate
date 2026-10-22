import Fab from "@mui/material/Fab";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import type { ReactNode } from "react";
import DockedAction from "@/components/DockedAction";
import { fabSx } from "@/components/PaneFab";
import { AddIcon, CloseIcon, EditDatesIcon, LinkIcon } from "@/lib/icons";
import type { TripTab } from "./TripDetail";

export interface TripActionContext {
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

interface TripAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** What the tab offers, top to bottom. The desktop dock and the phone's FAB
 * both render this list, so they never offer different things. */
function tripActions(p: TripActionContext): TripAction[] {
  if (p.tab === "plan" && p.isMember)
    return [{ label: "Add a day", icon: <AddIcon />, onClick: p.onAddDay }];
  // An admin adds a base outright; everyone else puts one up for the group.
  if (p.tab === "bases" && p.isMember)
    return p.isAdmin
      ? [{ label: "Add base", icon: <AddIcon />, onClick: p.onAddStay }]
      : [
          {
            label: "Propose a base",
            icon: <AddIcon />,
            onClick: p.onProposeStay,
          },
        ];
  // A trip is invite-only, so filling it is the admin's job on this tab.
  // Everyone else's one action here is their own dates.
  if (p.tab === "members" && p.isAdmin)
    return [{ label: "Add member", icon: <AddIcon />, onClick: p.onAddMember }];
  if (p.tab === "members" && p.isMember && p.hasSelf)
    return [
      {
        label: "Set your dates",
        icon: <EditDatesIcon />,
        onClick: p.onEditAttendance,
      },
    ];
  if (p.tab === "logs" && p.isMember)
    return [
      { label: "Log a descent", icon: <AddIcon />, onClick: p.onNewLog },
      {
        label: "Link an existing log",
        icon: <LinkIcon />,
        onClick: p.onLinkLog,
      },
    ];
  return [];
}

/** The tab's actions at the foot of the detail pane, desktop only. */
export function TripDock(props: TripActionContext) {
  return (
    <>
      {tripActions(props).map((a) => (
        <DockedAction key={a.label} label={a.label} onClick={a.onClick} />
      ))}
    </>
  );
}

/**
 * One screen, one primary action: a single action is the FAB itself, and only
 * where several share the spot does it open a menu.
 */
export default function TripFab(props: TripActionContext) {
  const actions = tripActions(props);
  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const [only] = actions;
    return (
      <Fab
        color="primary"
        onClick={only.onClick}
        aria-label={only.label}
        sx={fabSx}
      >
        {only.icon}
      </Fab>
    );
  }

  return (
    <SpeedDial
      ariaLabel="Log actions"
      icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
      // The action corner is one colour across the panel's tabs; a dial
      // that defaulted to cyan turned it into a per-tab change.
      FabProps={{ color: "primary" }}
      sx={fabSx}
    >
      {actions.map((a) => (
        <SpeedDialAction
          key={a.label}
          icon={a.icon}
          slotProps={{ tooltip: { title: a.label } }}
          onClick={a.onClick}
        />
      ))}
    </SpeedDial>
  );
}
