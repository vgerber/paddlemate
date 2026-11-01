import type { MaterialModel } from "@/lib/api";
import type { Units } from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";
import { rowAvailabilityLabel } from "./availability";
import { lengthsLabel, rangeLabel, sinceLabel } from "./facts";
import { CATEGORY_LABELS, disciplinesLabel } from "./specs";

/** Size tags shown on a card before the rest fold into "+n". */
export const MAX_SIZE_TAGS = 4;

/** One slot of the key-specs block. An empty `value` keeps the slot, so the
 * blocks of two cards line up. */
export interface CardSpec {
  label: string;
  value: string;
}

export interface ModelCardFacts {
  /** What the model is: kind, construction and run of years. */
  meta: string;
  /** The key specs in the category's fixed order, one slot each. */
  specs: CardSpec[];
  /** Size labels, folded after MAX_SIZE_TAGS. */
  sizes: string[];
  /** The tag for a model that is no longer made, if it is one. */
  discontinued?: string;
}

/** The specs a card of a category shows, in order: boats lead with length,
 * then volume and weight; a paddle has its length (sizes or range) and
 * weight. Values span the sizes of the model and use the reader's units. */
export function cardSpecs(model: MaterialModel, units: Units): CardSpec[] {
  const sizes = model.sizes;
  if (model.category === "paddle") {
    const lengths = sizes.flatMap((size) => size.lengths_cm ?? []);
    return [
      {
        label: "Length",
        value:
          lengths.length > 0
            ? lengthsLabel(lengths, units)
            : rangeLabel(
                "length",
                sizes.map((size) => size.length_cm),
                units,
              ),
      },
      {
        label: "Weight",
        value: rangeLabel(
          "light",
          sizes.map((size) => size.weight_kg),
          units,
        ),
      },
    ];
  }
  return [
    {
      label: "Length",
      value: rangeLabel(
        "length",
        sizes.map((size) => size.length_cm),
        units,
      ),
    },
    {
      label: "Volume",
      value: rangeLabel(
        "volume",
        sizes.map((size) => size.volume_l),
        units,
      ),
    },
    {
      label: "Weight",
      value: rangeLabel(
        "weight",
        sizes.map((size) => size.weight_kg),
        units,
      ),
    },
  ];
}

/** The size labels of a model as tags, the ones it states, with the overflow
 * folded into one "+n" tag. */
export function sizeTags(model: MaterialModel): string[] {
  const labels = model.sizes
    .map((size) => size.size)
    .filter((size): size is string => Boolean(size));
  if (labels.length <= MAX_SIZE_TAGS) return labels;
  return [
    ...labels.slice(0, MAX_SIZE_TAGS - 1),
    `+${labels.length - MAX_SIZE_TAGS + 1}`,
  ];
}

/** Everything a model card or phone row says besides the name, in the order
 * it is shown. `showCategory` adds the category in front of the meta line,
 * for a list that is not narrowed to one. */
export function modelCardFacts(
  model: MaterialModel,
  units: Units,
  showCategory: boolean,
): ModelCardFacts {
  const meta = [
    showCategory && CATEGORY_LABELS[model.category],
    disciplinesLabel(model.disciplines, model.category),
    model.construction && sentenceCase(humanize(model.construction)),
    sinceLabel(model),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    meta,
    specs: cardSpecs(model, units),
    sizes: sizeTags(model),
    discontinued: rowAvailabilityLabel(model),
  };
}

/** Model name below the brand: model and variant, "Scorch PRO". */
export function cardName(
  model: Pick<MaterialModel, "model" | "variant">,
): string {
  return [model.model, model.variant].filter(Boolean).join(" ");
}
