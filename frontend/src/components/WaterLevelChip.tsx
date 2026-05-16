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
  empty: { label: "Empty", color: "#888", bgcolor: "transparent" },
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

  // No gauge configured for this section — don't show a chip
  if (ranges.length === 0) return null;

  const level = maxLevel(ranges.map((r) => r.level));
  const cfg = LEVEL_CONFIG[level];

  return (
    <Chip
      label={cfg.label}
      size="small"
      variant={level === "empty" ? "outlined" : "filled"}
      sx={{
        ml: 0.5,
        fontSize: "0.65rem",
        fontWeight: 400,
        color: cfg.color,
        bgcolor: cfg.bgcolor,
        borderColor: level === "empty" ? "rgba(0,0,0,0.18)" : undefined,
        minWidth: 32,
      }}
    />
  );
}
