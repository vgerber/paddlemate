import type { WaterLevel } from "@/lib/waterLevel";

const FILTER_LEVELS: WaterLevel[] = ["low", "medium", "high"];

/** The `water` search param: only low, medium and high are filterable, each
 * once; anything else (a hand-edited URL) is dropped. */
export function parseWaterLevels(value: unknown): WaterLevel[] | undefined {
  const raw = Array.isArray(value) ? value : [value];
  const levels = FILTER_LEVELS.filter((level) => raw.includes(level));
  return levels.length > 0 ? levels : undefined;
}
