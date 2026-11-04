import {
  type Material,
  type MaterialAvailability,
  type MaterialCategory,
} from "@/lib/api";
import {
  bareQuantity,
  formatQuantity,
  type Quantity,
  toDisplay,
  type Units,
  unitLabel,
} from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";
import { AVAILABILITY_LABELS } from "./availability";
import {
  CATEGORY_LABELS,
  MATERIAL_SPECS,
  PADDLE_SPECS,
  type PaddleKey,
} from "./specs";

const FIELD_LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  variant: "Variant",
  size: "Size",
  category: "Category",
  disciplines: "Groups",
  construction: "Construction",
  year_from: "First year",
  year_to: "Last year",
  year_approximate: "Years approximate",
  availability: "Availability",
  availability_source: "Availability source",
  availability_checked: "Availability checked",
  lengths_cm: "Sizes",
  feather_deg: "Feather angles",
  shaft: "Shaft",
  shaft_material: "Shaft material",
  blade_material: "Blade material",
  shaft_diameter: "Shaft diameter",
  pieces: "Pieces",
  colors: "Colours",
  description: "Description",
  notes: "Notes",
  product_url: "Manufacturer page",
};

const FIELD_QUANTITIES: Record<string, Quantity> = {
  ...Object.fromEntries(MATERIAL_SPECS.map((s) => [s.key, s.quantity])),
  ...Object.fromEntries(PADDLE_SPECS.map((s) => [s.key, s.quantity])),
  lengths_cm: "length",
};

/** The label of an entry field, as the wiki and its form say it. */
export function materialFieldLabel(key: string): string {
  const spec = [...MATERIAL_SPECS, ...PADDLE_SPECS].find((s) => s.key === key);
  return spec?.label ?? FIELD_LABELS[key] ?? sentenceCase(humanize(key));
}

/** An entry field's stored value in words: measurements in the reader's
 * units, enums as labels, lists as comma lists. Empty reads "none". */
export function materialFieldValue(
  key: string,
  value: unknown,
  units: Units,
): string {
  if (value === null || value === undefined || value === "") return "none";
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    const quantity = FIELD_QUANTITIES[key];
    return value
      .map((v) =>
        typeof v === "number" && quantity
          ? formatQuantity(quantity, v, units)
          : key === "disciplines"
            ? sentenceCase(humanize(String(v)))
            : String(v),
      )
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    const quantity = FIELD_QUANTITIES[key];
    return quantity ? formatQuantity(quantity, value, units) : String(value);
  }
  if (typeof value === "string") {
    if (key === "availability" && value in AVAILABILITY_LABELS) {
      return AVAILABILITY_LABELS[value as MaterialAvailability];
    }
    return key === "category" && value in CATEGORY_LABELS
      ? CATEGORY_LABELS[value as MaterialCategory]
      : ["construction", "shaft", "shaft_material"].includes(key)
        ? sentenceCase(humanize(value))
        : value;
  }
  return String(value);
}

/** Brand, model and variant as one name: "Pyranha Scorch PRO". */
export function modelTitle(
  model: Pick<Material, "brand" | "model" | "variant">,
): string {
  return [model.brand, model.model, model.variant].filter(Boolean).join(" ");
}

/** The model's name plus the size of this entry: "Pyranha Scorch M". */
export function materialTitle(
  material: Pick<Material, "brand" | "model" | "variant" | "size">,
): string {
  return [modelTitle(material), material.size].filter(Boolean).join(" ");
}

const LETTER_SIZES = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "XL", "XXL"];

/** Sort key of a size label, matching the server: XS..XL first, then numbers,
 * then anything else as written. */
function sizeRank(size: string | null | undefined): [number, number, string] {
  const label = size ?? "";
  const letter = LETTER_SIZES.indexOf(label.toUpperCase());
  if (letter >= 0) return [0, letter, label];
  const number = Number.parseFloat(label);
  if (Number.isFinite(number)) return [1, number, label];
  return [2, 0, label];
}

/** Order two size labels: XS, S, M, L, XL, then numeric, then the rest. */
export function compareSizes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const [ra, na, ta] = sizeRank(a);
  const [rb, nb, tb] = sizeRank(b);
  return ra - rb || na - nb || ta.localeCompare(tb);
}

/** The sizes of an entry's model, itself included, in size order. Empty when
 * the model has one entry, so a single size shows no picker. */
export function modelSizes(
  material: Pick<Material, "id" | "size" | "siblings">,
): { id: number; size?: string | null }[] {
  if (material.siblings.length === 0) return [];
  return [{ id: material.id, size: material.size }, ...material.siblings].sort(
    (a, b) => compareSizes(a.size, b.size),
  );
}

