import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";
import { StateTile } from "./EmptyState";

const { tokens } = theme;

/** The calm centred card behind the signed-out and sign-in-failed states: the
 * state tile, one line, an optional caption and the actions beneath. */
export default function StateCard({
  icon,
  title,
  caption,
  pt = 8,
  children,
}: {
  icon?: ReactNode;
  title: string;
  caption?: string;
  /** Top padding: less inside a panel than on a page of its own. */
  pt?: number;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", pt, px: 2 }}>
      <Box
        data-testid="state-card"
        sx={{
          width: "100%",
          maxWidth: 400,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          p: 3,
          textAlign: "center",
          bgcolor: tokens.surfaceLowest,
          borderRadius: `${tokens.radii.md}px`,
          boxShadow: tokens.elevation.e1,
        }}
      >
        {icon && <StateTile>{icon}</StateTile>}
        <Typography variant="h6">{title}</Typography>
        {caption && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ wordBreak: "break-word" }}
          >
            {caption}
          </Typography>
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            mt: 1,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
