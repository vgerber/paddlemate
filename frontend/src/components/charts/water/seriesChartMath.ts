import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { ChartRow } from "./summary";
import { periodForSpan } from "./summary";
import type { CustomRange, DescentSpan, TimeRange } from "./types";

/** A window at least this long is labelled by day, a shorter one by clock. */
export const DAY_LABELS_MS = 2 * 24 * 3600 * 1000;

export interface ScrubPoint {
  time: number;
  value: number;
  /** The bucket's extremes and length in seconds; absent for a raw reading. */
  low?: number;
  high?: number;
  bucket?: number;
}

/** The scrub readout of a drawn point: the average, with the bucket's
 * extremes when the data is bucketed. */
export function scrubOf(row: ChartRow & { value: number }): ScrubPoint {
  if (row.bucket === 0 || row.low == null || row.high == null) {
    return { time: row.time, value: row.value };
  }
  return {
    time: row.time,
    value: row.value,
    low: row.low,
    high: row.high,
    bucket: row.bucket,
  };
}

/** Midnight ticks across the window, stepped so about four fit: a day label
 * never repeats. */
export function dayTicks([from, to]: [number, number], target = 4): number[] {
  const days = differenceInCalendarDays(to, from);
  const step = Math.max(1, Math.ceil(days / target));
  const ticks: number[] = [];
  for (
    let d = addDays(startOfDay(from), 1);
    d.getTime() <= to;
    d = addDays(d, step)
  ) {
    ticks.push(d.getTime());
  }
  return ticks;
}

export function formatTick(v: number): string {
  return Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(1)}k`
    : String(Math.round(v));
}

/** Padded y range for a set of values (falling back to the thresholds alone
 * when there are no values, so an empty chart still frames its calibration),
 * or null when there is nothing at all. */
export function yDomainOf(
  values: number[],
  thresholds: number[],
): { lo: number; hi: number } | null {
  const all = values.length > 0 ? [...values, ...thresholds] : thresholds;
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const margin = span * 0.2;
  return {
    lo: Math.max(lo - margin, lo >= 0 ? 0 : -Infinity),
    hi: hi + margin,
  };
}

export interface VisibleSpan {
  id: number;
  x1: number;
  x2: number;
  name?: string;
}

/** Descent bands clamped to the axis; very short runs get a minimum width so
 * they stay visible in long time ranges. */
export function visibleDescentSpans(
  spans: DescentSpan[] | undefined,
  [axisMin, axisMax]: [number, number],
): VisibleSpan[] {
  if (!spans?.length) return [];
  const minWidth = (axisMax - axisMin) * 0.005;
  return spans
    .filter((s) => s.end >= axisMin && s.start <= axisMax)
    .map((s) => {
      let x1 = Math.max(s.start, axisMin);
      let x2 = Math.min(s.end, axisMax);
      if (x2 - x1 < minWidth) {
        const mid = (x1 + x2) / 2;
        x1 = Math.max(mid - minWidth / 2, axisMin);
        x2 = Math.min(mid + minWidth / 2, axisMax);
      }
      return { id: s.id, x1, x2, name: s.name };
    });
}

/** The period whose axis ticks the rail uses. A custom range borrows the
 * preset nearest its span, but only once it covers days: a few hours read
 * better with plain clock ticks. */
export function tickPeriodOf(
  timeRange: TimeRange | undefined,
  customRange: CustomRange | null,
  plotSpan: number,
): TimeRange | null {
  if (!customRange) return timeRange ?? null;
  return plotSpan >= DAY_LABELS_MS ? periodForSpan(plotSpan) : null;
}

/** The newest drawn reading, or null when every row is a gap. */
export function lastReading(
  rows: ChartRow[],
): { time: number; value: number } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i].value;
    if (v !== null) return { time: rows[i].time, value: v };
  }
  return null;
}
