import type {
  SectionWithFeatures,
  TripStay,
  TripStayCandidate,
} from "@/lib/api";
import {
  type Bounds,
  boundsOf,
  circleBounds,
  lineCoords,
  mergeBounds,
  pointCoords,
} from "@/lib/geo";
import type { BaseRange } from "@/lib/tripRange";

/** What the open trip points at, so the map can frame it: a candidate opened
 * in the Bases tab or a day opened in the plan. */
export type TripFocus =
  | { kind: "candidate"; id: number }
  | { kind: "day"; date: string };

export const focusKey = (focus: TripFocus): string =>
  focus.kind === "candidate" ? `candidate:${focus.id}` : `day:${focus.date}`;

/** The box holding the focus, or null when it has nothing placed (the scene
 * then frames the whole trip). A day frames the bases it falls in, with their
 * rings and watched sections. */
export function focusBounds(
  focus: TripFocus,
  stays: TripStay[],
  candidates: TripStayCandidate[],
  ranges: BaseRange[],
  watched: SectionWithFeatures[],
): Bounds | null {
  if (focus.kind === "candidate") {
    const point = pointCoords(
      candidates.find((c) => c.id === focus.id)?.location,
    );
    return point ? boundsOf([point]) : null;
  }
  const inDay = stays.filter(
    (s) =>
      s.arrival != null &&
      s.arrival <= focus.date &&
      focus.date <= (s.departure ?? s.arrival),
  );
  const ids = new Set(inDay.map((s) => s.id));
  const sectionIds = new Set(
    inDay.flatMap((s) => s.sections.map((x) => x.section_id)),
  );
  const rings = ranges
    .filter((r) => ids.has(r.stayId))
    .reduce<Bounds | null>((box, r) => mergeBounds(box, circleBounds(r)), null);
  const lines = boundsOf(
    watched
      .filter((s) => sectionIds.has(s.id))
      .flatMap((s) => lineCoords(s.location) ?? []),
  );
  return mergeBounds(rings, lines);
}
