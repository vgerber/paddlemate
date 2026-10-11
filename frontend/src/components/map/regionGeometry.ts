/** Rules for which regions the map draws, and where each one's name sits.
 * Pure, so the rules can be tested without a map. */

import polylabel from "polylabel";
import type { RegionRef } from "@/lib/api";

/** [west, south, east, north] */
export type Bbox = readonly [number, number, number, number];

export interface DrawableRegion {
  id: number;
  kind: string;
  bbox: readonly number[];
  geometry: GeoJSON.Geometry;
}

/** A region smaller than this share of the view waits for a closer zoom. */
export const MIN_VIEW_SHARE = 0.003;

/** A range holding at least this many other ranges is not drawn. */
export const MAX_NESTED_RANGES = 2;

/** The levels regions come in, in the order the level chips show them. */
export const LEVELS = [
  { kind: "valley", label: "Valleys" },
  { kind: "district", label: "Districts" },
  { kind: "range", label: "Mountain ranges" },
  { kind: "state", label: "States" },
] as const;

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  LEVELS.map((level) => [level.kind, level.label]),
);

/** Where a region lies, as "Tirol, AT": the state when it has one, else its
 * most specific larger region, then the country code. `parents` come most
 * specific first, as the API sends them. */
export function regionContext(
  country: string | null | undefined,
  parents: readonly RegionRef[] | undefined,
): string {
  const larger = (parents ?? []).filter((p) => p.kind !== "country");
  const place = larger.find((p) => p.kind === "state") ?? larger[0];
  return [place?.name, country].filter(Boolean).join(", ");
}

/** The line under a region's name in the choice card: where it lies, then
 * the level it belongs to. The map label itself carries the name alone. */
export function regionSubtitle(
  country: string | null | undefined,
  kind: string,
  parents?: readonly RegionRef[],
): string {
  return [regionContext(country, parents), KIND_LABELS[kind]]
    .filter(Boolean)
    .join(" · ");
}

export function bboxArea(b: readonly number[]): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/** Whether `inner` lies inside `outer`, edges included. */
export function bboxContains(
  outer: readonly number[],
  inner: readonly number[],
): boolean {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[2] >= inner[2] &&
    outer[3] >= inner[3]
  );
}

/** The regions worth drawing in this view. Two rules thin the map:
 *
 * - a range that holds two or more other ranges only repeats what they
 *   already show (bounding boxes stand in until the API answers containment);
 * - a region far smaller than the view is a speck that cannot be read or hit,
 *   so it waits for a closer zoom.
 *
 * The picked region is never hidden by either. */
export function visibleRegions<T extends DrawableRegion>(
  regions: readonly T[],
  view: Bbox | null,
  pickedId?: number | null,
): T[] {
  const viewArea = view ? bboxArea(view) : 0;
  const ranges = regions.filter((r) => r.kind === "range");
  return regions.filter((region) => {
    if (region.id === pickedId) return true;
    if (viewArea > 0 && bboxArea(region.bbox) / viewArea < MIN_VIEW_SHARE) {
      return false;
    }
    return !holdsManyRanges(region, ranges);
  });
}

function holdsManyRanges(
  region: DrawableRegion,
  ranges: readonly DrawableRegion[],
): boolean {
  if (region.kind !== "range") return false;
  const nested = ranges.filter(
    (other) => other.id !== region.id && bboxContains(region.bbox, other.bbox),
  ).length;
  return nested >= MAX_NESTED_RANGES;
}

/** The ranges that `visibleRegions` leaves out because they hold other
 * ranges, so they can still be reached from a list. Bounding boxes stand in
 * for containment, as there: the API cannot answer "inside" yet. */
export function rangesHiddenByNesting<T extends DrawableRegion>(
  regions: readonly T[],
  pickedId?: number | null,
): T[] {
  const ranges = regions.filter((r) => r.kind === "range");
  return ranges.filter(
    (range) => range.id !== pickedId && holdsManyRanges(range, ranges),
  );
}

/** The regions the picked one lies in, nearest first. Bounding boxes stand in
 * for containment (an approximation: a neighbour's box can swallow a region
 * that is not inside it) until the API answers it. */
export function partOf<T extends DrawableRegion>(
  regions: readonly T[],
  picked: { id: number; bbox: readonly number[] },
): T[] {
  return regions
    .filter(
      (region) =>
        region.id !== picked.id && bboxContains(region.bbox, picked.bbox),
    )
    .sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));
}

/** The "Part of" chips: the API's real parents when it gave any, else the
 * bounding-box guess. */
export function partOfChips(
  parents: readonly RegionRef[] | undefined,
  guess: readonly { id: number; name: string }[],
): { id: number; name: string }[] {
  return parents && parents.length > 0
    ? parents.map(({ id, name }) => ({ id, name }))
    : guess.map(({ id, name }) => ({ id, name }));
}

type Pt = readonly [number, number];

function ringArea(ring: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function lineLength(line: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += Math.hypot(
      line[i][0] - line[i - 1][0],
      line[i][1] - line[i - 1][1],
    );
  }
  return total;
}

function lineMidpoint(line: readonly Pt[]): Pt | null {
  if (line.length === 0) return null;
  let left = lineLength(line) / 2;
  for (let i = 1; i < line.length; i++) {
    const seg = Math.hypot(
      line[i][0] - line[i - 1][0],
      line[i][1] - line[i - 1][1],
    );
    if (seg >= left && seg > 0) {
      const t = left / seg;
      return [
        line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
        line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
      ];
    }
    left -= seg;
  }
  return line[line.length - 1];
}

/** The visual centre of a polygon (pole of inaccessibility) in degrees, at a
 * precision of a hundredth of the shape's longer side. */
function polygonCentre(rings: Pt[][]): Pt | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const precision = Math.max(maxX - minX, maxY - minY) / 100;
  if (precision === 0) return [minX, minY];
  const [x, y] = polylabel(
    rings.map((ring) => ring.map(([px, py]) => [px, py])),
    precision,
  );
  return [x, y];
}

function asPoints(coords: number[][]): Pt[] {
  return coords.map((c) => [c[0], c[1]] as const) as Pt[];
}

/** Where a region's name goes: the visual centre of its biggest part, or the
 * middle of its longest line. One point per region, computed from the whole
 * shape rather than once per tile or outline part. */
export function labelPoint(
  geometry: GeoJSON.Geometry,
): [number, number] | null {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates[0], geometry.coordinates[1]];
    case "LineString": {
      const mid = lineMidpoint(asPoints(geometry.coordinates));
      return mid ? [mid[0], mid[1]] : null;
    }
    case "MultiLineString": {
      const lines = geometry.coordinates.map(asPoints);
      lines.sort((a, b) => lineLength(b) - lineLength(a));
      const mid = lines[0] ? lineMidpoint(lines[0]) : null;
      return mid ? [mid[0], mid[1]] : null;
    }
    case "Polygon": {
      const c = polygonCentre(geometry.coordinates.map(asPoints));
      return c ? [c[0], c[1]] : null;
    }
    case "MultiPolygon": {
      const parts = geometry.coordinates.map((poly) => poly.map(asPoints));
      parts.sort((a, b) => ringArea(b[0] ?? []) - ringArea(a[0] ?? []));
      const c = parts[0] ? polygonCentre(parts[0]) : null;
      return c ? [c[0], c[1]] : null;
    }
    default:
      return null;
  }
}
