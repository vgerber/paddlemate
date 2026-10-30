import Box from "@mui/material/Box";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { listRowSx } from "@/components/canvas/flatRow";
import { trailSlotSx } from "./phoneGrid";

/** The end of a row as one 44 box (see `trailSlotSx`); an empty one is the
 * spacer that keeps rows without a control in line with rows that have one. */
export function TrailSlot({ children }: { children?: ReactNode }) {
  return <Box sx={trailSlotSx}>{children}</Box>;
}

/** One list row, drawn once: a card on a phone, flat inside the desktop card
 * (`listRowSx`). With `onClick` the whole row is the button; without, it is a
 * plain row in a hairline box (for rows that only show). */
export default function RowCard({
  onClick,
  selected,
  gap = 1,
  testId,
  sx,
  children,
}: {
  onClick?: () => void;
  selected?: boolean;
  /** Spacing unit between the row's children. */
  gap?: number;
  testId?: string;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  if (onClick) {
    return (
      <ListItem disablePadding>
        <ListItemButton
          data-testid={testId}
          selected={selected}
          onClick={onClick}
          sx={{ ...listRowSx, gap, ...(sx as object) }}
        >
          {children}
        </ListItemButton>
      </ListItem>
    );
  }
  return (
    <Box
      data-testid={testId}
      sx={{
        display: "flex",
        alignItems: "center",
        gap,
        px: 1.5,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
        ...(sx as object),
      }}
    >
      {children}
    </Box>
  );
}
