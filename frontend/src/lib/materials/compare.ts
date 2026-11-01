import type { Material, MaterialModel } from "@/lib/api";
import { paddleLengthLabel, sinceLabel } from "@/lib/materials/facts";
import { CATEGORY_LABELS, disciplinesLabel } from "@/lib/materials/specs";
import {
  bareQuantity,
  type Quantity,
  type Units,
  unitLabel,
} from "@/lib/prefs/units";
import { humanize, plural, sentenceCase } from "@/lib/text/format";

export type CompareGroup =
  | "kind"
  | "hull"
  | "cockpit"
  | "paddler"
  | "blade"
  | "shaft";

export const COMPARE_GROUP_LABELS: Record<CompareGroup, string> = {
  kind: "Kind",
  hull: "Hull",
  cockpit: "Cockpit",
  paddler: "Paddler",
  blade: "Blade",
  shaft: "Shaft",
};

/** Numbers closer than this share of the larger one read as equal, so no bar
 * is drawn for a row the entries barely differ in. */
export const BAR_THRESHOLD = 0.05;

/** What one entry says in one row: `id` decides whether two entries agree,
 * `text` is what the cell shows, `num` (metric) is what a bar measures. */
interface Reading {
  id: string;
  text: string;
  num?: number;
}

interface Field {
  key: string;
  group: CompareGroup;
  label: string;
  /** Unit of the row, shown in the label and the alike chip. */
  quantity?: (materials: Material[]) => Quantity;
  /** Draw bars under the numbers when they differ enough. */
  bar?: boolean;
  read: (
    material: Material,
    units: Units,
    quantity: Quantity | undefined,
  ) => Reading | undefined;
  /** The chip a row all entries agree on becomes; defaults to the text. */
  chip?: (text: string, unit: string) => string;
}

function text(value: string | null | undefined): Reading | undefined {
  return value ? { id: value, text: value } : undefined;
}

function measure(
  material: Material,
  key: keyof Material,
  units: Units,
  quantity: Quantity | undefined,
): Reading | undefined {
  const value = material[key];
  if (typeof value !== "number" || !quantity) return undefined;
  return {
    id: String(value),
    text: bareQuantity(quantity, value, units),
    num: value,
  };
}

function measured(
  key: keyof Material,
  quantity: Quantity,
): Pick<Field, "quantity" | "read"> {
  return {
    quantity: () => quantity,
    read: (m, units, q) => measure(m, key, units, q),
  };
}

function bareRange(
  min: number | null | undefined,
  max: number | null | undefined,
  quantity: Quantity,
  units: Units,
): string {
  const num = (value: number) => bareQuantity(quantity, value, units);
  if (min == null && max == null) return "";
  if (min == null) return `up to ${num(max as number)}`;
  if (max == null) return `from ${num(min)}`;
  const [a, b] = [num(min), num(max)];
  return a === b ? a : `${a}-${b}`;
}

/** A weight reads in grams when every entry that states one is a paddle. */
function weightQuantity(materials: Material[]): Quantity {
  const stating = materials.filter((m) => m.weight_kg != null);
  return stating.length > 0 && stating.every((m) => m.category === "paddle")
    ? "light"
    : "weight";
}

const withUnit = (label: string) => (value: string, unit: string) =>
  `${label} ${value} ${unit}`;

/** Every comparable row, in the order the table shows them. A row appears
 * when at least two entries state it, so a pick of kayaks and paddles shows
 * the rows they share and the ones each kind states for itself. */
