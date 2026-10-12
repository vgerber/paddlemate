const HOUR = 3_600_000;

export interface TrendReading {
  measured_at: string;
  value: number;
}

export interface Trend {
  direction: "rising" | "falling" | "steady";
  /** Absolute change over the span. */
  change: number;
  /** The span the change covers, in hours. */
  hours: number;
}

export type ReadingState =
  | { stale: true }
  | { stale: false; trend: Trend | null };

/** How far back the trend looks, and how far from that mark a reading may be
 * to still stand for it. */
export const TREND_SPAN_H = 24;
const TREND_TOLERANCE_H = 3;

/** A reading older than this no longer says what the water does now. */
export function staleAfterMs(fetchIntervalSecs: number): number {
  return Math.max(3 * HOUR, 3 * fetchIntervalSecs * 1000);
}

/** What the newest reading says: stale when too old, else its trend over 24 h.
 * The trend compares the newest reading with the one nearest 24 h before it
 * (within 3 h); no such reading means no trend. A change of at least 3% of
 * the high threshold (1 unit when there is none) counts as rising or falling.
 * `readings` may come in any order. */
export function readingState(
  readings: TrendReading[],
  now: number,
  fetchIntervalSecs: number,
  high?: number | null,
): ReadingState {
  const points = readings
    .map((r) => ({ t: Date.parse(r.measured_at), v: r.value }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (points.length === 0) return { stale: true };
  const newest = points.reduce((a, b) => (b.t > a.t ? b : a));
  if (now - newest.t > staleAfterMs(fetchIntervalSecs)) return { stale: true };

  const mark = newest.t - TREND_SPAN_H * HOUR;
  let prior: { t: number; v: number } | null = null;
  for (const p of points) {
    const off = Math.abs(p.t - mark);
    if (off > TREND_TOLERANCE_H * HOUR) continue;
    if (!prior || off < Math.abs(prior.t - mark)) prior = p;
  }
  if (!prior) return { stale: false, trend: null };

  const delta = newest.v - prior.v;
  const floor = high != null && high > 0 ? 0.03 * high : 1;
  const direction =
    Math.abs(delta) < floor ? "steady" : delta > 0 ? "rising" : "falling";
  return {
    stale: false,
    trend: {
      direction,
      change: Math.abs(delta),
      hours: Math.round((newest.t - prior.t) / HOUR),
    },
  };
}

/** "falling 24 cm in 24 h", or "steady". */
export function trendText(trend: Trend, unit: string): string {
  if (trend.direction === "steady") return "steady";
  const n = Number(trend.change.toFixed(trend.change < 10 ? 1 : 0));
  return `${trend.direction} ${n} ${unit} in ${trend.hours} h`;
}
