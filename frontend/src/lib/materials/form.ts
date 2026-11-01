import {
  type Material,
  type MaterialAvailability,
  type MaterialBody,
  type MaterialCategory,
  type MaterialConstruction,
  type MaterialDiscipline,
  type PaddleShaft,
  type PaddleShaftMaterial,
} from "@/lib/api";
import {
  fromDisplay,
  parseInput,
  type Quantity,
  toInputText,
  type Units,
} from "@/lib/prefs/units";
import {
  MATERIAL_SPECS,
  PADDLE_SPECS,
  type PaddleKey,
  type SpecKey,
} from "./specs";

/** The entry form's fields. Every number is held as the text the reader
 * typed, so a half-typed "2." is not rounded away under the cursor; the
 * conversion to an entry happens once, on save. */
export type MaterialFormValues = {
  category: MaterialCategory;
  brand: string;
  model: string;
  variant: string;
  size: string;
  disciplines: MaterialDiscipline[];
  construction: MaterialConstruction | "";
  description: string;
  product_url: string;
  year_from: string;
  year_to: string;
  year_approximate: boolean;
  availability: MaterialAvailability;
  availability_source: string;
  /** A day, yyyy-mm-dd, as the date input holds it. */
  availability_checked: string;
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
    size: "",
    disciplines: [],
    construction: "",
    description: "",
    product_url: "",
    year_from: "",
    year_to: "",
    year_approximate: false,
    availability: "unknown",
    availability_source: "",
    availability_checked: "",
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
    size: material.size ?? "",
    disciplines: [...material.disciplines],
    construction: material.construction ?? "",
    description: material.description ?? "",
    product_url: material.product_url ?? "",
    year_from: numberText(material.year_from),
    year_to: numberText(material.year_to),
    year_approximate: material.year_approximate,
    availability: material.availability,
    availability_source: material.availability_source ?? "",
    availability_checked: material.availability_checked ?? "",
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
    size: optionalText(values.size),
    disciplines: values.disciplines,
    construction: values.construction || undefined,
    description: optionalText(values.description),
    product_url: optionalText(values.product_url),
    year_from: optionalNumber(values.year_from),
    year_to: optionalNumber(values.year_to),
    year_approximate: values.year_approximate,
    availability: values.availability,
    availability_source: optionalText(values.availability_source),
    availability_checked: optionalText(values.availability_checked),
    notes: optionalText(values.notes),
    colors: values.colors
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean),
    ...specs,
    ...paddle,
  };
}

/** Whether the form can be saved at all. Everything past brand, model and a group is
 * optional - a wiki entry with only a name is still worth having, and the
 * next reader can fill the rest in. */
export function canSaveMaterial(values: MaterialFormValues): boolean {
  return (
    values.brand.trim().length > 0 &&
    values.model.trim().length > 0 &&
    values.disciplines.length > 0
  );
}
