import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";
import { levelConfig, type WaterLevel } from "@/lib/waterLevel";

const { tokens } = theme;

/** A level pill for a reading stored with a log. WaterLevelChip fetches the
 * live level of a section and its pill is not exported, so this matches its
 * look (24px, dot, wash; high solid; empty hollow) for stored values. */
export default function LevelPill({
  level,
  children,
}: {
  level: WaterLevel;
  children: ReactNode;
}) {
  const cfg = levelConfig[level];
  const hollow = level === "empty";
  return (
    <Box
      component="span"
      data-level={level}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        gap: 0.75,
        height: 24,
        boxSizing: "border-box",
        pl: 1,
        pr: 1.25,
        borderRadius: `${tokens.radii.pill}px`,
        border: "1px solid",
        borderColor: hollow ? tokens.levels.empty.border : "transparent",
        color: cfg.color,
        bgcolor: hollow ? "transparent" : cfg.bgcolor,
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <Box
        component="span"
        sx={{
          width: 7,
          height: 7,
          boxSizing: "border-box",
          flexShrink: 0,
          borderRadius: "50%",
          ...(hollow
            ? { border: "2px solid currentColor" }
            : { bgcolor: "currentColor" }),
        }}
      />
      {children}
    </Box>
  );
}
