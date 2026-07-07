import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";
import type { components } from "@/lib/api/schema";
import { useWaterStatus } from "@/lib/hooks/useWaterways";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

function maxLevel(levels: WaterLevel[]): WaterLevel {
  return levels.reduce<WaterLevel>((best, cur) => {
    return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
  }, "empty");
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

  const computedLevel = maxLevel(waterStatus.ranges.map((r) => r.level));
  const cfg = levelConfig[computedLevel];

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
        borderColor: "border" in cfg ? cfg.border : undefined,
        minWidth: 32,
      }}
    />
  );
}

export type { WaterLevel };
export { maxLevel };
