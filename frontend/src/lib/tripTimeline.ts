import type { Descent, TripMember, TripStay } from "@/lib/api";

export type TripEvent =
  | { kind: "base"; date: string; stay: TripStay }
  | { kind: "arrives"; date: string; member: TripMember }
  | { kind: "leaves"; date: string; member: TripMember }
  | { kind: "paddled"; date: string; descent: Descent };

export interface TripDay {
  /** Day as it reads: 1 is the start date, -1 the day before it. */
  day: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  events: TripEvent[];
}

/** Order within a day: where you wake up, who turns up, what got paddled,
 * who goes home. */
const EVENT_ORDER: Record<TripEvent["kind"], number> = {
  base: 0,
  arrives: 1,
  paddled: 2,
  leaves: 3,
};

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

const DAY_MS = 86_400_000;

/** A trip nobody would plan. Guards against a typo in an end date turning the
 * timeline into a decade of rest days. */
const MAX_TIMELINE_DAYS = 366;

function shiftDay(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Every date from `from` to `to` inclusive, as YYYY-MM-DD. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let day = from;
    day <= to && days.length < MAX_TIMELINE_DAYS;
    day = shiftDay(day, 1)
  ) {
    days.push(day);
  }
  return days;
}

/**
 * Day number as a person would say it: the start date is day 1, the day
 * before it is day -1. There is no day 0 - "the day before" counts backwards
 * from the first, the way years do around zero.
 */
export function dayNumber(date: string, start: string): number {
  const ms =
    Date.parse(`${toDay(date)}T00:00:00Z`) -
    Date.parse(`${toDay(start)}T00:00:00Z`);
  const offset = Math.round(ms / DAY_MS);
  return offset >= 0 ? offset + 1 : offset;
}

/**
 * The trip as an unbroken run of days: every day from the first thing that
 * happens (or the trip's start, whichever is earlier) to the last. A day with
 * nothing on it is a rest day and still appears, because a gap in the middle
 * of a week is a fact about the plan, not an absence of one - and it is where
 * you go to add something.
 */
export function buildTimeline({
  startDate,
  endDate,
  members,
  stays,
  descents,
}: {
  startDate: string;
  endDate?: string | null;
  members: TripMember[];
  stays: TripStay[];
  descents: Descent[];
}): TripDay[] {
  const events: TripEvent[] = [];

  for (const stay of stays) {
    // A stay without a date is a placeholder, not a move that happened.
    if (stay.arrival) events.push({ kind: "base", date: stay.arrival, stay });
  }
  for (const member of members) {
    if (member.arrival) {
      events.push({ kind: "arrives", date: member.arrival, member });
    }
    if (member.departure) {
      events.push({ kind: "leaves", date: member.departure, member });
    }
  }
  for (const descent of descents) {
    events.push({
      kind: "paddled",
      date: toDay(descent.start_time),
      descent,
    });
  }

  const byDate = new Map<string, TripEvent[]>();
  for (const event of events) {
    const key = toDay(event.date);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(event);
    else byDate.set(key, [event]);
  }

  const dated = [...byDate.keys()].sort();
  const first = [startDate, ...dated].sort()[0];
  const last = [endDate ?? startDate, ...dated].sort().at(-1) as string;

  return eachDay(first, last).map((date) => ({
    day: dayNumber(date, startDate),
    date,
    events: (byDate.get(date) ?? []).sort(
      (a, b) => EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind],
    ),
  }));
}

/**
 * A month as six weeks of dates, Monday first, padded from the neighbouring
 * months so the grid is always the same shape. `month` is 1-12.
 */
export function monthGrid(year: number, month: number): string[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
    .toISOString()
    .slice(0, 10);
  // getUTCDay is Sunday-first; shift so Monday starts the week.
  const weekday = (new Date(`${firstOfMonth}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shiftDay(firstOfMonth, -weekday);

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => shiftDay(start, w * 7 + d)));
  }
  return weeks;
}

/** A section somebody ran that day, and everybody who ran it. */
export interface PaddledSection {
  sectionId: number;
  name: string;
  paddlers: string[];
}

/** One river's share of a day's paddling. */
export interface PaddledRiver {
  waterwayId: number | null;
  name: string;
  sections: PaddledSection[];
}

const UNNAMED_RIVER = "Unnamed river";

/**
 * A day's paddling, grouped by river: which sections went, and who was on
 * each. Two people running the same stretch is one line with both names, not
 * two lines saying the same thing.
 *
 * A log with no sections has nothing to group, so it comes back separately
 * rather than disappearing.
 */
export function paddledByRiver(events: TripEvent[]): {
  rivers: PaddledRiver[];
  unsectioned: Descent[];
} {
  const byRiver = new Map<string, PaddledRiver>();
  const unsectioned: Descent[] = [];

  for (const event of events) {
    if (event.kind !== "paddled") continue;
    const { descent } = event;
    const who = descent.username ?? "a member";

    if (descent.sections.length === 0) {
      unsectioned.push(descent);
      continue;
    }

    for (const section of [...descent.sections].sort(
      (a, b) => a.sort_order - b.sort_order,
    )) {
      const key = String(section.waterway_id ?? section.waterway_name ?? "");
      let river = byRiver.get(key);
      if (!river) {
        river = {
          waterwayId: section.waterway_id ?? null,
          name: section.waterway_name ?? UNNAMED_RIVER,
          sections: [],
        };
        byRiver.set(key, river);
      }

      const name = section.section_name ?? `Section #${section.section_id}`;
      const existing = river.sections.find(
        (s) => s.sectionId === section.section_id,
      );
      if (existing) {
        if (!existing.paddlers.includes(who)) existing.paddlers.push(who);
      } else {
        river.sections.push({
          sectionId: section.section_id,
          name,
          paddlers: [who],
        });
      }
    }
  }

  const rivers = [...byRiver.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { rivers, unsectioned };
}
