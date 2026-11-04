import type {
  MaterialCategory,
  MaterialDiscipline,
  MaterialFilters,
  MaterialModel,
  MaterialTree,
  MaterialTreeCategory,
  MaterialTreeDiscipline,
  MaterialUse,
} from "@/lib/api";
import { type MaterialWikiSearch } from "./search";
import { CATEGORIES, disciplineLabel, USE_LABELS } from "./specs";

/** Said wherever group counts show: a model is counted once in its category
 * and once in each group it belongs to. */
export const GROUP_COUNT_NOTE =
  "A model in several groups is counted in each; its category counts it once.";

/** The level of the browse tree a node sits on. */
export type TreeKind = "category" | "use" | "discipline" | "brand" | "model";

/** The tree's own levels in a search: what a node selects. Only kayaks have
 * a use between the category and the discipline. */
export interface TreePath {
  category?: MaterialCategory;
  use?: MaterialUse;
  discipline?: MaterialDiscipline;
  brand?: string;
}

/** Categories named for what the tree holds, so "Kayaks" rather than "Kayak". */
export const CATEGORY_PLURALS: Record<MaterialCategory, string> = {
  kayak: "Kayaks",
  canoe: "Canoes",
  packraft: "Packrafts",
  sup: "SUPs",
  paddle: "Paddles",
};

/** The search patch that selects a path and clears every level below it, so
 * a leftover brand never survives a change of category. */
export function pathPatch(path: TreePath): TreePath {
  return {
    category: path.category,
    use: path.category ? path.use : undefined,
    discipline: path.category ? path.discipline : undefined,
    brand: path.category && path.discipline ? path.brand : undefined,
  };
}

/** The use a discipline falls under in a category, from the tree. */
function usageOf(
  cat: MaterialTreeCategory,
  discipline: MaterialDiscipline,
): MaterialUse | undefined {
  return cat.uses?.find((u) =>
    u.disciplines.some((d) => d.discipline === discipline),
  )?.use;
}

/** A path with its use filled in when only the discipline is named, as in an
 * older link (`?category=kayak&discipline=creek`). */
export function resolvePath(
  path: TreePath,
  tree: MaterialTree | undefined,
): TreePath {
  if (!path.category || !path.discipline || path.use || !tree) return path;
  const cat = tree.categories.find((c) => c.category === path.category);
  const use = cat && usageOf(cat, path.discipline);
  return use ? { ...path, use } : path;
}

/** Where a search stands in the tree. */
export function pathOf(
  search: MaterialWikiSearch,
  tree?: MaterialTree,
): TreePath {
  return resolvePath(pathPatch(search), tree);
}

/** A node's id: its path joined, stable across reloads and cases. */
export function nodeId(path: TreePath): string {
  return [path.category, path.use, path.discipline, path.brand?.toLowerCase()]
    .filter(Boolean)
    .join("/");
}

/** One visible row of the tree. */
export interface TreeRow {
  id: string;
  kind: TreeKind;
  /** 1 for a category, one more for each level below. */
  level: number;
  label: string;
  /** Models below the node; absent on a model, which shows its sizes. */
  count?: number;
  /** The sizes of a model, as they read in the row. */
  sizes?: string;
  parentId?: string;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  path: TreePath;
  /** The entry a model row opens. */
  modelId?: number;
}

/** Whether `id` is on the way to the selection, or is it. */
function onPath(id: string, selected: string): boolean {
  return selected === id || selected.startsWith(`${id}/`);
}

/** The rows the tree shows. A node is open when the reader toggled it open,
 * or when it holds the selection and was not toggled shut. Only the selected
 * brand lists its models. */
