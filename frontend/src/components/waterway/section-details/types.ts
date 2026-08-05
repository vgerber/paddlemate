import type { Feature, Proposal } from "@/lib/api";

/** A feature with its computed position(s) along the section line. */
export interface ComputedFeature {
  feature: Feature;
  /** Distance of the representative point from the section start (metres). */
  distM: number;
  /** Start of zone extent (metres); equals distM for point features. */
  startM: number;
  /** End of zone extent (metres); equals distM for point features. */
  endM: number;
  /** True when the feature spans a range (LineString, Polygon, or a known zone type). */
  isZone: boolean;
  /** Representative [lng, lat] of the feature's geometry, for map flyTo. */
  coords: [number, number];
  /** Present when this item is a pending proposal rather than an approved feature. */
  proposal?: Proposal;
}

/** One node in the rendered tree: a feature with its direct children.
 * Children of zones can themselves be zones (a rapid inside the whitewater
 * zone containing a hole), so the tree nests recursively. */
export interface TreeNode {
  item: ComputedFeature;
  nested: TreeNode[];
}
