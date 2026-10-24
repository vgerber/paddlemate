import type { TripSection, TripStay } from "@/lib/api";
import {
  type Bounds,
  circleBounds,
  distanceKm,
  lineCoords,
  mergeBounds,
  pointCoords,
} from "@/lib/geo";
import { resolveTokens, type TokenSource } from "@/lib/waterLevel";

/** A placed base and how far it reaches. */
export interface BaseRange {
  stayId: number;
  name: string;
  lat: number;
  lon: number;
  /**
   * Reaches the section on its watch list it is farthest from, so the ring
   * covers every one of them. Zero while the list is empty - a base with
   * nothing to paddle from it has no reach to draw.
   */
  radiusKm: number;
  /** The farthest section, which is the one setting the radius. */
  farthest: string | null;
  sectionCount: number;
}

/**
 * How far the base is from a section: the distance to the nearest point of
 * it, because reaching any part of the run is reaching the run. Null when the
 * section carries no geometry.
 */
export function sectionDistanceKm(
  lat: number,
  lon: number,
  section: TripSection,
): number | null {
  const coords = lineCoords(section.location);
  if (!coords || coords.length === 0) return null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const [clon, clat] of coords) {
    const d = distanceKm([lon, lat], [clon, clat]);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * One ring per placed base. A base still without a location is skipped rather
 * than guessed at - a placeholder base is exactly the case where nobody knows
 * where it is yet.
 */
export function baseRanges(stays: TripStay[]): BaseRange[] {
  const ranges: BaseRange[] = [];

  for (const stay of stays) {
    const point = pointCoords(stay.location);
    if (!point) continue;
    const [lon, lat] = point;

    let radiusKm = 0;
    let farthest: string | null = null;
    let sectionCount = 0;

    for (const section of stay.sections) {
      const d = sectionDistanceKm(lat, lon, section);
      if (d === null) continue;
      sectionCount++;
      if (d > radiusKm) {
        radiusKm = d;
        farthest = section.section_name ?? null;
      }
    }

    ranges.push({
      stayId: stay.id,
      name: stay.name,
      lat,
      lon,
      radiusKm,
      farthest,
      sectionCount,
    });
  }

  return ranges;
}

/** The box holding every ring, so the map can open on all of them at once. */
export function rangeBounds(ranges: BaseRange[]): Bounds | null {
  return ranges.reduce<Bounds | null>(
    (box, r) => mergeBounds(box, circleBounds(r)),
    null,
  );
}

/**
 * A colour per base, so a ring on the map and a row in the list below it are
 * recognisably the same base. Assigned by position in the trip's own list of
 * bases, including the ones with no location yet, so a colour does not shift
 * the moment somebody places a pin.
 */
export function baseColors(
  stays: TripStay[],
  from: TokenSource = "light",
): Record<number, string> {
  const palette = resolveTokens(from).mapRegionPalette;
  const colors: Record<number, string> = {};
  stays.forEach((stay, i) => {
    colors[stay.id] = palette[i % palette.length];
  });
  return colors;
}

/** Their 1-based position in the same list, printed on the map marker and
 * beside the name below it. Counts the unplaced bases too, so the numbers
 * match the list you are reading rather than the subset that has pins. */
export function baseNumbers(stays: TripStay[]): Record<number, number> {
  const numbers: Record<number, number> = {};
  stays.forEach((stay, i) => {
    numbers[stay.id] = i + 1;
  });
  return numbers;
}

/**
 * The nearest run the trip is already watching, and how far it is. This is
 * the number that makes a proposed base judgeable: a bed is only a good base
 * if the water the group came for is near it.
 */
export function nearestWatched(
  candidate: { location?: TripSection["location"] },
  stays: TripStay[],
): { name: string; river: string | null; km: number } | null {
  const point = pointCoords(candidate.location);
  if (!point) return null;
  const [lon, lat] = point;

  // The same run can sit on two watch lists; it is still one run.
  const seen = new Set<number>();
  let best: { name: string; river: string | null; km: number } | null = null;

  for (const stay of stays) {
    for (const section of stay.sections) {
      if (seen.has(section.section_id)) continue;
      seen.add(section.section_id);
      const km = sectionDistanceKm(lat, lon, section);
      if (km === null) continue;
      if (!best || km < best.km) {
        best = {
          name: section.section_name ?? "a run",
          river: section.waterway_name ?? null,
          km,
        };
      }
    }
  }
  return best;
}
