import Chip from "@mui/material/Chip";
import type { WaterRangeWithStatus } from "@/lib/api";
import type { components } from "@/lib/api/schema";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

function maxLevel(levels: WaterLevel[]): WaterLevel {
  return levels.reduce<WaterLevel>((best, cur) => {
    return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
  }, "empty");
}

const LEVEL_CONFIG: Record<
  WaterLevel,
  { label: string; color: string; bgcolor: string }
> = {
  empty: { label: "–", color: "text.disabled", bgcolor: "action.hover" },
  low: { label: "Low", color: "success.dark", bgcolor: "success.light" },
  medium: { label: "Medium", color: "warning.dark", bgcolor: "warning.light" },
  high: { label: "High", color: "error.dark", bgcolor: "error.light" },
};

interface WaterLevelChipProps {
  ranges: WaterRangeWithStatus[] | undefined;
  loading?: boolean;
}

export default function WaterLevelChip({
  ranges,
  loading,
}: WaterLevelChipProps) {
  if (loading || ranges === undefined) {
    return (
      <Chip
        label="–"
        size="small"
        sx={{ ml: 0.5, opacity: 0.4, fontSize: "0.65rem", minWidth: 32 }}
      />
    );
  }

  const level = maxLevel(ranges.map((r) => r.level));
  const cfg = LEVEL_CONFIG[level];

  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        ml: 0.5,
        fontSize: "0.65rem",
        fontWeight: 600,
        color: cfg.color,
        bgcolor: cfg.bgcolor,
        border: "none",
        minWidth: 32,
      }}
    />
  );
}
