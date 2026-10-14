import type { components } from "@/lib/api/schema";
import { isCalibrated, maxLevel, type WaterLevel } from "@/lib/waterLevel";

type WaterStatus = components["schemas"]["SectionWaterStatus"];

/** A dot is a level, or "unknown" when there is nothing trustworthy to say. */
export type DotLevel = WaterLevel | "unknown";

/** A reading older than this no longer says what the water does now. */
export const STALE_READING_MS = 24 * 60 * 60 * 1000;

/** The level a section's dot shows. No gauge, no thresholds, no reading or a
 * stale one is unknown - the backend's "empty" for a silent gauge would read
 * as too low to paddle. */
export function dotLevel(
  status: WaterStatus | undefined,
  now: number = Date.now(),
): DotLevel {
  if (!status) return "unknown";
  const fresh = status.ranges.filter(
    (r) =>
      isCalibrated(r) &&
      r.latest_reading != null &&
      now - Date.parse(r.latest_reading.measured_at) <= STALE_READING_MS,
  );
  if (fresh.length === 0) return "unknown";
  return maxLevel(fresh.map((r) => r.level));
}

/** How many dots of each level there are. */
export function countLevels(levels: DotLevel[]): Record<DotLevel, number> {
  const counts: Record<DotLevel, number> = {
    unknown: 0,
    empty: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
  for (const l of levels) counts[l] += 1;
  return counts;
}

/** The spoken form of a row of dots, e.g. "2 of 4 sections running: 1 low,
 * 1 high; 1 too low; 1 no current reading". Empty for no sections. */
export function dotsLabel(levels: DotLevel[]): string {
  if (levels.length === 0) return "";
  const c = countLevels(levels);
  const running = c.low + c.medium + c.high;
  const noun = levels.length === 1 ? "section" : "sections";
  const parts = (["low", "medium", "high"] as const)
    .filter((l) => c[l] > 0)
    .map((l) => `${c[l]} ${l}`);
  const head = `${running} of ${levels.length} ${noun} running`;
  const tail = [
    parts.join(", "),
    c.empty > 0 ? `${c.empty} too low` : "",
    c.unknown > 0 ? `${c.unknown} no current reading` : "",
  ].filter(Boolean);
  return tail.length ? `${head}: ${tail.join("; ")}` : head;
}
