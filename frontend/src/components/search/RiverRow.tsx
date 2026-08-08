import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import type { ReactNode } from "react";

/** One river row - shared by search results and the recent-rivers list so
 * both render identically by construction. */
export default function RiverRow({
  name,
  secondary,
  onClick,
  trailing,
}: {
  name: string;
  secondary?: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <ListItemButton onClick={onClick} sx={{ mb: 0.5 }}>
      <ListItemText
        primary={name}
        secondary={secondary}
        slotProps={{
          primary: { variant: "body2", sx: { fontWeight: 600 } },
          secondary: { variant: "caption" },
        }}
      />
      {trailing}
    </ListItemButton>
  );
}
