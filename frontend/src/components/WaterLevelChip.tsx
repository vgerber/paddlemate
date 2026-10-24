import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import type { components } from "@/lib/api/schema";
import { formatReading } from "@/lib/format";
import { useRowWaterStatus } from "@/lib/hooks/useWaterStatus";
import { theme } from "@/lib/theme";
import {
  currentLevel,
  freshRanges,
  isCalibrated,
  levelConfig,
  type WaterLevel,
} from "@/lib/waterLevel";

const { tokens } = theme;

type WaterRangeWithStatus = components["schemas"]["WaterRangeWithStatus"];

function readingLabel(r: WaterRangeWithStatus): string | null {
  if (r.latest_reading == null) return null;
  return formatReading(r.latest_reading.value, r.series.unit);
}

/** The pill: 24px, a dot and a label. Low and medium are coloured text on a
 * wash, high is solid with white text, empty is hollow. */
export function LevelPill({
  level,
  children,
  title,
  dot = true,
}: {
  level: WaterLevel | "none";
  children: ReactNode;
  title?: string;
  dot?: boolean;
}) {
  const cfg = level === "none" ? levelConfig.empty : levelConfig[level];
  const hollow = level === "empty" || level === "none";
  const outline =
    level === "empty" ? tokens.levels.empty.border : tokens.outlineVariant;
  return (
    <Box
      component="span"
      data-level={level}
      title={title}
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
        borderColor: hollow ? outline : "transparent",
        color: level === "none" ? tokens.onSurfaceVariant : cfg.color,
        bgcolor: hollow ? "transparent" : cfg.bgcolor,
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <Box
          component="span"
          data-dot
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
      )}
      {children}
    </Box>
  );
}

interface WaterLevelChipProps {
  waterwayId: number | null;
  sectionId: number | null;
}

export default function WaterLevelChip({
  waterwayId,
  sectionId,
}: WaterLevelChipProps) {
  const { data: waterStatus, isLoading } = useRowWaterStatus(
    waterwayId,
    sectionId,
  );

  if (isLoading || waterStatus === undefined) {
    return (
      <LevelPill level="none" dot={false}>
        –
      </LevelPill>
    );
  }

  // No gauge configured for this section - don't show a pill
  if (waterStatus.ranges.length === 0) return null;

  const calibrated = waterStatus.ranges.filter(isCalibrated);

  // Gauge attached but no calibrated range - show the plain reading
  if (calibrated.length === 0) {
    const reading = waterStatus.ranges.map(readingLabel).find(Boolean);
    if (!reading) return null;
    return (
      <LevelPill level="none" dot={false}>
        {reading}
      </LevelPill>
    );
  }

  // Calibrated but no fresh reading (silent, stale or never-polled gauge):
  // the backend's level would read as "empty" (= too low to paddle), which is
  // misleading when the truth is "unknown" - show a neutral dash instead.
  const level = currentLevel(calibrated);
  if (level === null) {
    return (
      <LevelPill level="none" dot={false} title="No current reading">
        –
      </LevelPill>
    );
  }

  // Reading from the range that determined the level
  const source = freshRanges(calibrated).find((r) => r.level === level);
  const reading = source ? readingLabel(source) : null;

  return (
    <LevelPill level={level}>{reading ?? levelConfig[level].label}</LevelPill>
  );
}
