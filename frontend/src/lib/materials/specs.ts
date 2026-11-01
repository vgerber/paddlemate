import {
  type Material,
  type MaterialCategory,
  type MaterialConstruction,
  type MaterialDiscipline,
  type PaddleShaft,
  type PaddleShaftMaterial,
} from "@/lib/api";
import { formatQuantity, type Quantity, type Units } from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";

/** Input bounds the server enforces too; the form stops typing at them. */
/** Most groups one entry can be filed under (the API refuses more). */
export const MAX_DISCIPLINES = 3;

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

/** Every class a boat can have. Paddles use PADDLE_DISCIPLINES instead. */
export const BOAT_DISCIPLINES: MaterialDiscipline[] = [
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

/** Paddles are grouped by use, not by the boat they go with. Mirrors
 * chk_materials_discipline. */
export const PADDLE_DISCIPLINES: MaterialDiscipline[] = [
  "whitewater",
  "freestyle",
  "slalom",
  "wildwater",
  "touring",
  "canoe",
  "polo",
  "other",
];

/** Every class any entry can have, for reading a filter from the address. */
export const DISCIPLINES: MaterialDiscipline[] = [
  ...new Set([...BOAT_DISCIPLINES, ...PADDLE_DISCIPLINES]),
];

/** The classes to offer for a category: a paddle has its own, a kayak is
 * not freestyle. With no category, all of them. */
export function disciplinesFor(
  category: MaterialCategory | undefined,
): MaterialDiscipline[] {
  if (category === "paddle") return PADDLE_DISCIPLINES;
  if (category === "kayak")
    return BOAT_DISCIPLINES.filter((d) => d !== "freestyle");
  if (category) return BOAT_DISCIPLINES;
  return DISCIPLINES;
}

const PADDLE_CLASS_LABELS: Partial<Record<MaterialDiscipline, string>> = {
  touring: "Touring and sea",
};

/** The class as people read it; a paddle's touring class covers sea too. */
export function disciplineLabel(
  discipline: MaterialDiscipline,
  category: MaterialCategory | undefined,
): string {
  const label =
    category === "paddle" ? PADDLE_CLASS_LABELS[discipline] : undefined;
  return label ?? sentenceCase(humanize(discipline));
}

/** The groups of an entry in one line, primary first: "Creek · River runner". */
export function disciplinesLabel(
  disciplines: readonly MaterialDiscipline[],
  category: MaterialCategory | undefined,
): string {
  return disciplines.map((d) => disciplineLabel(d, category)).join(" · ");
}

export const CONSTRUCTIONS: MaterialConstruction[] = [
  "plastic",
  "composite",
  "inflatable",
  "folding",
  "wood",
];

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
