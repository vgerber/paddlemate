import {
  addDays,
  addHours,
  addMonths,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type { TimeRange } from "./types";

/** Room kept right of the newest reading on the rail, in px. A forecast would
 * widen it later. */
export const RAIL_NOW_INSET = 8;

/** Distance the first and last axis label keep from the plot's edges. */
export const AXIS_EDGE = 12;

/** Threshold words keep at least this far apart, in px. */
export const WORD_GAP = 13;

/** The time axis stretched so the newest reading lands `RAIL_NOW_INSET` px
 * short of the plot's right edge while bands and lines run to the edge. */
export function insetExtent(
  [from, to]: [number, number],
  plotWidth: number,
  inset = RAIL_NOW_INSET,
): [number, number] {
  if (plotWidth <= inset) return [from, to];
  return [from, to + ((to - from) * inset) / (plotWidth - inset)];
}

/** Axis ticks for a period within [from, to]: 24h every 6 hours, 7d every
 * second day, 1m every fifth day, a year every second month. */
export function axisTicks(
  period: TimeRange,
  [from, to]: [number, number],
): number[] {
  const out: number[] = [];
  if (period === "24h") {
    for (let d = startOfDay(from); d.getTime() <= to; d = addHours(d, 6)) {
      if (d.getTime() >= from) out.push(d.getTime());
    }
    return out;
  }
  if (period === "7d" || period === "1m") {
    const step = period === "7d" ? 2 : 5;
    for (
      let d = startOfDay(addDays(from, 1));
      d.getTime() <= to;
      d = addDays(d, step)
    ) {
      out.push(d.getTime());
    }
    return out;
  }
  // 3m, 6m, 1y: month starts, every second one for a year or less.
  const every = period === "1y" ? 2 : 1;
  let k = 0;
  for (
    let d = startOfMonth(addMonths(from, 1));
    d.getTime() <= to;
    d = addMonths(d, 1), k++
  ) {
    if (k % every === 0) out.push(d.getTime());
  }
  return out;
}

/** The label of an axis tick: clock time within a day, a date across days,
 * a month across a year with the year at January. */
export function tickLabel(period: TimeRange, ts: number): string {
  const d = new Date(ts);
  if (period === "24h") {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  if (period === "7d" || period === "1m") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return d.getMonth() === 0 ? `${month} ${d.getFullYear()}` : month;
}

/** Where a label of `width` px centred near `x` may sit so it stays
 * `AXIS_EDGE` px inside both edges of a plot `plotWidth` wide. */
export function clampLabelX(
  x: number,
  width: number,
  plotWidth: number,
  edge = AXIS_EDGE,
): number {
  const lo = edge + width / 2;
  const hi = plotWidth - edge - width / 2;
  return hi < lo ? plotWidth / 2 : Math.min(Math.max(x, lo), hi);
}

/** Baselines for the threshold words: each `offset` above its line, pushed
 * down so neighbours keep `WORD_GAP`. Input and output keep the line order
 * given; the first line (smallest y) holds still. */
export function spreadWords(
  lineYs: number[],
  offset = 5,
  gap = WORD_GAP,
): number[] {
  const order = lineYs.map((y, i) => ({ y: y - offset, i }));
  order.sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  }
  const out = new Array<number>(lineYs.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** The readout's x centre: the point's x kept `edge` px inside the plot. */
export function clampReadoutX(
  x: number,
  halfWidth: number,
  plotWidth: number,
  edge = 8,
): number {
  const lo = halfWidth + edge;
  const hi = plotWidth - halfWidth - edge;
  return hi < lo ? plotWidth / 2 : Math.min(Math.max(x, lo), hi);
}
