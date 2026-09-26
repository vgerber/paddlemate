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
        px: 1.5,
        py: 1,
        flexShrink: 0,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {/* Secondary is the lime call-to-action, the colour the FABs use. */}
      <Button
        variant="contained"
        color="secondary"
        size="small"
        fullWidth
        startIcon={icon}
        onClick={onClick}
      >
        {label}
      </Button>
    </Box>
  );
}
