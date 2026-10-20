import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import StateTile from "./StateTile";

/** The centred column behind the empty and failed states: the tile, one
 * line, an optional caption and the actions beneath. `pt` and `pb` default
 * to `py`. */
export default function StateLayout({
  icon,
  title,
  caption,
  py,
  pt = py,
  pb = py,
  children,
  ...rest
}: {
  icon: ReactNode;
  title: string;
  caption?: string;
  py: number;
  pt?: number;
  pb?: number;
  children?: ReactNode;
  "data-testid"?: string;
  role?: string;
}) {
  return (
    <Box
      {...rest}
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
      {children}
    </Box>
  );
}
