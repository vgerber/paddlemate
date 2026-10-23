import { addDays, format, parseISO, startOfWeek } from "date-fns";

const ISO = "yyyy-MM-dd";

/** The seven days (Monday first) of the week holding `date`. */
export function weekDays(date: string): string[] {
  const monday = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), ISO));
}

/** The day whose card is the last one to start at or above the scroll edge:
 * the day the reader is on. `tops` are the cards' offsets, in order. */
export function dayAtScroll(
  tops: { date: string; top: number }[],
  scrollTop: number,
  slack = 8,
): string | null {
  let found: string | null = tops[0]?.date ?? null;
  for (const t of tops) {
    if (t.top <= scrollTop + slack) found = t.date;
  }
  return found;
}

/** Where a vertical drag of `dy` px leaves the month: pulled down opens it,
 * pushed up closes it, a small move changes nothing. */
export function pulledOpen(dy: number, open: boolean, threshold = 24): boolean {
  if (dy > threshold) return true;
  if (dy < -threshold) return false;
  return open;
}

/** A trip's standing from its dates: not started, running, or over. */
export type TripStanding = "upcoming" | "under way" | "past";

export function tripStanding(
  start: string,
  end: string | null | undefined,
  today: string,
): TripStanding {
  if (today < start) return "upcoming";
  if (end && today > end) return "past";
  return "under way";
}

const STANDING_ORDER: Record<TripStanding, number> = {
  "under way": 0,
  upcoming: 1,
  past: 2,
};

/** Trips as they list: under way first, then upcoming, then past. Within a
 * group the given order holds. */
export function sortByStanding<
  T extends { start_date: string; end_date?: string | null },
>(trips: readonly T[], today: string): T[] {
  const rank = (t: T) =>
    STANDING_ORDER[tripStanding(t.start_date, t.end_date, today)];
  return [...trips].sort((a, b) => rank(a) - rank(b));
}
