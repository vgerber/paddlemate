import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** The icon in its soft teal tile: the one drawing every empty, signed-out
 * and failed state shares. */
export default function StateTile({ children }: { children: ReactNode }) {
  return (
    <Box
      data-testid="state-tile"
      sx={{
        width: 48,
        height: 48,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: `${tokens.primary}${alphas.wash}`,
        color: tokens.primary,
        display: "grid",
        placeItems: "center",
        mb: 0.5,
        "& .MuiSvgIcon-root": { fontSize: 24, color: "inherit" },
      }}
    >
      {children}
    </Box>
  );
}
