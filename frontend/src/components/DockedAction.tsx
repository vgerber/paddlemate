import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import type { ReactNode } from "react";

/** A pane's primary action on desktop: one filled button across the foot of
 * the pane, docked below the list so it never floats over the last row. The
 * same place and the same look in every pane, so "add" is always found in
 * one spot. Phones keep their FAB, so this renders from `md` up only. */
export default function DockedAction({
  label,
  onClick,
  icon = <AddIcon />,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        p: 1.5,
        flexShrink: 0,
      }}
    >
      <Button variant="contained" fullWidth startIcon={icon} onClick={onClick}>
        {label}
      </Button>
    </Box>
  );
}
