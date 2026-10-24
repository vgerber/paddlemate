/** Shared display formatting for dates, durations, readings and enum keys. */

import { format, isSameDay, isSameMonth, isSameYear, parseISO } from "date-fns";

const LOCALE = "en-GB";

/** Today as a calendar day in the viewer's own timezone, "2026-09-01". */
export function todayIso(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function formatDate(
  iso: string,
  opts: { weekday?: boolean } = {},
): string {
  return parseISO(iso).toLocaleDateString(LOCALE, {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "2h 15m" style duration between two timestamps, or null when not positive
 * or under a minute. */
export function durationLabel(start: string, end: string): string | null {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return m > 0 ? `${m}m` : null;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Compact relative age: "5m ago", "3d ago", "2y ago". Hand-rolled: neither
 * Intl.RelativeTimeFormat nor date-fns gives this compact form. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * A clock time from the API, trimmed to the hour and minute: "19:30". The
 * value carries no zone - it is local to wherever the trip is - so it is
 * sliced rather than put through a Date, which would shift it to the reader.
 */
export function clockTime(time: string): string {
  return time.slice(0, 5);
}

/** A reading's moment with its day: "Oct 9, 16:48". */
export function dayTime(iso: string): string {
  const day = new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${formatTime(iso)}`;
}

/** When a reading was taken: the time for today's, else day and time. */
export function readingTime(iso: string, now: Date = new Date()): string {
  return isSameDay(new Date(iso), now) ? formatTime(iso) : dayTime(iso);
}

/** "Thu, 03 Sept 2026 · 19:30", dropping the time until somebody sets one. */
export function dateAndTime(date: string, time?: string | null): string {
  const day = formatDate(date, { weekday: true });
  return time ? `${day} · ${clockTime(time)}` : day;
}

function rangeHead(
  a: Date,
  sameYear: boolean,
  sameMonth: boolean,
  start: string,
): string {
  if (sameMonth) return a.toLocaleDateString(LOCALE, { day: "2-digit" });
  if (sameYear) {
    return a.toLocaleDateString(LOCALE, { day: "2-digit", month: "short" });
  }
  return formatDate(start);
}

/**
 * A trip's span: "01 - 08 Jun 2026", collapsing the parts both ends share.
 * An open-ended trip reads "from 01 Jun 2026".
 */
export function dateRange(start: string, end?: string | null): string {
  if (!end) return `from ${formatDate(start)}`;
  if (start === end) return formatDate(start);

  // A calendar day is a day, not an instant: `parseISO` reads it as local
  // midnight where `new Date` would read UTC midnight, still the day before
  // anywhere west of UTC.
  const a = parseISO(start);
  const b = parseISO(end);
  const sameYear = isSameYear(a, b);
  const sameMonth = isSameMonth(a, b);

  return `${rangeHead(a, sameYear, sameMonth, start)} - ${formatDate(end)}`;
}

/** A day without padding: "4 Apr 2026". Takes an instant, read in the
 * viewer's timezone. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A chart's custom range: "12 Mar - 4 Apr 2026", the year shown once when
 * both ends share it. */
export function chartRange(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  if (isSameDay(a, b)) return formatDay(to);
  const head = isSameYear(a, b)
    ? a.toLocaleDateString(LOCALE, { day: "numeric", month: "short" })
    : formatDay(from);
  return `${head} - ${formatDay(to)}`;
}

/** The low and high of a bucket: "62.1 - 71.3 cm". */
export function formatSpread(low: number, high: number, unit: string): string {
  return `${Number(low.toFixed(1))} - ${formatReading(high, unit)}`;
}

/** snake_case enum key to a human label: "put_in" -> "put in". */
export function humanize(key: string): string {
  return key.replace(/_/g, " ");
}

/** First letter upper case, the rest as given: "put in" -> "Put in". */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Gauge reading with unit, trimmed of trailing zeros: "85.4 cm". */
export function formatReading(value: number, unit: string): string {
  return `${Number(value.toFixed(1))} ${unit}`;
}

/** A section's location as an address, least specific first, matching the
 * `place` the river search returns. `regions` is stored most specific first,
 * so the two that identify a section best are the first two - printed the
 * other way round, after the country. */
export function sectionPlace(
  country: string | null | undefined,
  regions: string[] | null | undefined,
): string[] {
  const narrowest = (regions ?? []).slice(0, 2).reverse();
  return [country, ...narrowest].filter((part): part is string => !!part);
}

/** "1 gauge", "3 gauges": the count and its noun. Pass `many` for an
 * irregular plural. Hand-rolled: the UI is English only, so Intl.PluralRules
 * would add nothing. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
