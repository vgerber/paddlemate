import type {
  Material,
  MaterialBody,
  MaterialCategory,
  MaterialConstruction,
  MaterialDiscipline,
  MaterialFilters,
  MaterialSort,
  PaddleShaft,
  PaddleShaftMaterial,
} from "@/lib/api";
import {
  formatQuantity,
  fromDisplay,
  parseInput,
  type Quantity,
  toDisplay,
  toInputText,
  type Units,
  unitLabel,
} from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";

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

/** The paddle measurements, each one number in one unit. They are not
 * comparable spec rows (a boat has none), so the form and the detail view
 * read this list instead of MATERIAL_SPECS. */
export type PaddleKey =
  | "blade_area_cm2"
  | "blade_length_cm"
  | "blade_width_cm"
  | "length_min_cm"
  | "length_max_cm";

export const PADDLE_SPECS: {
  key: PaddleKey;
  label: string;
  quantity: Quantity;
}[] = [
  { key: "blade_area_cm2", label: "Blade area", quantity: "area" },
  { key: "blade_length_cm", label: "Blade length", quantity: "length" },
  { key: "blade_width_cm", label: "Blade width", quantity: "length" },
  { key: "length_min_cm", label: "Shortest length", quantity: "length" },
  { key: "length_max_cm", label: "Longest length", quantity: "length" },
];

export const SHAFTS: PaddleShaft[] = ["straight", "bent", "cranked"];

export const SHAFT_MATERIALS: PaddleShaftMaterial[] = [
  "carbon",
  "fiberglass",
  "aluminium",
  "wood",
  "plastic",
  "hybrid",
];

export interface MaterialSpec {
  key: SpecKey;
  label: string;
  quantity: Quantity;
  /** Blocks the detail view and the comparison group rows under. */
  group: "hull" | "cockpit" | "paddler";
}

/** Every comparable measurement, in the order both the detail view and the
 * comparison show them. Adding a measurement is one row here. */
