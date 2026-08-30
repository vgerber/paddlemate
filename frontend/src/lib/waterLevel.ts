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

/** Chip styling per level: the readable text/bg pair from the theme's
 * level tokens (the marker hues are for map geometry, not text). */
function chip(level: {
  label: string;
  text: string;
  bg: string;
  border?: string;
}) {
  return {
    label: level.label,
    color: level.text,
    bgcolor: level.bg,
    ...(level.border ? { border: level.border } : {}),
  };
}

export const levelConfig = {
  empty: chip(theme.tokens.levels.empty),
  low: chip(theme.tokens.levels.low),
  medium: chip(theme.tokens.levels.medium),
  high: chip(theme.tokens.levels.high),
} satisfies Record<
  WaterLevel,
  { label: string; color: string; bgcolor: string; border?: string }
>;

/** True when the range has at least one threshold configured. */
export function isCalibrated(r: WaterRangeWithStatus): boolean {
  return r.range_low != null || r.range_medium != null || r.range_high != null;
}
