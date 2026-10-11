import type { ComputedFeature, TreeNode } from "./types";
import { FULL_SECTION_TOLERANCE_M, featureName } from "./utils";

/** A grade (whitewater range) that covers the whole run: the strip shows it
 * as the grade bar, so it gets no row. */
export function isWholeRunGrade(item: ComputedFeature, totalM: number) {
  return (
    !item.proposal &&
    item.isZone &&
    item.feature.feature_type === "whitewater" &&
    item.startM < FULL_SECTION_TOLERANCE_M &&
    totalM - item.endM < FULL_SECTION_TOLERANCE_M
  );
}

/** Splits the whole-run grades from the features that get rows. */
export function splitWholeRunGrades(items: ComputedFeature[], totalM: number) {
  const grades = items.filter((i) => isWholeRunGrade(i, totalM));
  const rest = items.filter((i) => !isWholeRunGrade(i, totalM));
  return { grades, rest };
}

/** Names of everything a range holds, nested ranges included, in order. */
export function memberNames(node: TreeNode): string[] {
  return node.nested.flatMap((n) => [
    featureName(n.item.feature),
    ...memberNames(n),
  ]);
}

/** A range with members gets the fold; an empty one is just a banded row. */
export function isBand(node: TreeNode): boolean {
  return node.item.isZone && !node.item.proposal && node.nested.length > 0;
}
