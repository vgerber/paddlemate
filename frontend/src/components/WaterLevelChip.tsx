import Chip from "@mui/material/Chip";
import type { components } from "@/lib/api/schema";
import { formatReading } from "@/lib/format";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { isCalibrated, levelConfig, maxLevel } from "@/lib/waterLevel";

type WaterRangeWithStatus = components["schemas"]["WaterRangeWithStatus"];

function readingLabel(r: WaterRangeWithStatus): string | null {
  if (r.latest_reading == null) return null;
  return formatReading(r.latest_reading.value, r.series.unit);
}

interface WaterLevelChipProps {
  waterwayId: number | null;
  sectionId: number | null;
}

export default function WaterLevelChip({
  waterwayId,
  sectionId,
}: WaterLevelChipProps) {
  const { data: waterStatus, isLoading } = useWaterStatus(
    waterwayId,
    sectionId,
  );

  if (isLoading || waterStatus === undefined) {
    return (
      <Chip
        label="–"
        size="small"
        sx={{ ml: 0.5, opacity: 0.4, fontSize: "0.65rem", minWidth: 32 }}
      />
    );
  }

  // No gauge configured for this section - don't show a chip
  if (waterStatus.ranges.length === 0) return null;

  const calibrated = waterStatus.ranges.filter(isCalibrated);

  // Gauge attached but no calibrated range - show the plain reading
  if (calibrated.length === 0) {
    const reading = waterStatus.ranges.map(readingLabel).find(Boolean);
    if (!reading) return null;
    return (
      <Chip
        label={reading}
        size="small"
        variant="outlined"
        sx={{ ml: 0.5, fontSize: "0.65rem", color: "text.secondary" }}
      />
    );
  }

  // Calibrated but no current reading (silent or never-polled gauge): the
  // backend's level would read as "empty" (= too low to paddle), which is
  // misleading when the truth is "unknown" - show a neutral dash instead.
  if (calibrated.every((r) => r.latest_reading == null)) {
    return (
      <Chip
        label="–"
        title="No current reading"
        size="small"
        variant="outlined"
        sx={{
          ml: 0.5,
          opacity: 0.5,
          fontSize: "0.65rem",
          minWidth: 32,
          color: "text.secondary",
        }}
      />
    );
  }

  const computedLevel = maxLevel(calibrated.map((r) => r.level));
  const cfg = levelConfig[computedLevel];
  // Reading from the range that determined the level, if it has one
  const source =
    calibrated.find(
      (r) => r.level === computedLevel && r.latest_reading != null,
    ) ?? calibrated.find((r) => r.latest_reading != null);
  const reading = source ? readingLabel(source) : null;

  return (
    <Chip
      label={reading ?? cfg.label}
      size="small"
      variant={computedLevel === "empty" ? "outlined" : "filled"}
      sx={{
        ml: 0.5,
        fontSize: "0.65rem",
        fontWeight: 400,
        color: cfg.color,
        bgcolor: cfg.bgcolor,
        borderColor: "border" in cfg ? cfg.border : undefined,
        minWidth: 32,
      }}
    />
  );
}
