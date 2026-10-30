import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { SPINNER_DELAY_MS } from "@/lib/theme/motion";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The pill shown while the points load; it fades in after a short delay. */
export function GaugeMapLoading() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 1,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.pill}px`,
        boxShadow: tokens.elevation.e2,
        px: 1.5,
        py: 0.75,
        animation: `pm-spinner-in ${theme.tokens.motion.fast}ms ${theme.tokens.motion.easeOut} ${SPINNER_DELAY_MS}ms backwards`,
        "@keyframes pm-spinner-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      <CircularProgress size={16} />
      <Typography variant="caption">Loading gauges…</Typography>
    </Box>
  );
}

/** A state note floating over the map: the map has nothing to show, so the
 * legend gives way to it. */
export function GaugeMapNote({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10,
        width: "min(320px, calc(100% - 32px))",
        bgcolor: theme.tokens.surface,
        borderRadius: `${theme.tokens.radii.md}px`,
        boxShadow: theme.tokens.elevation.e2,
      }}
    >
      {children}
    </Box>
  );
}
