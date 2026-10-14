import type { WaterLevel } from "@/lib/waterLevel";

const FILTER_LEVELS: WaterLevel[] = ["low", "medium", "high"];

/** The `water` search param: only low, medium and high are filterable, each
 * once; anything else (a hand-edited URL) is dropped. Reads the comma form
 * (`low,high`) and the JSON array form. */
export function parseWaterLevels(value: unknown): WaterLevel[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((v) => v.trim())
      : [value];
  const levels = FILTER_LEVELS.filter((level) => raw.includes(level));
  return levels.length > 0 ? levels : undefined;
}

/** The one form the app writes: `low,high`, in a fixed order. */
export function formatWaterLevels(levels: WaterLevel[]): string | undefined {
  const kept = parseWaterLevels(levels);
  return kept ? kept.join(",") : undefined;
}
