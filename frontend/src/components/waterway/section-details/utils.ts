import type { Feature, Proposal } from "@/lib/api";
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
  if (f.names[0]?.name) return f.names[0].name;
  if (f.feature_type === "whitewater") {
    const diff = (f.metadata as Record<string, unknown> | null)
      ?.difficulty as string | undefined;
    return diff ? `WW ${diff}` : "WW";
  }
  return f.feature_type.replace(/_/g, " ");
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
 * Converts a Proposal's proposed_data into a pseudo-Feature object.
 * Returns null when the proposal lacks the geometry/type required.
 */
export function proposalToPseudoFeature(proposal: Proposal): Feature | null {
  const data = proposal.proposed_data as Record<string, unknown> | null;
  if (!data?.location || !data?.feature_type) return null;
  const langCode = (data.lang_code as string | undefined) ?? "en";
  return {
    id: -proposal.id,
    feature_type: data.feature_type as Feature["feature_type"],
    location: data.location as Feature["location"],
    metadata: (data.metadata ?? null) as Feature["metadata"],
    names: data.name
      ? [{ id: 0, feature_id: -proposal.id, lang_code: langCode, name: data.name as string }]
      : [],
    descriptions: data.description
      ? [{ id: 0, feature_id: -proposal.id, lang_code: langCode, description: data.description as string }]
      : [],
    section_id: 0,
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
    created_by: proposal.submitted_by,
  } as Feature;
}

/**
 * Converts a pending Proposal into a ComputedFeature so it can be sorted
 * into the timeline alongside approved features. Returns null when the
 * proposal lacks the location data required for positioning.
 */
export function proposalToComputedFeature(
  proposal: Proposal,
  line: [number, number][],
): ComputedFeature | null {
  const pseudoFeature = proposalToPseudoFeature(proposal);
  if (!pseudoFeature) return null;
  return { ...computeExtent(pseudoFeature, line), proposal };
}

/**
 * Builds a two-level render tree. Each feature is assigned to the smallest
 * zone that fully contains it. Uncontained features are top-level nodes.
 * Both levels are sorted by ascending distM.
 */
export function buildTree(items: ComputedFeature[]): TreeNode[] {
  // Only approved (non-proposal) zones can act as parents; proposals are always leaves.
  const zones = items.filter((i) => i.isZone && !i.proposal);

  function findParent(item: ComputedFeature): ComputedFeature | null {
    let best: ComputedFeature | null = null;
    let bestSize = Infinity;
    for (const z of zones) {
      if (z.feature.id === item.feature.id) continue;
      const contained = item.isZone
        ? item.startM >= z.startM && item.endM <= z.endM
        : item.distM >= z.startM && item.distM <= z.endM;
      const size = z.endM - z.startM;
      if (contained && size < bestSize) {
        bestSize = size;
        best = z;
      }
    }
    return best;
  }

  const nestedIds = new Set<number>();
  const childMap = new Map<number, ComputedFeature[]>();

  for (const item of items) {
    const parent = findParent(item);
    if (parent) {
      nestedIds.add(item.feature.id);
      if (!childMap.has(parent.feature.id)) childMap.set(parent.feature.id, []);
      childMap.get(parent.feature.id)?.push(item);
    }
  }

  return items
    .filter((i) => !nestedIds.has(i.feature.id))
    .sort((a, b) => a.distM - b.distM)
    .map((item) => ({
      item,
      nested: (childMap.get(item.feature.id) ?? []).sort(
        (a, b) => a.distM - b.distM,
      ),
    }));
}
