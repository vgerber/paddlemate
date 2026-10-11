import type { components } from "@/lib/api/schema";
import { uniqueSnapshotsBySeries } from "@/lib/descents";
import { formatReading } from "@/lib/format";
import { maxLevel, type WaterLevel } from "@/lib/waterLevel";

type DescentSection = components["schemas"]["DescentSection"];

/** The water level a descent was paddled at: the highest level over its
 * sections' snapshots, with a reading when one gauge stands behind them all.
 * Mixed gauges give the level word, since one number would mislead. */
export function levelAtTime(
  sections: DescentSection[],
): { level: WaterLevel; label: string } | null {
  const snaps = sections.flatMap((s) =>
    uniqueSnapshotsBySeries(s.water_snapshots ?? []),
  );
  if (snaps.length === 0) return null;
  const level = maxLevel(snaps.map((s) => s.level));
  const sameGauge = snaps.every((s) => s.series_id === snaps[0].series_id);
  const reading = sameGauge
    ? (snaps.find((s) => s.level === level && s.value != null) ??
      snaps.find((s) => s.value != null))
    : undefined;
  return {
    level,
    label:
      reading?.value != null
        ? formatReading(reading.value, reading.unit)
        : `${level[0].toUpperCase()}${level.slice(1)}`,
  };
}
