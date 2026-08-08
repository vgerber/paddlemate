import type { components } from "@/lib/api/schema";
import { theme } from "@/lib/theme";

export type WaterLevel = components["schemas"]["WaterLevel"];
type WaterRangeWithStatus = components["schemas"]["WaterRangeWithStatus"];

/** Ascending severity - index position is the comparison key. */
export const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

/** The most severe of the given levels ("empty" when none). */
export function maxLevel(levels: WaterLevel[]): WaterLevel {
  return levels.reduce<WaterLevel>((best, cur) => {
    return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
  }, "empty");
}

/** Chip styling per level, from the theme's water tokens. */
export const levelConfig = {
  empty: theme.tokens.waterEmpty,
  low: theme.tokens.waterLow,
  medium: theme.tokens.waterMedium,
  high: theme.tokens.waterHigh,
} satisfies Record<
  WaterLevel,
  { label: string; color: string; bgcolor: string; border?: string }
>;

/** True when the range has at least one threshold configured. */
export function isCalibrated(r: WaterRangeWithStatus): boolean {
  return r.range_low != null || r.range_medium != null || r.range_high != null;
}