export const MATERIAL_SPECS: MaterialSpec[] = [
  { key: "length_cm", label: "Length", quantity: "length", group: "hull" },
  { key: "width_cm", label: "Width", quantity: "length", group: "hull" },
  { key: "height_cm", label: "Height", quantity: "length", group: "hull" },
  { key: "volume_l", label: "Volume", quantity: "volume", group: "hull" },
  { key: "weight_kg", label: "Weight", quantity: "weight", group: "hull" },
  {
    key: "cockpit_length_cm",
    label: "Cockpit length",
    quantity: "length",
    group: "cockpit",
  },
  {
    key: "cockpit_width_cm",
    label: "Cockpit width",
    quantity: "length",
    group: "cockpit",
  },
  {
    key: "paddler_weight_min_kg",
    label: "Paddler from",
    quantity: "weight",
    group: "paddler",
  },
  {
    key: "paddler_weight_max_kg",
    label: "Paddler to",
    quantity: "weight",
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
  paddle: "Paddle",
};

export const CATEGORIES: MaterialCategory[] = [
  "kayak",
  "canoe",
  "packraft",
  "sup",
  "paddle",
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
  "crossover",
  "freestyle",
  "other",
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

/** A measurement in the chosen unit, trailing zeros trimmed: "264 cm",
 * "103.9 in", "20.5 kg". */
export function formatSpec(
  value: number | undefined,
  spec: MaterialSpec,
  units: Units,
): string {
  if (value == null) return "-";
  return formatQuantity(spec.quantity, value, units);
}

/** Brand, model and variant as one name: "Testflow Cascade M". */
export function materialTitle(material: Material): string {
  return [material.brand, material.model, material.variant]
    .filter(Boolean)
    .join(" ");
}

/** The production run, open at either end: "2022-", "2019-2024", "2020".
 * Empty when the entry states no year at all. A year that rests on a weak
 * source reads "about 2022-"; an open start reads "until about 2024". */
export function yearsLabel(material: Material): string {
  const { year_from: from, year_to: to } = material;
  if (from == null && to == null) return "";
  const about = material.year_approximate ? "about " : "";
  if (from == null) return `until ${about}${to}`;
  if (to == null) return `${about}${from}-`;
  return from === to ? `${about}${from}` : `${about}${from}-${to}`;
}

/** The paddler weight window as one line, open at either end. */
export function paddlerRangeLabel(material: Material, units: Units): string {
  const min = material.paddler_weight_min_kg;
  const max = material.paddler_weight_max_kg;
  if (min == null && max == null) return "";
  const num = (kg: number) =>
    String(Number(toDisplay("weight", kg, units).toFixed(1)));
  const unit = unitLabel("weight", units);
  if (min == null) return `up to ${num(max as number)} ${unit}`;
  if (max == null) return `from ${num(min)} ${unit}`;
  return `${num(min)}-${num(max)} ${unit}`;
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
  year_approximate: boolean;
  notes: string;
  /** Colourways, comma separated. */
  colors: string;
  /** Sizes offered, comma separated, in the chosen length unit. */
  lengths_cm: string;
  /** Feather angles, comma separated, in degrees. */
  feather_deg: string;
  pieces: string;
  shaft: PaddleShaft | "";
  shaft_material: PaddleShaftMaterial | "";
  blade_material: string;
  shaft_diameter: string;
} & Record<SpecKey | PaddleKey, string>;

function blankSpecs(): Record<SpecKey | PaddleKey, string> {
  return Object.fromEntries(
    [...MATERIAL_SPECS, ...PADDLE_SPECS].map((spec) => [spec.key, ""]),
  ) as Record<SpecKey | PaddleKey, string>;
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
    year_approximate: false,
    notes: "",
    colors: "",
    lengths_cm: "",
    feather_deg: "",
    pieces: "",
    shaft: "",
    shaft_material: "",
    blade_material: "",
    shaft_diameter: "",
    ...blankSpecs(),
  };
}

function numberText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function listText(
  values: number[] | null | undefined,
  quantity: Quantity,
  units: Units,
): string {
  return (values ?? [])
    .map((value) => toInputText(quantity, value, units))
    .join(", ");
}

/** An existing entry as form fields, for editing it. The measurements are
 * shown in the chosen units. */
export function materialToForm(
  material: Material,
  units: Units,
): MaterialFormValues {
  const specs = Object.fromEntries(
    [...MATERIAL_SPECS, ...PADDLE_SPECS].map((spec) => {
      const value = material[spec.key];
      return [
        spec.key,
        value == null ? "" : toInputText(spec.quantity, value, units),
      ];
    }),
  ) as Record<SpecKey | PaddleKey, string>;
  return {
    category: material.category,
    brand: material.brand,
    model: material.model,
    variant: material.variant ?? "",
    discipline: material.discipline ?? "",
    construction: material.construction ?? "",
    description: material.description ?? "",
    product_url: material.product_url ?? "",
    year_from: numberText(material.year_from),
    year_to: numberText(material.year_to),
    year_approximate: material.year_approximate,
    notes: material.notes ?? "",
    colors: material.colors.join(", "),
    lengths_cm: listText(material.lengths_cm, "length", units),
    feather_deg: (material.feather_deg ?? []).join(", "),
    pieces: numberText(material.pieces),
    shaft: material.shaft ?? "",
    shaft_material: material.shaft_material ?? "",
    blade_material: material.blade_material ?? "",
    shaft_diameter: material.shaft_diameter ?? "",
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

/** Numbers separated by commas or spaces; anything else is dropped. */
function parseNumberList(raw: string): number[] {
  const numbers = raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  return numbers.filter((value, i) => numbers.indexOf(value) === i);
}

/** The form as a request body. The measurements were typed in the chosen
 * units and go to the server in metric. A PUT replaces the whole entry, so
 * every field is sent. `original` is the entry being edited: a field the
 * reader did not touch keeps its stored value instead of the one that went
 * through the display rounding (294.99 l must not replace 295 l). */
export function materialFormToBody(
  values: MaterialFormValues,
  units: Units,
  original?: Material,
): MaterialBody {
  const shown = original ? materialToForm(original, units) : undefined;
  const untouched = (key: keyof MaterialFormValues) =>
    shown != null && shown[key] === values[key];

  const metric = (key: SpecKey | PaddleKey, quantity: Quantity) => {
    if (original && untouched(key)) return original[key] ?? undefined;
    return parseInput(quantity, values[key], units);
  };
  const specs = Object.fromEntries(
    [...MATERIAL_SPECS, ...PADDLE_SPECS].map((spec) => [
      spec.key,
      metric(spec.key, spec.quantity),
    ]),
  );
  const isPaddle = values.category === "paddle";
  const lengths =
    original && untouched("lengths_cm")
      ? (original.lengths_cm ?? undefined)
      : parseNumberList(values.lengths_cm).map((value) =>
          fromDisplay("length", value, units),
        );
  const paddle = isPaddle
    ? {
        lengths_cm: lengths?.length ? lengths : undefined,
        feather_deg: parseNumberList(values.feather_deg).length
          ? parseNumberList(values.feather_deg)
          : undefined,
        pieces: optionalNumber(values.pieces),
        shaft: values.shaft || undefined,
        shaft_material: values.shaft_material || undefined,
        blade_material: optionalText(values.blade_material),
        shaft_diameter: optionalText(values.shaft_diameter),
      }
    : {};
  // The paddle measurements belong to a paddle; a boat never sends them.
  if (!isPaddle) {
    for (const spec of PADDLE_SPECS) delete specs[spec.key];
  }
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
    year_approximate: values.year_approximate,
    notes: optionalText(values.notes),
    colors: values.colors
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean),
    ...specs,
    ...paddle,
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

/** The lengths a paddle comes in: the sizes it is sold in, else the
 * adjustable range. Empty when the entry states neither. */
export function paddleLengthLabel(material: Material, units: Units): string {
  const num = (cm: number) =>
    String(Number(toDisplay("length", cm, units).toFixed(1)));
  const unit = unitLabel("length", units);
  const sizes = material.lengths_cm ?? [];
  if (sizes.length > 0) return `${sizes.map(num).join(", ")} ${unit}`;
  const { length_min_cm: min, length_max_cm: max } = material;
  if (min != null && max != null) return `${num(min)}-${num(max)} ${unit}`;
  if (min != null || max != null) {
    return `${num((min ?? max) as number)} ${unit}`;
  }
  return "";
}

/** A paddle's specs as labelled values in the chosen units, the ones the
 * entry states only. */
export function paddleFacts(
  material: Material,
  units: Units,
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) facts.push({ label, value });
  };
  const measured = (key: PaddleKey) => {
    const spec = PADDLE_SPECS.find((candidate) => candidate.key === key);
    const value = material[key];
    return spec && value != null
      ? formatQuantity(spec.quantity, value, units)
      : undefined;
  };
  add("Blade area", measured("blade_area_cm2"));
  add("Blade length", measured("blade_length_cm"));
  add("Blade width", measured("blade_width_cm"));
  add("Length", paddleLengthLabel(material, units));
  if (material.pieces != null) add("Pieces", String(material.pieces));
  if (material.shaft) add("Shaft", enumLabel(material.shaft));
  if (material.shaft_material) {
    add("Shaft material", enumLabel(material.shaft_material));
  }
  add("Blade material", material.blade_material ?? undefined);
  const feather = material.feather_deg ?? [];
  if (feather.length > 0) add("Feather", `${feather.join(", ")}°`);
  add("Shaft diameter", material.shaft_diameter ?? undefined);
  if (material.weight_kg != null) {
    add("Weight", formatQuantity("weight", material.weight_kg, units));
  }
  return facts;
}

/** Where an entry's values came from: one row per page, with the fields it
 * backs. `sources` is a field-to-URL map; anything that is not an http(s)
 * link is ignored, so a malformed row cannot put a script URL on the page. */
export function sourceLinks(
  sources: unknown,
): { url: string; host: string; fields: string[] }[] {
  if (!sources || typeof sources !== "object") return [];
  const byUrl = new Map<string, string[]>();
  for (const [field, url] of Object.entries(sources)) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    const label = humanize(field.replace(/_(cm2|cm|kg|l|deg)$/, ""));
    byUrl.set(url, [...(byUrl.get(url) ?? []), label]);
  }
  return [...byUrl].map(([url, fields]) => {
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // keep the raw text
    }
    return { url, host, fields };
  });
}
