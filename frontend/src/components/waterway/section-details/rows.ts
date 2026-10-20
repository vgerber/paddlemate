import type { SectionWithFeatures } from "@/lib/api";
import { plural } from "@/lib/format";
import { lineCoords } from "@/lib/geo";
import { baseSpan, gradeSpans } from "./grade";
import type { ComputedFeature, TreeNode } from "./types";
import { buildTree, computeExtent, featureName, sectionLengthM } from "./utils";

/** The number each feature carries, on its row and on its map pin: the order
 * of the list, a range before what it holds. Access points keep their own
 * markers, the section's base grade has no row, and proposals are
 * unnumbered. */
export function featureNumbers(
  section: SectionWithFeatures,
): Map<number, number> {
  const line = lineCoords(section.location) ?? [];
  const { rest } = splitBaseGrade(
    section.features.map((f) => computeExtent(f, line)),
    sectionLengthM(line),
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

/** Splits the section's base grade, a graded range over most of the run, from
 * the features that get rows. The grade is a fact about the section (the
 * card subtitle), so it has no row, no strip mark and no count. */
export function splitBaseGrade(items: ComputedFeature[], totalM: number) {
  const base = baseSpan(gradeSpans(items), totalM / 1000)?.item ?? null;
  return { grade: base, rest: items.filter((i) => i !== base) };
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

/** The strip says more than the rows when there is something besides the two
 * access points, and more than one row to place. */
export function stripShown(rows: ComputedFeature[]): boolean {
  if (rows.length < 2) return false;
  return rows.some(
    (r) =>
      r.feature.feature_type !== "put_in" &&
      r.feature.feature_type !== "take_out",
  );
}

/** "9 features · 2 proposed": approved rows, then pending ones trailing. */
export function countLabel(approved: number, proposed: number): string {
  const noun = plural(approved, "feature");
  if (approved === 0) return `${proposed} proposed`;
  return proposed > 0 ? `${noun} · ${proposed} proposed` : noun;
}
