import type { Feature } from "@/lib/api";
import { distanceAlongLineM, representativePoint } from "@/lib/geo";
import type { ComputedFeature, TreeNode } from "./types";

/**
 * Feature types that are inherently linear zones but may be stored as Points
 * in the DB (e.g. imported without a proper LineString). Treated as spanning
 * the full section so they render as zone entries and other features nest inside.
 */
export const SECTION_ZONE_TYPES = new Set(["whitewater"]);

/** Formats a metre distance as "X.X KM". */
export function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(1)} KM`;
}

/** Returns the feature's first name, falling back to a humanised type string. */
export function featureName(f: Feature): string {
  return f.names[0]?.name ?? f.feature_type.replace(/_/g, " ");
}

/** Returns the feature's first description or null. */
export function featureDesc(f: Feature): string | null {
  return f.descriptions[0]?.description ?? null;
}

/**
 * Projects a feature onto the section line to determine its start/end distances.
 *
 * - LineString / Polygon → project all vertices, take min/max → zone.
 * - Point in SECTION_ZONE_TYPES (e.g. whitewater stored without geometry) →
 *   treat as spanning the whole section (0 → end).
 * - Any other Point → single distance, not a zone.
 */
export function computeExtent(
  f: Feature,
  line: [number, number][],
): ComputedFeature {
  const loc = f.location;

  if (
    SECTION_ZONE_TYPES.has(f.feature_type) &&
    loc.type === "Point" &&
    line.length >= 2
  ) {
    const endM = distanceAlongLineM(line[line.length - 1], line);
    return {
      feature: f,
      distM: 0,
      startM: 0,
      endM,
      isZone: true,
      coords: representativePoint(loc),
    };
  }

  if (loc.type === "LineString") {
    const dists = (loc.coordinates as number[][]).map(([lng, lat]) =>
      distanceAlongLineM([lng, lat], line),
    );
    const startM = Math.min(...dists);
    const endM = Math.max(...dists);
    return {
      feature: f,
      distM: startM,
      startM,
      endM,
      isZone: true,
      coords: representativePoint(loc),
    };
  }

  if (loc.type === "Polygon") {
    const dists = ((loc.coordinates as number[][][])[0] ?? []).map(
      ([lng, lat]) => distanceAlongLineM([lng, lat], line),
    );
    const startM = Math.min(...dists);
    const endM = Math.max(...dists);
    return {
      feature: f,
      distM: startM,
      startM,
      endM,
      isZone: true,
      coords: representativePoint(loc),
    };
  }

  const distM =
    line.length >= 2 ? distanceAlongLineM(representativePoint(loc), line) : 0;
  return {
    feature: f,
    distM,
    startM: distM,
    endM: distM,
    isZone: false,
    coords: representativePoint(loc),
  };
}

/**
 * Builds a flat sorted list from computed features.
 */
export function buildTree(items: ComputedFeature[]): TreeNode[] {
  return items.sort((a, b) => a.distM - b.distM).map((item) => ({ item }));
}
