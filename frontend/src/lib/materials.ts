import type {
  Material,
  MaterialBody,
  MaterialCategory,
  MaterialConstruction,
  MaterialDiscipline,
  MaterialFilters,
  MaterialSort,
} from "@/lib/api";
import { humanize, sentenceCase } from "@/lib/format";

/** An enum value as a label: "river_runner" -> "River runner". */
export function enumLabel(value: string): string {
  return sentenceCase(humanize(value));
}

/** Input bounds the server enforces too; the form stops typing at them. */
export const MATERIAL_LIMITS = {
  name: 80,
  description: 4000,
  url: 500,
} as const;

/** The measurements an entry can state. Every one is a number in one unit,
 * which is what lets the comparison put two entries side by side without
 * converting anything. */
export type SpecKey =
  | "length_cm"
  | "width_cm"
  | "height_cm"
  | "volume_l"
  | "weight_kg"
  | "cockpit_length_cm"
  | "cockpit_width_cm"
  | "paddler_weight_min_kg"
  | "paddler_weight_max_kg";

export interface MaterialSpec {
  key: SpecKey;
  label: string;
  unit: string;
  /** Blocks the detail view and the comparison group rows under. */
  group: "hull" | "cockpit" | "paddler";
}

/** Every comparable measurement, in the order both the detail view and the
 * comparison show them. Adding a measurement is one row here. */
export const MATERIAL_SPECS: MaterialSpec[] = [
  { key: "length_cm", label: "Length", unit: "cm", group: "hull" },
  { key: "width_cm", label: "Width", unit: "cm", group: "hull" },
  { key: "height_cm", label: "Height", unit: "cm", group: "hull" },
  { key: "volume_l", label: "Volume", unit: "l", group: "hull" },
  { key: "weight_kg", label: "Weight", unit: "kg", group: "hull" },
  {
    key: "cockpit_length_cm",
    label: "Cockpit length",
    unit: "cm",
    group: "cockpit",
  },
  {
    key: "cockpit_width_cm",
    label: "Cockpit width",
    unit: "cm",
    group: "cockpit",
  },
  {
    key: "paddler_weight_min_kg",
    label: "Paddler from",
    unit: "kg",
    group: "paddler",
  },
  {
    key: "paddler_weight_max_kg",
    label: "Paddler to",
    unit: "kg",
    group: "paddler",
  },
];

export const SPEC_GROUP_LABELS: Record<MaterialSpec["group"], string> = {
  hull: "Hull",
  cockpit: "Cockpit",
  paddler: "Paddler",
};

/** Categories read as written except SUP, which is an acronym. */
export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  kayak: "Kayak",
  canoe: "Canoe",
  packraft: "Packraft",
  sup: "SUP",
};

export const CATEGORIES: MaterialCategory[] = [
  "kayak",
  "canoe",
  "packraft",
  "sup",
];

export const DISCIPLINES: MaterialDiscipline[] = [
  "creek",
  "river_runner",
  "half_slice",
  "playboat",
  "slalom",
  "downriver",
  "touring",
  "sea",
  "expedition",
  "recreational",
];

export const CONSTRUCTIONS: MaterialConstruction[] = [
  "plastic",
  "composite",
  "inflatable",
  "folding",
  "wood",
];

/** How many entries the comparison holds - matches MAX_COMPARE_IDS on the
 * server, which is what an `ids` request returns at most. */
export const MAX_COMPARE = 8;

export function specValue(
  material: Material,
  key: SpecKey,
): number | undefined {
  return material[key] ?? undefined;
}

/** A measurement with its unit, trailing zeros trimmed: "264 cm", "20.5 kg". */
export function formatSpec(
  value: number | undefined,
  spec: MaterialSpec,
): string {
  if (value == null) return "-";
  return `${Number(value.toFixed(1))} ${spec.unit}`;
}

/** Brand, model and variant as one name: "Testflow Cascade M". */
export function materialTitle(material: Material): string {
  return [material.brand, material.model, material.variant]
    .filter(Boolean)
    .join(" ");
}

/** The production run, open at either end: "2022-", "2019-2024", "2020".
 * Empty when the entry states no year at all. */
export function yearsLabel(material: Material): string {
  const { year_from: from, year_to: to } = material;
  if (from == null && to == null) return "";
  if (from == null) return `until ${to}`;
  if (to == null) return `${from}-`;
  return from === to ? `${from}` : `${from}-${to}`;
}

/** The paddler weight window as one line, open at either end. */
export function paddlerRangeLabel(material: Material): string {
  const min = material.paddler_weight_min_kg;
  const max = material.paddler_weight_max_kg;
  if (min == null && max == null) return "";
  if (min == null) return `up to ${max} kg`;
  if (max == null) return `from ${min} kg`;
  return `${min}-${max} kg`;
}

