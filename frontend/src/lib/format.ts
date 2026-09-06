/** Shared display formatting for dates, durations, readings and enum keys. */

export function formatDate(
  iso: string,
  opts: { weekday?: boolean } = {},
): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
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

/** Compact relative age: "5m ago", "3d ago", "2y ago". */
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

/** snake_case enum key to a human label: "put_in" -> "put in". */
/**
 * A clock time from the API, trimmed to the hour and minute: "19:30". The
 * value carries no zone - it is local to wherever the trip is - so it is
 * sliced rather than put through a Date, which would shift it to the reader.
 */
export function clockTime(time: string): string {
  return time.slice(0, 5);
}

/** "Thu, 03 Sept 2026 · 19:30", dropping the time until somebody sets one. */
export function dateAndTime(date: string, time?: string | null): string {
  const day = formatDate(date, { weekday: true });
  return time ? `${day} · ${clockTime(time)}` : day;
}

/**
 * A trip's span: "01 - 08 Jun 2026", collapsing the parts both ends share.
 * An open-ended trip reads "from 01 Jun 2026".
 */
export function dateRange(start: string, end?: string | null): string {
  if (!end) return `from ${formatDate(start)}`;
  if (start === end) return formatDate(start);

  const a = new Date(start);
  const b = new Date(end);
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();

  const head = sameMonth
    ? a.toLocaleDateString("en-GB", { day: "2-digit" })
    : sameYear
      ? a.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : formatDate(start);
  return `${head} - ${formatDate(end)}`;
}

export function humanize(key: string): string {
  return key.replace(/_/g, " ");
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
