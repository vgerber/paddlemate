/** Rules for which regions the map draws, and where each one's name sits.
 * Pure, so the rules can be tested without a map. */

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

const KIND_LABELS: Record<string, string> = {
  valley: "Valleys",
  district: "Districts",
  range: "Mountain ranges",
  state: "States",
};

/** The line under a region's name in the choice card: its country, then the
 * level it belongs to. The map label itself carries the name alone. */
export function regionSubtitle(
  country: string | null | undefined,
  kind: string,
): string {
  return [country, KIND_LABELS[kind]].filter(Boolean).join(" · ");
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
    if (region.kind !== "range") return true;
    const nested = ranges.filter(
      (other) =>
        other.id !== region.id && bboxContains(region.bbox, other.bbox),
    ).length;
    return nested < MAX_NESTED_RANGES;
  });
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

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return Math.hypot(dx, dy);
}

/** Signed distance from `p` to the polygon edge: positive inside. */
function edgeDistance(p: Pt, rings: readonly (readonly Pt[])[]): number {
  let inside = false;
  let min = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      ) {
        inside = !inside;
      }
      min = Math.min(min, segmentDistance(p, a, b));
    }
  }
  return inside ? min : -min;
}

interface Cell {
  x: number;
  y: number;
  half: number;
  d: number;
  max: number;
}

function makeCell(x: number, y: number, half: number, rings: Pt[][]): Cell {
  const d = edgeDistance([x, y], rings);
  return { x, y, half, d, max: d + half * Math.SQRT2 };
}

/** The visual centre of a polygon: the inside point farthest from every edge
 * (the pole of inaccessibility), found by refining a grid until a cell cannot
 * beat the best by more than a hundredth of the shape. Hand-rolled because
 * the shape is the only input and a dependency would dwarf the need. Works in
 * degrees; at region scale the distortion does not move the label visibly. */
function polygonCentre(rings: Pt[][]): Pt | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (size === 0) return [minX, minY];
  const precision = Math.max(maxX - minX, maxY - minY) / 100;
  let half = size / 2;
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) {
      queue.push(makeCell(x + half, y + half, half, rings));
    }
  }
  const mid = makeCell((minX + maxX) / 2, (minY + maxY) / 2, 0, rings);
  let best = mid;
  while (queue.length > 0) {
    queue.sort((a, b) => b.max - a.max);
    const cell = queue.shift() as Cell;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    half = cell.half / 2;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      queue.push(makeCell(cell.x + dx * half, cell.y + dy * half, half, rings));
    }
  }
  return [best.x, best.y];
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
