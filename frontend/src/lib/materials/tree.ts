import type {
  MaterialCategory,
  MaterialDiscipline,
  MaterialFilters,
  MaterialModel,
  MaterialTree,
} from "@/lib/api";
import { type MaterialWikiSearch } from "./search";
import { CATEGORIES, disciplineLabel } from "./specs";

/** The level of the browse tree a node sits on. */
/** Said wherever group counts show: a model is counted once in its category
 * and once in each group it belongs to. */
export const GROUP_COUNT_NOTE =
  "A model in several groups is counted in each; its category counts it once.";

export type TreeKind = "category" | "discipline" | "brand" | "model";

/** The tree's own levels in a search: what a node selects. */
export interface TreePath {
  category?: MaterialCategory;
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
    discipline: path.category ? path.discipline : undefined,
    brand: path.category && path.discipline ? path.brand : undefined,
  };
}

/** Where a search stands in the tree. */
export function pathOf(search: MaterialWikiSearch): TreePath {
  return pathPatch(search);
}

/** A node's id: its path joined, stable across reloads and cases. */
export function nodeId(path: TreePath): string {
  return [path.category, path.discipline, path.brand?.toLowerCase()]
    .filter(Boolean)
    .join("/");
}

/** One visible row of the tree. */
export interface TreeRow {
  id: string;
  kind: TreeKind;
  /** 1 for a category, 4 for a model. */
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
  const selectedPath = pathOf(search);
  const selectedId = nodeId(selectedPath);
  const isOpen = (id: string) => toggled.get(id) ?? onPath(id, selectedId);
  const rows: TreeRow[] = [];
  const categories = [...(tree?.categories ?? [])].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category),
  );
  for (const cat of categories) {
    const catPath = { category: cat.category };
    const catId = nodeId(catPath);
    const catOpen = isOpen(catId) && cat.disciplines.length > 0;
    rows.push({
      id: catId,
      kind: "category",
      level: 1,
      label: CATEGORY_PLURALS[cat.category],
      count: cat.models,
      expandable: cat.disciplines.length > 0,
      expanded: catOpen,
      selected: selectedId === catId,
      path: catPath,
    });
    if (!catOpen) continue;
    for (const disc of cat.disciplines) {
      const discPath = { ...catPath, discipline: disc.discipline };
      const discId = nodeId(discPath);
      const discOpen = isOpen(discId) && disc.brands.length > 0;
      rows.push({
        id: discId,
        kind: "discipline",
        level: 2,
        label: disciplineLabel(disc.discipline, cat.category),
        count: disc.models,
        parentId: catId,
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
          level: 3,
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
            level: 4,
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
  }
  return rows;
}

/** One crumb of the path: its label, and the patch that goes back to it. */
export interface Crumb {
  label: string;
  patch: TreePath;
}

/** The selected path as crumbs, outermost first. */
export function crumbs(search: MaterialWikiSearch): Crumb[] {
  const path = pathOf(search);
  const out: Crumb[] = [];
  if (path.category) {
    out.push({
      label: CATEGORY_PLURALS[path.category],
      patch: { category: path.category },
    });
  }
  if (path.discipline) {
    out.push({
      label: disciplineLabel(path.discipline, path.category),
      patch: { category: path.category, discipline: path.discipline },
    });
  }
  if (path.brand) out.push({ label: path.brand, patch: path });
  return out;
}

/** What the Browse chip says: where the list stands in the tree. */
export function browseLabel(search: MaterialWikiSearch): string {
  const steps = crumbs(search);
  return steps.length ? steps.map((c) => c.label).join(" \u00b7 ") : "All gear";
}

function totals(node: { models: number; entries: number }) {
  return { models: node.models, entries: node.entries };
}

/** The node the path ends at, in the tree: its models and sizes. Without a
 * path it is the whole tree. */
export function selectedTotals(
  tree: MaterialTree | undefined,
  search: MaterialWikiSearch,
): { models: number; entries: number } | undefined {
  if (!tree) return undefined;
  const { category, discipline, brand } = pathOf(search);
  if (!category) {
    return tree.categories.reduce(
      (sum, c) => ({
        models: sum.models + c.models,
        entries: sum.entries + c.entries,
      }),
      { models: 0, entries: 0 },
    );
  }
  const cat = tree.categories.find((c) => c.category === category);
  if (!cat) return { models: 0, entries: 0 };
  if (!discipline) return totals(cat);
  const disc = cat.disciplines.find((d) => d.discipline === discipline);
  if (!disc) return { models: 0, entries: 0 };
  if (!brand) return totals(disc);
  const hit = disc.brands.find(
    (b) => b.brand.toLowerCase() === brand.toLowerCase(),
  );
  return hit ? totals(hit) : { models: 0, entries: 0 };
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
