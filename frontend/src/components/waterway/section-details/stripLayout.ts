import type { FeatureType } from "@/lib/api";

/** Hazards by danger, worst first: the icon a merged group shows. */
export const HAZARD_ORDER: FeatureType[] = [
  "siphon",
  "strainer",
  "waterfall",
  "dam",
  "weir",
  "hole",
];

/** Put in and take out always stand alone on the strip. */
const STANDALONE: FeatureType[] = ["put_in", "take_out"];

export interface StripPoint {
  id: number;
  type: FeatureType;
  distM: number;
}

export interface StripDisc {
  id: number;
  type: FeatureType;
  x: number;
  /** 0 on the line, 1 stepped below it on a short stem. */
  level: 0 | 1;
}

export interface StripGroup {
  ids: number[];
  x: number;
  /** The most dangerous hazard inside, or null: the disc then shows the count. */
  hazard: FeatureType | null;
  count: number;
}

export interface StripLayout {
  discs: StripDisc[];
  groups: StripGroup[];
}

export interface StripOptions {
  /** Diameter of a disc in px. */
  disc: number;
  /** Free space kept between neighbours in px. */
  gap: number;
}

export const DEFAULT_STRIP: StripOptions = { disc: 22, gap: 2 };

/** Horizontal position of a distance: the line starts and ends half a disc
 * inside the width so the end discs are not cut off. */
export function stripX(
  distM: number,
  totalM: number,
  widthPx: number,
  { disc }: StripOptions = DEFAULT_STRIP,
): number {
  const pad = disc / 2 + 1;
  if (totalM <= 0) return pad;
  const frac = Math.min(1, Math.max(0, distM / totalM));
  return pad + frac * (widthPx - 2 * pad);
}

/** The worst hazard among the types, or null when none is a hazard. */
export function worstHazard(types: FeatureType[]): FeatureType | null {
  return HAZARD_ORDER.find((h) => types.includes(h)) ?? null;
}

/** Places the point features on a strip of the given width. Two that would
 * overlap step apart (the second below the line); three or more that would
 * overlap merge into one group. Groups come from the width, so a wider strip
 * splits them. */
export function layoutStrip(
  points: StripPoint[],
  totalM: number,
  widthPx: number,
  opts: StripOptions = DEFAULT_STRIP,
): StripLayout {
  const reach = opts.disc + opts.gap;
  const placed = points
    .map((p) => ({ ...p, x: stripX(p.distM, totalM, widthPx, opts) }))
    .sort((a, b) => a.x - b.x);

  const alone = placed.filter((p) => STANDALONE.includes(p.type));
  const rest = placed.filter((p) => !STANDALONE.includes(p.type));

  const clusters: (typeof rest)[] = [];
  for (const p of rest) {
    const last = clusters[clusters.length - 1];
    if (last && p.x - last[last.length - 1].x < reach) last.push(p);
    else clusters.push([p]);
  }

  const discs: StripDisc[] = alone.map((p) => ({
    id: p.id,
    type: p.type,
    x: p.x,
    level: 0,
  }));
  const groups: StripGroup[] = [];

  for (const cluster of clusters) {
    if (cluster.length >= 3) {
      groups.push({
        ids: cluster.map((p) => p.id),
        x: cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length,
        hazard: worstHazard(cluster.map((p) => p.type)),
        count: cluster.length,
      });
      continue;
    }
    cluster.forEach((p, i) => {
      const hitsAlone = alone.some((a) => Math.abs(a.x - p.x) < reach);
      discs.push({
        id: p.id,
        type: p.type,
        x: p.x,
        level: i === 1 || hitsAlone ? 1 : 0,
      });
    });
  }

  discs.sort((a, b) => a.x - b.x);
  groups.sort((a, b) => a.x - b.x);
  return { discs, groups };
}
