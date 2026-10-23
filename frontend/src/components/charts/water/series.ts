import type { WaterRangeWithStatus } from "@/lib/api";
import { isCalibrated, type WaterLevel } from "@/lib/waterLevel";

/** Distinct measurement types present in the ranges, in order of appearance. */
export function measurementTypesOf(ranges: WaterRangeWithStatus[]): string[] {
  return [...new Set(ranges.map((r) => r.series.measurement_type))];
}

/** The measurement type charted: the chosen one if the ranges have it, else
 * the first calibrated type, else the first type. */
export function activeMeasurementType(
  ranges: WaterRangeWithStatus[],
  chosen?: string | null,
): string | null {
  const types = measurementTypesOf(ranges);
  if (chosen != null && types.includes(chosen)) return chosen;
  const calibrated = ranges.find(isCalibrated);
  return calibrated?.series.measurement_type ?? types[0] ?? null;
}

/** One group per gauge series of the active type. `primary` is the range
 * whose thresholds the chart draws: the preferred feature's if calibrated,
 * else the first calibrated one, else the first. */
export function seriesGroups(
  ranges: WaterRangeWithStatus[],
  type: string | null,
  preferredFeatureId?: number | null,
) {
  const visible = type
    ? ranges.filter((r) => r.series.measurement_type === type)
    : ranges;
  const bySeries = new Map<number, WaterRangeWithStatus[]>();
  for (const r of visible) {
    const group = bySeries.get(r.series.id);
    if (group) group.push(r);
    else bySeries.set(r.series.id, [r]);
  }
  return [...bySeries.values()].map((group) => ({
    primary:
      (preferredFeatureId != null
        ? group.find(
            (r) => r.feature_id === preferredFeatureId && isCalibrated(r),
          )
        : undefined) ??
      group.find(isCalibrated) ??
      group[0],
    group,
  }));
}

/** The first range of each measurement type, for the reading chips. */
export function readingPerType(
  ranges: WaterRangeWithStatus[],
  preferredFeatureId?: number | null,
) {
  return measurementTypesOf(ranges).flatMap((type) => {
    const first = seriesGroups(ranges, type, preferredFeatureId)[0];
    return first ? [{ type, range: first.primary }] : [];
  });
}

type Thresholds = Pick<
  WaterRangeWithStatus,
  "range_low" | "range_medium" | "range_high"
>;

/** The level a reading falls in, by the same rule as the API's
 * `WaterLevel::from_reading`: at or above a threshold, the highest one wins. */
export function levelAt(value: number, r: Thresholds): WaterLevel {
  if (r.range_high != null && value >= r.range_high) return "high";
  if (r.range_medium != null && value >= r.range_medium) return "medium";
  if (r.range_low != null && value >= r.range_low) return "low";
  return "empty";
}

/** The reading a chart key moves the keyboard to, as an index into `times`
 * (oldest first), or null for a key that does nothing. `at` is the reading
 * now shown, by time: an index would point at another reading once the data
 * is refetched or the window slides. Without one, the arrows start at the
 * newest reading. */
export function stepReading(
  times: number[],
  at: number | null,
  key: string,
): number | null {
  if (times.length === 0) return null;
  const last = times.length - 1;
  const now = at == null ? -1 : times.indexOf(at);
  const from = now >= 0 ? now : last;
  const step = now >= 0 ? 1 : 0;
  const target: Record<string, number> = {
    ArrowLeft: from - step,
    ArrowRight: from + step,
    PageDown: from - 10,
    PageUp: from + 10,
    Home: 0,
    End: last,
  };
  if (!(key in target)) return null;
  return Math.min(Math.max(target[key], 0), last);
}