/** What a compared row of one measurement looks like: the lowest and highest
 * value stated, and whether the entries disagree at all. A row where every
 * entry says the same thing is not what the reader is comparing, so the
 * table can step it back. */
export interface SpecSpread {
  min?: number;
  max?: number;
  /** True when at least two entries state different values. */
  varies: boolean;
  /** True when no compared entry states this measurement. */
  empty: boolean;
}

export function specSpread(values: (number | undefined)[]): SpecSpread {
  const stated = values.filter((value): value is number => value != null);
  if (stated.length === 0) return { varies: false, empty: true };
  const min = Math.min(...stated);
  const max = Math.max(...stated);
  return { min, max, varies: min !== max, empty: false };
}

/** The entries a comparison holds, read from and written to the URL, so a
 * comparison is a link somebody can send. */
export function parseCompareIds(raw: string | undefined): number[] {
  if (!raw) return [];
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number(part.trim());
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_COMPARE);
}

export function serializeCompareIds(ids: number[]): string {
  return ids.join(",");
}

/** Add or remove one entry from the comparison, keeping the order entries
 * were picked in. Adding past the cap is ignored rather than dropping an
 * entry the reader chose earlier. */
export function toggleCompareId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((held) => held !== id);
  if (ids.length >= MAX_COMPARE) return ids;
  return [...ids, id];
}

/** The entry form's fields. Every number is held as the text the reader
 * typed, so a half-typed "2." is not rounded away under the cursor; the
 * conversion to an entry happens once, on save. */
export type MaterialFormValues = {
  category: MaterialCategory;
  brand: string;
  model: string;
  variant: string;
  discipline: MaterialDiscipline | "";
  construction: MaterialConstruction | "";
  description: string;
  product_url: string;
  year_from: string;
  year_to: string;
} & Record<SpecKey, string>;

function blankSpecs(): Record<SpecKey, string> {
  return Object.fromEntries(
    MATERIAL_SPECS.map((spec) => [spec.key, ""]),
  ) as Record<SpecKey, string>;
}

/** The blank form a new entry starts from. Category is the one field with no
 * sensible empty state - the wiki is a boat catalog first. */
export function emptyMaterialForm(): MaterialFormValues {
  return {
    category: "kayak",
    brand: "",
    model: "",
    variant: "",
    discipline: "",
    construction: "",
    description: "",
    product_url: "",
    year_from: "",
    year_to: "",
    ...blankSpecs(),
  };
}

/** An existing entry as form fields, for editing it. */
export function materialToForm(material: Material): MaterialFormValues {
  const specs = Object.fromEntries(
    MATERIAL_SPECS.map((spec) => [
      spec.key,
      material[spec.key] == null ? "" : String(material[spec.key]),
    ]),
  ) as Record<SpecKey, string>;
  return {
    category: material.category,
    brand: material.brand,
    model: material.model,
    variant: material.variant ?? "",
    discipline: material.discipline ?? "",
    construction: material.construction ?? "",
    description: material.description ?? "",
    product_url: material.product_url ?? "",
    year_from: material.year_from == null ? "" : String(material.year_from),
    year_to: material.year_to == null ? "" : String(material.year_to),
    ...specs,
  };
}

/** A field left blank is a fact nobody knows, not a zero - it goes to the
 * server as absent so the entry keeps saying nothing about it. */
function optionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function optionalText(raw: string): string | undefined {
  return raw.trim() || undefined;
}

export function materialFormToBody(values: MaterialFormValues): MaterialBody {
  const specs = Object.fromEntries(
    MATERIAL_SPECS.map((spec) => [spec.key, optionalNumber(values[spec.key])]),
  );
  return {
    category: values.category,
    brand: values.brand.trim(),
    model: values.model.trim(),
    variant: optionalText(values.variant),
    discipline: values.discipline || undefined,
    construction: values.construction || undefined,
    description: optionalText(values.description),
    product_url: optionalText(values.product_url),
    year_from: optionalNumber(values.year_from),
    year_to: optionalNumber(values.year_to),
    ...specs,
  };
}

/** Whether the form can be saved at all. Everything past brand and model is
 * optional - a wiki entry with only a name is still worth having, and the
 * next reader can fill the rest in. */
export function canSaveMaterial(values: MaterialFormValues): boolean {
  return values.brand.trim().length > 0 && values.model.trim().length > 0;
}

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
  "length",
  "volume",
  "weight",
];

export const SORT_LABELS: Record<MaterialSort, string> = {
  name: "Name",
  newest: "Newest",
  length: "Length",
  volume: "Volume",
  weight: "Weight",
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

/** How many dimensions the reader has narrowed by, for the filter badge. The
 * free-text query has its own field on screen, so it does not count. */
export function activeFilterCount(search: MaterialWikiSearch): number {
  return [
    search.category,
    search.discipline,
    search.construction,
    search.brand,
    search.fits,
  ].filter((value) => value != null).length;
}
