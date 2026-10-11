import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { StateTile } from "@/components/states/EmptyState";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** A calm centred card for the signed-out and sign-in-failed states: the
 * state tile, one line, an optional caption and the actions beneath. */
export default function SignInCard({
  icon,
  title,
  caption,
  children,
}: {
  icon: ReactNode;
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", pt: 8, px: 2 }}>
      <Box
        data-testid="sign-in-card"
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
        <StateTile>{icon}</StateTile>
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