export function treeRows(
  tree: MaterialTree | undefined,
  search: MaterialWikiSearch,
  toggled: ReadonlyMap<string, boolean>,
  models: MaterialModel[] | undefined,
): TreeRow[] {
  const selectedPath = pathOf(search, tree);
  const selectedId = nodeId(selectedPath);
  const isOpen = (id: string) => toggled.get(id) ?? onPath(id, selectedId);
  const rows: TreeRow[] = [];

  const pushGroups = (
    cat: MaterialTreeCategory,
    groups: MaterialTreeDiscipline[],
    base: TreePath,
    parentId: string,
    level: number,
  ) => {
    for (const disc of groups) {
      const discPath = { ...base, discipline: disc.discipline };
      const discId = nodeId(discPath);
      const discOpen = isOpen(discId) && disc.brands.length > 0;
      rows.push({
        id: discId,
        kind: "discipline",
        level,
        label: disciplineLabel(disc.discipline, cat.category),
        count: disc.models,
        parentId,
        expandable: disc.brands.length > 0,
        expanded: discOpen,
        selected: selectedId === discId,
        path: discPath,
      });
      if (!discOpen) continue;
      for (const brand of disc.brands) {
        const brandPath = { ...discPath, brand: brand.brand };
        const brandId = nodeId(brandPath);
        const mine = selectedId === brandId;
        const brandOpen = mine && isOpen(brandId);
        rows.push({
          id: brandId,
          kind: "brand",
          level: level + 1,
          label: brand.brand,
          count: brand.models,
          parentId: discId,
          expandable: true,
          expanded: brandOpen,
          selected: mine,
          path: brandPath,
        });
        if (!brandOpen) continue;
        for (const model of models ?? []) {
          const first = model.sizes[0];
          if (!first) continue;
          rows.push({
            id: `${brandId}/#${first.id}`,
            kind: "model",
            level: level + 2,
            label: [model.model, model.variant].filter(Boolean).join(" "),
            sizes: model.sizes
              .map((s) => s.size)
              .filter(Boolean)
              .join(" · "),
            parentId: brandId,
            expandable: false,
            expanded: false,
            selected: false,
            path: brandPath,
            modelId: first.id,
          });
        }
      }
    }
  };

  const categories = [...(tree?.categories ?? [])].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category),
  );
  for (const cat of categories) {
    const catPath = { category: cat.category };
    const catId = nodeId(catPath);
    const children = cat.uses ? cat.uses.length : cat.disciplines.length;
    const catOpen = isOpen(catId) && children > 0;
    rows.push({
      id: catId,
      kind: "category",
      level: 1,
      label: CATEGORY_PLURALS[cat.category],
      count: cat.models,
      expandable: children > 0,
      expanded: catOpen,
      selected: selectedId === catId,
      path: catPath,
    });
    if (!catOpen) continue;
    if (!cat.uses) {
      pushGroups(cat, cat.disciplines, catPath, catId, 2);
      continue;
    }
    for (const use of cat.uses) {
      const usePath = { ...catPath, use: use.use };
      const useId = nodeId(usePath);
      const useOpen = isOpen(useId) && use.disciplines.length > 0;
      rows.push({
        id: useId,
        kind: "use",
        level: 2,
        label: USE_LABELS[use.use],
        count: use.models,
        parentId: catId,
        expandable: use.disciplines.length > 0,
        expanded: useOpen,
        selected: selectedId === useId,
        path: usePath,
      });
      if (useOpen) pushGroups(cat, use.disciplines, usePath, useId, 3);
    }
  }
  return rows;
}

/** One crumb of the path: its label, and the patch that goes back to it. */
export interface Crumb {
  label: string;
  patch: TreePath;
}

/** The selected path as crumbs, outermost first. */
export function crumbs(
  search: MaterialWikiSearch,
  tree?: MaterialTree,
): Crumb[] {
  const path = pathOf(search, tree);
  const out: Crumb[] = [];
  if (path.category) {
    out.push({
      label: CATEGORY_PLURALS[path.category],
      patch: { category: path.category },
    });
  }
  if (path.use) {
    out.push({
      label: USE_LABELS[path.use],
      patch: { category: path.category, use: path.use },
    });
  }
  if (path.discipline) {
    out.push({
      label: disciplineLabel(path.discipline, path.category),
      patch: {
        category: path.category,
        use: path.use,
        discipline: path.discipline,
      },
    });
  }
  if (path.brand) out.push({ label: path.brand, patch: path });
  return out;
}

/** What the Browse chip says: where the list stands in the tree. */
export function browseLabel(
  search: MaterialWikiSearch,
  tree?: MaterialTree,
): string {
  const steps = crumbs(search, tree);
  return steps.length ? steps.map((c) => c.label).join(" · ") : "All gear";
}

function totals(node: { models: number; entries: number }) {
  return { models: node.models, entries: node.entries };
}

/** The node the path ends at, in the tree: its models and sizes. Without a
 * path it is the whole tree. */
export function selectedTotals(
  tree: MaterialTree | undefined,
  search: TreePath,
): { models: number; entries: number } | undefined {
  if (!tree) return undefined;
  const { category, use, discipline, brand } = resolvePath(
    pathPatch(search),
    tree,
  );
  if (!category) {
    return tree.categories.reduce(
      (sum, c) => ({
        models: sum.models + c.models,
        entries: sum.entries + c.entries,
      }),
      { models: 0, entries: 0 },
    );
  }
  const none = { models: 0, entries: 0 };
  const cat = tree.categories.find((c) => c.category === category);
  if (!cat) return none;
  let node: { models: number; entries: number } = totals(cat);
  let groups: MaterialTreeDiscipline[] = cat.disciplines;
  if (cat.uses) {
    if (!use) return node;
    const hit = cat.uses.find((u) => u.use === use);
    if (!hit) return none;
    node = totals(hit);
    groups = hit.disciplines;
  }
  if (!discipline) return node;
  const disc = groups.find((d) => d.discipline === discipline);
  if (!disc) return none;
  if (!brand) return totals(disc);
  const hit = disc.brands.find(
    (b) => b.brand.toLowerCase() === brand.toLowerCase(),
  );
  return hit ? totals(hit) : none;
}

/** The filters the tree honours: the search text and the measures, never its
 * own levels (it is what they pick from) and never the sort. */
export function treeFilters(
  search: MaterialWikiSearch,
): Pick<
  MaterialFilters,
  "q" | "construction" | "availability" | "fits_paddler_kg"
> {
  return {
    q: search.q,
    construction: search.construction,
    availability: search.availability,
    fits_paddler_kg: search.fits,
  };
}
