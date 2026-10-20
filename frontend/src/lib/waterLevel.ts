import type { ExpressionSpecification } from "maplibre-gl";
import type { components } from "@/lib/api/schema";
import { isStale } from "@/lib/staleness";
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

const LEVEL_WORDS = { low: "Low", medium: "Medium", high: "High" } as const;

/** The level as a word: "Low", "Medium", "High". */
export function levelWord(level: Exclude<WaterLevel, "empty">): string {
  return LEVEL_WORDS[level];
}

/** The level's colour as ink on a light ground (a chart line, a word on the
 * plot). High's text colour is white for its solid pill, so its ink is the
 * pill colour itself. */
export function levelInk(level: Exclude<WaterLevel, "empty">): string {
  const t = theme.tokens.levels[level];
  return level === "high" ? t.bg : t.text;
}

/** True when the range has at least one threshold configured. */
export function isCalibrated(r: WaterRangeWithStatus): boolean {
  return r.range_low != null || r.range_medium != null || r.range_high != null;
}

/** The ranges that say what the water does now: calibrated, with a reading
 * that is not stale. */
export function freshRanges(
  ranges: WaterRangeWithStatus[],
  now: number = Date.now(),
): WaterRangeWithStatus[] {
  return ranges.filter(
    (r) =>
      isCalibrated(r) &&
      r.latest_reading != null &&
      !isStale(r.latest_reading.measured_at, now, r.gauge.fetch_interval_secs),
  );
}

/** The level a section shows now: the worst across its fresh calibrated
 * ranges, or null when there is nothing trustworthy to say (the backend's
 * "empty" for a silent gauge would read as too low to paddle). */
export function currentLevel(
  ranges: WaterRangeWithStatus[],
  now: number = Date.now(),
): WaterLevel | null {
  const fresh = freshRanges(ranges, now);
  return fresh.length ? maxLevel(fresh.map((r) => r.level)) : null;
}

/** The level's saturated hue for map geometry, dots and legends (text uses
 * `levelConfig`). */
export function levelMarkerColor(level: WaterLevel): string {
  return theme.tokens.levels[level].marker;
}

/** A MapLibre expression colouring a feature by its `level` property
 * (unset or unknown reads as empty). */
export const LEVEL_MARKER_MATCH: ExpressionSpecification = [
  "match",
  ["get", "level"],
  "low",
  levelMarkerColor("low"),
  "medium",
  levelMarkerColor("medium"),
  "high",
  levelMarkerColor("high"),
  levelMarkerColor("empty"),
];
