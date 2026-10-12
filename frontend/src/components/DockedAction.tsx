import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** A pane's primary action on desktop: one filled button across the foot of
 * the pane, docked below the list so it never floats over the last row. The
 * same place and the same look in every pane, so "add" is always found in
 * one spot. Label only, no icon. Phones keep their FAB, so this renders from
 * `md` up only. */
export default function DockedAction({
  label,
  onClick,
  inset,
}: {
  label: string;
  onClick: () => void;
  /** Space in px on the sides and below, none above, where the pane's own
   * gutter supplies it. Omitted: 12px all round. */
  inset?: number;
}) {
  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        p: inset === undefined ? 1.5 : `0 ${inset}px ${inset}px`,
        flexShrink: 0,
      }}
    >
      <Button
        variant="contained"
        fullWidth
        onClick={onClick}
        sx={{
          borderRadius: `${tokens.radii.sm + 2}px`,
          fontSize: "0.9375rem",
          lineHeight: 1.4,
        }}
      >
        {label}
      </Button>
    </Box>
  );
}
