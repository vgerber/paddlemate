import MoreVertIcon from "@mui/icons-material/MoreVert";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { type ReactNode, useState } from "react";

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Destructive entries render in the error color. */
  danger?: boolean;
}

/**
 * One control for everything a row can do. A row of bare icons reads as
 * clutter and leaves no room for a label; a single overflow keeps the row
 * scannable and names each action.
 */
export default function RowMenu({
  actions,
  label = "More actions",
}: {
  actions: RowAction[];
  label?: string;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  if (actions.length === 0) return null;

  return (
    <>
      <IconButton
        size="small"
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        // The portal is a React child of the row - stop clicks selecting it.
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            sx={{ py: 1.25, color: action.danger ? "error.main" : undefined }}
            onClick={() => {
              setAnchor(null);
              action.onClick();
            }}
          >
            <ListItemIcon sx={{ color: "inherit" }}>{action.icon}</ListItemIcon>
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