const FIELDS: Field[] = [
  {
    key: "category",
    group: "kind",
    label: "Category",
    read: (m) => text(CATEGORY_LABELS[m.category]),
  },
  {
    key: "disciplines",
    group: "kind",
    label: "Groups",
    read: (m) => text(disciplinesLabel(m.disciplines, m.category)),
  },
  {
    key: "construction",
    group: "kind",
    label: "Construction",
    read: (m) => text(m.construction && sentenceCase(humanize(m.construction))),
  },
  {
    key: "built",
    group: "kind",
    label: "Built",
    read: (m) => text(sinceLabel(m)),
  },
  {
    key: "length",
    group: "hull",
    label: "Length",
    bar: true,
    ...measured("length_cm", "length"),
    chip: withUnit("Length"),
  },
  {
    key: "width",
    group: "hull",
    label: "Width",
    bar: true,
    ...measured("width_cm", "length"),
    chip: withUnit("Width"),
  },
  {
    key: "height",
    group: "hull",
    label: "Height",
    bar: true,
    ...measured("height_cm", "length"),
    chip: withUnit("Height"),
  },
  {
    key: "volume",
    group: "hull",
    label: "Volume",
    bar: true,
    ...measured("volume_l", "volume"),
    chip: withUnit("Volume"),
  },
  {
    key: "weight",
    group: "hull",
    label: "Weight",
    bar: true,
    quantity: weightQuantity,
    read: (m, units, q) => measure(m, "weight_kg", units, q),
    chip: withUnit("Weight"),
  },
  {
    key: "cockpit",
    group: "cockpit",
    label: "Cockpit",
    quantity: () => "length",
    read: (m, units) => {
      const [a, b] = [m.cockpit_length_cm, m.cockpit_width_cm];
      if (a == null && b == null) return undefined;
      const num = (v: number | null | undefined) =>
        v == null ? "-" : bareQuantity("length", v, units);
      const label = `${num(a)} x ${num(b)}`;
      return { id: label, text: label };
    },
    chip: withUnit("Cockpit"),
  },
  {
    key: "paddler",
    group: "paddler",
    label: "Paddler weight",
    quantity: () => "weight",
    read: (m, units) => {
      const label = bareRange(
        m.paddler_weight_min_kg,
        m.paddler_weight_max_kg,
        "weight",
        units,
      );
      return label ? { id: label, text: label } : undefined;
    },
    chip: withUnit("Paddler"),
  },
  {
    key: "blade_area",
    group: "blade",
    label: "Blade area",
    bar: true,
    ...measured("blade_area_cm2", "area"),
    chip: withUnit("Blade area"),
  },
  {
    key: "blade_length",
    group: "blade",
    label: "Blade length",
    bar: true,
    ...measured("blade_length_cm", "length"),
    chip: withUnit("Blade length"),
  },
  {
    key: "blade_width",
    group: "blade",
    label: "Blade width",
    bar: true,
    ...measured("blade_width_cm", "length"),
    chip: withUnit("Blade width"),
  },
  {
    key: "blade_material",
    group: "blade",
    label: "Blade material",
    read: (m) => text(m.blade_material),
    chip: (value) => `${value} blade`,
  },
  {
    key: "shaft",
    group: "shaft",
    label: "Shaft",
    read: (m) => text(m.shaft && sentenceCase(humanize(m.shaft))),
    chip: (value) => `${value} shaft`,
  },
  {
    key: "shaft_material",
    group: "shaft",
    label: "Shaft material",
    read: (m) =>
      text(m.shaft_material && sentenceCase(humanize(m.shaft_material))),
    chip: (value) => `${value} shaft`,
  },
  {
    key: "shaft_diameter",
    group: "shaft",
    label: "Shaft diameter",
    read: (m) => text(m.shaft_diameter),
    chip: (value) => `Shaft ${value}`,
  },
  {
    key: "lengths",
    group: "shaft",
    label: "Lengths",
    quantity: () => "length",
    read: (m, units) => text(paddleLengthLabel(m, units, false)),
    chip: withUnit("Lengths"),
  },
  {
    key: "pieces",
    group: "shaft",
    label: "Pieces",
    read: (m) => (m.pieces != null ? text(String(m.pieces)) : undefined),
    chip: (value) => plural(Number(value), "piece", "pieces"),
  },
  {
    key: "feather",
    group: "shaft",
    label: "Feather",
    read: (m) => {
      const angles = m.feather_deg ?? [];
      return angles.length > 0 ? text(`${angles.join(", ")}°`) : undefined;
    },
    chip: (value) => `Feather ${value}`,
  },
];

export interface CompareRow {
  key: string;
  group: CompareGroup;
  /** With its unit: "Length (cm)". */
  label: string;
  /** One text per entry, undefined where the entry states nothing. */
  cells: (string | undefined)[];
  /** Per entry, how long its bar runs (0-1, zero based); absent when the
   * entries do not differ enough for bars. */
  bars?: (number | undefined)[];
}

export interface Comparison {
  /** What every entry states the same, as chips. */
  alike: string[];
  rows: CompareRow[];
  /** More than one category is compared. */
  mixed: boolean;
}

/** The zero-based bar lengths of a row's numbers, or none when the largest
 * and smallest differ by less than `BAR_THRESHOLD` of the largest. */
export function barRatios(
  values: (number | undefined)[],
): (number | undefined)[] | undefined {
  const stated = values.filter((v): v is number => v != null);
  if (stated.length < 2) return undefined;
  const max = Math.max(...stated);
  const min = Math.min(...stated);
  if (max <= 0 || (max - min) / max < BAR_THRESHOLD) return undefined;
  return values.map((v) => (v == null ? undefined : Math.max(v, 0) / max));
}

/** The rows two or more entries state and the strip of values they all share.
 * Rows where every entry agrees move to `alike`; the table keeps only what
 * tells the entries apart. */
export function buildComparison(
  materials: Material[],
  units: Units,
): Comparison {
  const need = Math.min(2, materials.length);
  const alike: string[] = [];
  const rows: CompareRow[] = [];
  for (const field of FIELDS) {
    const quantity = field.quantity?.(materials);
    const readings = materials.map((m) => field.read(m, units, quantity));
    const stated = readings.filter((r) => r != null);
    if (stated.length < need) continue;
    const unit = quantity ? unitLabel(quantity, units) : "";
    const first = stated[0];
    if (
      materials.length > 1 &&
      stated.length === materials.length &&
      stated.every((r) => r.id === first.id)
    ) {
      alike.push(field.chip ? field.chip(first.text, unit) : first.text);
      continue;
    }
    const nums = readings.map((r) => r?.num);
    rows.push({
      key: field.key,
      group: field.group,
      label: unit ? `${field.label} (${unit})` : field.label,
      cells: readings.map((r) => r?.text),
      bars: field.bar ? barRatios(nums) : undefined,
    });
  }
  const categories = new Set(materials.map((m) => m.category));
  return { alike, rows, mixed: categories.size > 1 };
}

/** How many entries the comparison holds - matches MAX_COMPARE_IDS on the
 * server, which is what an `ids` request returns at most. */
export const MAX_COMPARE = 8;

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

/** Whether any size of a model is held in the comparison. */
export function modelPicked(
  ids: number[],
  model: Pick<MaterialModel, "sizes">,
): boolean {
  return model.sizes.some((size) => ids.includes(size.id));
}

/** Tick a model in the list. A model of one size picks that size; a model of
 * several never picks one on its own (the row asks which), so the tick of a
 * model not held changes nothing here. Ticking a model held removes every
 * size of it. */
export function toggleModelCompare(
  ids: number[],
  model: Pick<MaterialModel, "sizes">,
): number[] {
  if (modelPicked(ids, model)) {
    const own = model.sizes.map((size) => size.id);
    return ids.filter((id) => !own.includes(id));
  }
  return model.sizes.length === 1
    ? toggleCompareId(ids, model.sizes[0].id)
    : ids;
}
