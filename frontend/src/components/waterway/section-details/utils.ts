import type { Feature, Proposal } from "@/lib/api";
import { distanceAlongLineM, representativePoint } from "@/lib/geo";
import { localizedDescription, localizedName } from "@/lib/localization";
import type { ComputedFeature, TreeNode } from "./types";

/** Formats a metre distance as "X.X KM". */
export function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(1)} KM`;
}

/** Difficulty grade from feature metadata, or null. */
export function featureDifficulty(f: Feature): string | null {
  const d = (f.metadata as Record<string, unknown> | null)?.difficulty;
  return typeof d === "string" && d ? d : null;
}

/** Returns the feature's name in the user's language (first name as
 * fallback, else a humanised type string), with the difficulty right behind
 * it - "Slot Machine III+" like the whitewater fallback "WW III". */
export function featureName(f: Feature): string {
  const diff = featureDifficulty(f);
  const name =
    localizedName(f.names[0]?.name ?? "", f.names) ||
    (f.feature_type === "whitewater"
      ? "WW"
      : f.feature_type.replace(/_/g, " "));
  return diff ? `${name} ${diff}` : name;
}

/** Tolerance (m) when detecting that a zone spans the whole section. */
export const FULL_SECTION_TOLERANCE_M = 50;

/** True when a line feature covers (nearly) the whole section line. */
export function spansWholeSection(
  f: Feature,
  line: [number, number][],
): boolean {
  if (f.location.type !== "LineString" || line.length < 2) return false;
  const totalM = distanceAlongLineM(line[line.length - 1], line);
  const extent = computeExtent(f, line);
  return (
    extent.startM < FULL_SECTION_TOLERANCE_M &&
    totalM - extent.endM < FULL_SECTION_TOLERANCE_M
  );
}

/** Humanised feature type for the small label under the name; null when the
 * entry has no own name, because featureName already falls back to the type. */
export function featureTypeLabel(f: Feature): string | null {
  const hasName = !!localizedName(f.names[0]?.name ?? "", f.names);
  return hasName ? f.feature_type.replace(/_/g, " ") : null;
}

/** Returns the feature's description in the user's language or null. */
export function featureDesc(f: Feature): string | null {
  return localizedDescription(f.descriptions[0]?.description, f.descriptions);
}

/**
 * Projects a feature onto the section line to determine its start/end distances.
 *
 * - LineString / Polygon → project all vertices, take min/max → zone.
 * - Point → single distance, not a zone (positioned at its actual location).
 */
export function computeExtent(
  f: Feature,
  line: [number, number][],
): ComputedFeature {
  const loc = f.location;

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

/** Build a display-only `Feature` from draft/bundled proposal data, for map
 * rendering and extent computation before the feature exists. */
export function toPseudoFeature(
  data: {
    feature_type: Feature["feature_type"];
    metadata?: Record<string, unknown> | null;
    location: Feature["location"];
    name?: string | null;
    lang_code?: string | null;
  },
  index: number,
): Feature {
  return {
    id: -(index + 1),
    section_id: 0,
    feature_type: data.feature_type,
    metadata: (data.metadata ?? {}) as Feature["metadata"],
    location: data.location,
    names: data.name
      ? [
          {
            id: 0,
            feature_id: -(index + 1),
            lang_code: data.lang_code ?? "en",
            name: data.name,
          },
        ]
      : [],
    descriptions: [],
    created_by: "",
    created_at: "",
    updated_at: "",
  } as Feature;
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
      ? [
          {
            id: 0,
            feature_id: -proposal.id,
            lang_code: langCode,
            name: data.name as string,
          },
        ]
      : [],
    descriptions: data.description
      ? [
          {
            id: 0,
            feature_id: -proposal.id,
            lang_code: langCode,
            description: data.description as string,
          },
        ]
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
 * Builds a recursive render tree. Each feature is assigned to the smallest
 * zone that fully contains it, so a zone inside a zone nests another level
 * deep. Uncontained features are top-level nodes. Every level is sorted by
 * ascending distM.
 */
export function buildTree(items: ComputedFeature[]): TreeNode[] {
  // Only approved (non-proposal) zones can act as parents; proposals are always leaves.
  const zones = items.filter((i) => i.isZone && !i.proposal);

  function findParent(item: ComputedFeature): ComputedFeature | null {
    let best: ComputedFeature | null = null;
    let bestSize = Infinity;
    const itemSize = item.endM - item.startM;
    for (const z of zones) {
      if (z.feature.id === item.feature.id) continue;
      const contained = item.isZone
        ? item.startM >= z.startM && item.endM <= z.endM
        : item.distM >= z.startM && item.distM <= z.endM;
      if (!contained) continue;
      const size = z.endM - z.startM;
      // Two zones with the same extent contain each other; the lower id
      // wins as parent so they can't both disappear into the other.
      if (item.isZone && size === itemSize && z.feature.id > item.feature.id)
        continue;
      if (size < bestSize) {
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

  function toNode(item: ComputedFeature): TreeNode {
    return {
      item,
      nested: (childMap.get(item.feature.id) ?? [])
        .sort((a, b) => a.distM - b.distM)
        .map(toNode),
    };
  }

  return items
    .filter((i) => !nestedIds.has(i.feature.id))
    .sort((a, b) => a.distM - b.distM)
    .map(toNode);
}
