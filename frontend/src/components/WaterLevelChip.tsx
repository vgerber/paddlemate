import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";
import type { components } from "@/lib/api/schema";
import { useWaterStatus } from "@/lib/hooks/useWaterways";

type WaterLevel = components["schemas"]["WaterLevel"];
type WaterRangeWithStatus = components["schemas"]["WaterRangeWithStatus"];

const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

function maxLevel(levels: WaterLevel[]): WaterLevel {
  return levels.reduce<WaterLevel>((best, cur) => {
    return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
  }, "empty");
}

function isCalibrated(r: WaterRangeWithStatus): boolean {
  return r.range_low != null || r.range_medium != null || r.range_high != null;
}

function readingLabel(r: WaterRangeWithStatus): string | null {
  if (r.latest_reading == null) return null;
  return `${Number(r.latest_reading.value.toFixed(1))} ${r.series.unit}`;
}

interface WaterLevelChipProps {
  waterwayId: number | null;
  sectionId: number | null;
}

export default function WaterLevelChip({
  waterwayId,
  sectionId,
}: WaterLevelChipProps) {
  const { tokens } = useTheme();
  const { data: waterStatus, isLoading } = useWaterStatus(
    waterwayId,
    sectionId,
  );

  const levelConfig = {
    empty: tokens.waterEmpty,
    low: tokens.waterLow,
    medium: tokens.waterMedium,
    high: tokens.waterHigh,
  } satisfies Record<
    WaterLevel,
    { label: string; color: string; bgcolor: string; border?: string }
  >;

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

export type { WaterLevel };
export { maxLevel };
