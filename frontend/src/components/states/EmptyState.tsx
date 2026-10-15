import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** The icon in its soft teal tile: the one drawing every empty, signed-out
 * and failed state shares. */
export function StateTile({ children }: { children: ReactNode }) {
  return (
    <Box
      data-testid="empty-state-tile"
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

/** Icon in a soft tile plus one line of text - the design language's empty
 * state. The FAB is the call to action, so no buttons here. */
export default function EmptyState({
  icon = <InboxOutlinedIcon />,
  title,
  caption,
  py = 6,
  pt = py,
  pb = py,
}: {
  icon?: ReactNode;
  title: string;
  caption?: string;
  py?: number;
  /** Override the top or bottom of `py`. */
  pt?: number;
  pb?: number;
}) {
  return (
    <Box
      data-testid="empty-state"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.75,
        pt,
        pb,
        px: 2,
        textAlign: "center",
      }}
    >
      <StateTile>{icon}</StateTile>
      <Typography
        variant="body2"
        sx={{
          fontSize: "0.875rem",
          lineHeight: "20px",
          color: "text.secondary",
        }}
      >
        {title}
      </Typography>
      {caption && (
        <Typography variant="body2" color="textSecondary">
          {caption}
        </Typography>
      )}
    </Box>
  );
}
