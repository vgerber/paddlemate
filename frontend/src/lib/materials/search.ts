import {
  type MaterialCategory,
  type MaterialConstruction,
  type MaterialDiscipline,
  type MaterialFilters,
  type MaterialSort,
} from "@/lib/api";
import { CATEGORIES, CONSTRUCTIONS, DISCIPLINES } from "./specs";

/** The wiki list route's search-param shape. It is the filter state and the
 * comparison at once, so a filtered list with entries picked is one link. */
export interface MaterialWikiSearch {
  q?: string;
  category?: MaterialCategory;
  discipline?: MaterialDiscipline;
  construction?: MaterialConstruction;
  brand?: string;
  sort?: MaterialSort;
  /** Body weight in kg - keeps the boats whose paddler range covers it. */
  fits?: number;
  /** Entries held in the comparison, comma separated. */
  compare?: string;
}

/** Every search key cleared. TanStack Router wants the complete object on a
 * cross-route navigation - spread this and set only the keys you need. */
export const EMPTY_MATERIAL_SEARCH: {
  [K in keyof MaterialWikiSearch]: undefined;
} = {
  q: undefined,
  category: undefined,
  discipline: undefined,
  construction: undefined,
  brand: undefined,
  sort: undefined,
  fits: undefined,
  compare: undefined,
};

/** Narrow one raw search param to a known value of its dimension. Anything
 * else - a hand-edited URL, a renamed enum - reads as "no filter" rather
 * than reaching the API as garbage. */
function oneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

export const SORTS: MaterialSort[] = [
  "name",
  "newest",
  "added",
  "length",
  "volume",
  "weight",
];

/** What each sort puts first: the newest model year, the latest filing, and
 * the smallest value of a model's sizes for the measures. */
export const SORT_LABELS: Record<MaterialSort, string> = {
  name: "Name",
  newest: "Newest model",
  added: "Recently added",
  length: "Shortest first",
  volume: "Smallest volume",
  weight: "Lightest first",
};

/** Heaviest body weight the filter takes; the server bounds a paddler's
 * weight the same way. */
export const MAX_FITS_KG = 500;

/** A text search param. The router reads `?q=2000` as the number 2000, so a
 * number is the text it was typed as. */
export function searchText(raw: unknown): string | undefined {
  if (typeof raw === "number") return String(raw);
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

export function parseMaterialSearch(
  raw: Record<string, unknown>,
): MaterialWikiSearch {
  const fits = Number(raw.fits);
  return {
    q: searchText(raw.q),
    category: oneOf(raw.category, CATEGORIES),
    discipline: oneOf(raw.discipline, DISCIPLINES),
    construction: oneOf(raw.construction, CONSTRUCTIONS),
    brand: searchText(raw.brand),
    sort: oneOf(raw.sort, SORTS),
    fits:
      Number.isFinite(fits) && fits > 0 && fits <= MAX_FITS_KG
        ? fits
        : undefined,
    compare: searchText(raw.compare),
  };
}

/** The API filters a search state asks for. The comparison lives in the URL
 * beside the filters but is not one of them - it is fetched by id. */
export function toMaterialFilters(search: MaterialWikiSearch): MaterialFilters {
  return {
    q: search.q,
    category: search.category,
    discipline: search.discipline,
    construction: search.construction,
    brand: search.brand,
    sort: search.sort,
    fits_paddler_kg: search.fits,
  };
}

/** How many filters beside the tree's levels are set, for the Filters badge.
 * The free-text query has its own field, and the category, discipline and
 * brand are the path the tree shows. */
export function activeFilterCount(search: MaterialWikiSearch): number {
  return [search.construction, search.fits].filter((value) => value != null)
    .length;
}
