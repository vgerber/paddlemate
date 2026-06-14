import Chip from "@mui/material/Chip";
import type { components } from "@/lib/api/schema";
import { useWaterStatus } from "@/lib/hooks/useWaterways";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

function maxLevel(levels: WaterLevel[]): WaterLevel {
  return levels.reduce<WaterLevel>((best, cur) => {
    return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
  }, "empty");
}

const LEVEL_CONFIG: Record<
  WaterLevel,
  { label: string; color: string; bgcolor: string; border?: string }
> = {
  empty: {
    label: "E",
    color: "rgba(255,255,255,0.35)",
    bgcolor: "transparent",
    border: "rgba(255,255,255,0.18)",
  },
  low: {
    label: "L",
    color: "#81c784",
    bgcolor: "rgba(129,199,132,0.15)",
  },
  medium: {
    label: "M",
    color: "#ffb74d",
    bgcolor: "rgba(255,183,77,0.15)",
  },
  high: {
    label: "H",
    color: "#e57373",
    bgcolor: "rgba(229,115,115,0.15)",
  },
};

interface WaterLevelChipProps {
  waterwayId: number | null;
  sectionId: number | null;
}

export default function WaterLevelChip({
  waterwayId,
  sectionId,
}: WaterLevelChipProps) {
  const { data: waterStatus, isLoading } = useWaterStatus(waterwayId, sectionId);

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

  const computedLevel = maxLevel(waterStatus.ranges.map((r) => r.level));
  const cfg = LEVEL_CONFIG[computedLevel];

  return (
    <Chip
      label={cfg.label}
      size="small"
      variant={computedLevel === "empty" ? "outlined" : "filled"}
      sx={{
        ml: 0.5,
        fontSize: "0.65rem",
        fontWeight: 400,
        color: cfg.color,
        bgcolor: cfg.bgcolor,
        borderColor: cfg.border,
        minWidth: 32,
      }}
    />
  );
}

export type { WaterLevel };
export { LEVEL_CONFIG, maxLevel };
