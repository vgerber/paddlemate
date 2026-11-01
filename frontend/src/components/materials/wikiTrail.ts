import type { Crumb } from "@/components/Breadcrumb";
import type { MaterialWikiSearch } from "@/lib/materials/search";
import { crumbs, type TreePath } from "@/lib/materials/tree";

/** The tree path as breadcrumb steps; the last is where the list stands. */
export function wikiSteps(
  search: MaterialWikiSearch,
  select: (path: TreePath) => void,
): Crumb[] {
  const steps = crumbs(search);
  return steps.map((step, i) => ({
    label: step.label,
    onClick: i === steps.length - 1 ? undefined : () => select(step.patch),
  }));
}

/** The desktop trail: Tools, the wiki, then the path. */
export function wikiTrail(
  search: MaterialWikiSearch,
  select: (path: TreePath) => void,
  onTools: () => void,
): Crumb[] {
  const steps = wikiSteps(search, select);
  return [
    { label: "Tools", onClick: onTools },
    {
      label: "Material wiki",
      onClick: steps.length ? () => select({}) : undefined,
    },
    ...steps,
  ];
}
