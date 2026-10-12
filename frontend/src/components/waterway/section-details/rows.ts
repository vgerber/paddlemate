import type { SectionWithFeatures } from "@/lib/api";
import { distanceAlongLineM, lineCoords } from "@/lib/geo";
import type { ComputedFeature, TreeNode } from "./types";
import {
  buildTree,
  computeExtent,
  FULL_SECTION_TOLERANCE_M,
  featureName,
} from "./utils";

/** The number each feature carries, on its row and on its map pin: the order
 * of the list, a range before what it holds. Access points keep their own
 * markers, a grade over the whole run has no row, and proposals are
 * unnumbered. */
export function featureNumbers(
  section: SectionWithFeatures,
): Map<number, number> {
  const line = lineCoords(section.location) ?? [];
  const totalM =
    line.length < 2 ? 0 : distanceAlongLineM(line[line.length - 1], line);
  const { rest } = splitWholeRunGrades(
    section.features.map((f) => computeExtent(f, line)),
    totalM,
  );
  const numbers = new Map<number, number>();
  const walk = (nodes: TreeNode[]) => {
    for (const { item, nested } of nodes) {
      const type = item.feature.feature_type;
      if (type !== "put_in" && type !== "take_out") {
        numbers.set(item.feature.id, numbers.size + 1);
      }
      walk(nested);
    }
  };
  walk(rest.length ? buildTree(rest) : []);
  return numbers;
}

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
