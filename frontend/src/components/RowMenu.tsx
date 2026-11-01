import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { type ReactNode, useState } from "react";
import { MoreIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

export interface RowAction {
  label: string;
  /** Absent for a choice: the checkbox or the label carries it. */
  icon?: ReactNode;
  onClick: () => void;
  /** Destructive entries render in the error color. */
  danger?: boolean;
  /** Starts a new group: a hairline divider above the entry. */
  groupStart?: boolean;
  /** Makes the entry a checkable choice: it shows a checkbox, keeps the menu
   * open on a click and reads as a menu item checkbox. */
  checked?: boolean;
  disabled?: boolean;
}

/** The menu of a row's actions, opened from any anchor. `RowMenu` anchors it
 * on its overflow button; a row whose own control opens it (a checkbox that
 * asks which size) anchors it there. */
export function ActionMenu({
  actions,
  anchor,
  onClose,
  label,
}: {
  actions: RowAction[];
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Names the menu for a screen reader. */
  label?: string;
}) {
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      // The portal is a React child of the row - stop clicks selecting it.
      onClick={(e) => e.stopPropagation()}
      slotProps={{ list: { "aria-label": label } }}
    >
      {actions.map((action) => {
        const choice = action.checked !== undefined;
        return (
          <MenuItem
            key={action.label}
            role={choice ? "menuitemcheckbox" : undefined}
            aria-checked={choice ? action.checked : undefined}
            disabled={action.disabled}
            sx={{
              // Doubled class: MUI's sm+ MenuItem rule shrinks it otherwise.
              "&&": { minHeight: tokens.touch.min },
              gap: 1.5,
              color: action.danger ? "error.main" : undefined,
              ...(action.groupStart && {
                borderTop: `1px solid ${tokens.outlineVariant}`,
              }),
            }}
            onClick={() => {
              if (!choice) onClose();
              action.onClick();
            }}
          >
            {choice && (
              <Checkbox
                edge="start"
                checked={action.checked}
                tabIndex={-1}
                disableRipple
                aria-hidden
              />
            )}
            {action.icon && (
              <ListItemIcon sx={{ color: "inherit", minWidth: 0 }}>
                {action.icon}
              </ListItemIcon>
            )}
            {action.label}
          </MenuItem>
        );
      })}
    </Menu>
  );
}

/**
 * One control for everything a row can do. A row of bare icons reads as
 * clutter and leaves no room for a label; a single overflow keeps the row
 * scannable and names each action.
 */
export default function RowMenu({
  actions,
  name,
  label = name ? `${name} actions` : "More actions",
}: {
  actions: RowAction[];
  /** What the row is ("Log"): the control reads "Log actions". */
  name?: string;
  /** The whole accessible name, when "<name> actions" does not fit. */
  label?: string;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  if (actions.length === 0) return null;

  return (
    <>
      <IconButton
        title={label}
        aria-label={label}
        // The 44 box hangs out so the icon ends on the right line.
        sx={{ mr: { xs: `-${tokens.phone.trailInset}px`, md: 0 } }}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        <MoreIcon />
      </IconButton>
      <ActionMenu
        actions={actions}
        anchor={anchor}
        onClose={() => setAnchor(null)}
      />
    </>
  );
}