/** A handful of fixed lengths as a list, "191, 194, 197 cm"; more than that
 * reads as the range they span. */
export function lengthsLabel(lengths: number[], units: Units): string {
  const unique = [...new Set(lengths)].sort((a, b) => a - b);
  if (unique.length > 5) return rangeLabel("length", unique, units);
  const num = (cm: number) =>
    String(Number(toDisplay("length", cm, units).toFixed(1)));
  return `${unique.map(num).join(", ")} ${unitLabel("length", units)}`;
}

/** The lowest and highest stated value as one phrase in the chosen unit:
 * "259-279 cm", "24.5 kg". Empty when no value is stated. */
export function rangeLabel(
  quantity: Quantity,
  values: (number | null | undefined)[],
  units: Units,
): string {
  const stated = values.filter((value): value is number => value != null);
  if (stated.length === 0) return "";
  const num = (metric: number) => bareQuantity(quantity, metric, units);
  const min = num(Math.min(...stated));
  const max = num(Math.max(...stated));
  const unit = unitLabel(quantity, units);
  return min === max ? `${min} ${unit}` : `${min}-${max} ${unit}`;
}

/** The production run, open at either end: "2022-", "2019-2024", "2020".
 * Empty when the entry states no year at all. A year that rests on a weak
 * source reads "about 2022-"; an open start reads "until about 2024". */
export function yearsLabel(
  material: Pick<Material, "year_from" | "year_to" | "year_approximate">,
): string {
  const { year_from: from, year_to: to } = material;
  if (from == null && to == null) return "";
  const about = material.year_approximate ? "about " : "";
  if (from == null) return `until ${about}${to}`;
  if (to == null) return `${about}${from}-`;
  return from === to ? `${about}${from}` : `${about}${from}-${to}`;
}

/** The run of a model as a row or a column reads it: "since 2021" for a model
 * still built, "about 2010" when that start is a weak source, the plain years
 * otherwise. */
export function sinceLabel(
  material: Pick<Material, "year_from" | "year_to" | "year_approximate">,
): string {
  const { year_from: from, year_to: to } = material;
  if (from != null && to == null) {
    return material.year_approximate ? `about ${from}` : `since ${from}`;
  }
  return yearsLabel(material);
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

/** The paddler-weight filter as a chip reads. */
export function formatFits(kg: number, units: Units): string {
  return `Fits ${formatQuantity("weight", kg, units)}`;
}

/** The lengths a paddle comes in: the sizes it is sold in, else the
 * adjustable range. Empty when the entry states neither. */
export function paddleLengthLabel(
  material: Material,
  units: Units,
  withUnit = true,
): string {
  const num = (cm: number) => bareQuantity("length", cm, units);
  const unit = withUnit ? ` ${unitLabel("length", units)}` : "";
  const sizes = material.lengths_cm ?? [];
  if (sizes.length > 0) return `${sizes.map(num).join(", ")}${unit}`;
  const { length_min_cm: min, length_max_cm: max } = material;
  if (min != null && max != null) return `${num(min)}-${num(max)}${unit}`;
  if (min != null || max != null) {
    return `${num((min ?? max) as number)}${unit}`;
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
  if (material.category !== "paddle") return facts;
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
  if (material.shaft) add("Shaft", sentenceCase(humanize(material.shaft)));
  if (material.shaft_material) {
    add("Shaft material", sentenceCase(humanize(material.shaft_material)));
  }
  add("Blade material", material.blade_material ?? undefined);
  const feather = material.feather_deg ?? [];
  if (feather.length > 0) add("Feather", `${feather.join(", ")}°`);
  add("Shaft diameter", material.shaft_diameter ?? undefined);
  if (material.weight_kg != null) {
    add("Weight", formatQuantity("light", material.weight_kg, units));
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

/** Source keys that are not a spec: links and photos. */
const NOT_A_SPEC = new Set(["product_url", "images", "availability"]);

/** True when a shown spec still rests on playak.com, a community site the
 * maker has not confirmed. Matches the host (playak.com and its subdomains),
 * never a look-alike such as notplayak.com or playak.com.example.org. */
export function hasCommunitySource(sources: unknown): boolean {
  if (!sources || typeof sources !== "object") return false;
  return Object.entries(sources).some(([field, url]) => {
    if (NOT_A_SPEC.has(field) || typeof url !== "string") return false;
    try {
      const { protocol, hostname } = new URL(url);
      if (protocol !== "http:" && protocol !== "https:") return false;
      const host = hostname.toLowerCase();
      return host === "playak.com" || host.endsWith(".playak.com");
    } catch {
      return false;
    }
  });
}
