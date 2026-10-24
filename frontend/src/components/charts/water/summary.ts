import {
  addYears,
  endOfDay,
  format,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import type { ReadingSummaryItem } from "@/lib/api";
import type { CustomRange, TimeRange } from "./types";

/** The API clamps `points` to this; asking for more is pointless. */
const MIN_POINTS = 10;
const MAX_POINTS = 1000;
/** One point per this many px of plot: dense enough to read as a line,
 * sparse enough to stay light. */
const POINT_PX = 2.5;
/** Widths round up to this many points so a resize does not refetch. */
const POINT_STEP = 50;

/** How many points to ask for a plot `width` px wide. */
export function pointsForWidth(width: number): number {
  const wanted = Math.ceil(width / POINT_PX / POINT_STEP) * POINT_STEP;
  return Math.min(Math.max(wanted, MIN_POINTS), MAX_POINTS);
}

/** One drawn point: the bucket's average, and its extremes when the data is
 * bucketed. A null value is a gap. */
export interface ChartRow {
  time: number;
  value: number | null;
  low: number | null;
  high: number | null;
  /** [low, high] for the band; null for a gap and for raw readings. */
  band: [number, number] | null;
  /** Bucket length in seconds; 0 for a raw reading. */
  bucket: number;
}

/** Rows for the chart, oldest first. A hole in the data is closed by a null
 * row so the line breaks there: a missing bucket for bucketed data, a
 * stretch several times the usual spacing for raw readings. */
export function toChartRows(
  items: ReadingSummaryItem[],
  bucketSeconds: number,
): ChartRow[] {
  const times = items.map((i) => new Date(i.measured_at).getTime());
  const steps = times.slice(1).map((t, i) => t - times[i]);
  const median = [...steps].sort((a, b) => a - b)[
    Math.floor((steps.length - 1) / 2)
  ];
  const gapAfter = bucketSeconds > 0 ? median * 1.5 : median * 5;
  const rows: ChartRow[] = [];
  items.forEach((item, i) => {
    if (i > 0 && steps[i - 1] > gapAfter) {
      rows.push({
        time: times[i - 1] + 1,
        value: null,
        low: null,
        high: null,
        band: null,
        bucket: bucketSeconds,
      });
    }
    rows.push({
      time: times[i],
      value: item.value,
      low: item.min,
      high: item.max,
      band: bucketSeconds > 0 ? [item.min, item.max] : null,
      bucket: bucketSeconds,
    });
  });
  return rows;
}

/** When the gauge's data begins, if that is clearly after the asked-for
 * start (more than a few buckets, or 2% of the span); else null. */
export function readingsStart(
  firstTime: number | undefined,
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): number | null {
  if (firstTime == null) return null;
  const slack = Math.max(bucketSeconds * 2000, (toMs - fromMs) * 0.02);
  return firstTime - fromMs > slack ? firstTime : null;
}

/** Why a From/To pair (calendar days, "2026-03-12") cannot be used, or null.
 * `today` is the viewer's calendar day. */
export function rangeError(
  from: string,
  to: string,
  today: string,
): string | null {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!isValid(a) || !isValid(b)) return "Pick both dates.";
  if (to > today) return "To cannot be after today.";
  if (!(from < to)) return "From must be before To.";
  if (isBefore(addYears(a, 5), b)) return "Pick at most 5 years.";
  return null;
}

/** The last 30 days as the dialog's starting From and To. */
export function defaultDays(now: Date = new Date()): {
  from: string;
  to: string;
} {
  return {
    from: format(subDays(now, 30), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

/** A day pair as the range it covers: from the start of From to the end of
 * To, which never reaches past `now`. */
export function rangeOfDays(
  from: string,
  to: string,
  now: Date = new Date(),
): CustomRange {
  const end = endOfDay(parseISO(to));
  return {
    from: startOfDay(parseISO(from)).toISOString(),
    to: (end > now ? now : end).toISOString(),
  };
}

/** A calendar day (viewer's timezone) of an instant: "2026-03-12". */
export function dayOf(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

/** The preset whose axis suits a span (ticks and labels). */
export function periodForSpan(spanMs: number): TimeRange {
  const day = 24 * 3600 * 1000;
  if (spanMs <= 2 * day) return "24h";
  if (spanMs <= 10 * day) return "7d";
  if (spanMs <= 45 * day) return "1m";
  if (spanMs <= 120 * day) return "3m";
  if (spanMs <= 240 * day) return "6m";
  return "1y";
}

/** The range a mouse drag over the plot selects, or null for a stray click.
 * The ends may come in either order. */
export function dragRange(
  t0: number,
  t1: number,
  minSpanMs: number,
): CustomRange | null {
  const [a, b] = t0 <= t1 ? [t0, t1] : [t1, t0];
  if (b - a < minSpanMs) return null;
  return { from: new Date(a).toISOString(), to: new Date(b).toISOString() };
}

const HOUR = 3600 * 1000;

/** How long a summary stays fresh: a range that ended before today never
 * changes, one that runs to now is refetched after five minutes. */
export function summaryStaleTime(
  to: string | undefined,
  now: number = Date.now(),
): number {
  if (to != null && new Date(to).getTime() < startOfDay(now).getTime()) {
    return 24 * HOUR;
  }
  return 5 * 60 * 1000;
}
