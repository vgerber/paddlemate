import type { Material } from "@/lib/api";
import type { Units } from "@/lib/prefs/units";
import { paddleFacts, paddlerRangeLabel } from "./facts";
import {
  formatSpec,
  MATERIAL_SPECS,
  SPEC_GROUP_LABELS,
  specValue,
} from "./specs";

/** One stated measurement of an entry, filed under the block it reads in. */
export interface SpecRow {
  group: string;
  label: string;
  value: string;
}

/** What an entry states, in reading order: a boat's hull, cockpit and the
 * paddler window, or a paddle's specs. The one list both the single-size
 * spec cards and the all-sizes table are built from. */
export function specRows(material: Material, units: Units): SpecRow[] {
  if (material.category === "paddle") {
    return paddleFacts(material, units).map((fact) => ({
      group: "Paddle",
      ...fact,
    }));
  }
  const rows: SpecRow[] = MATERIAL_SPECS.filter(
    (spec) => spec.group !== "paddler" && specValue(material, spec.key) != null,
  ).map((spec) => ({
    group: SPEC_GROUP_LABELS[spec.group],
    label: spec.label,
    value: formatSpec(specValue(material, spec.key), spec, units),
  }));
  const paddler = paddlerRangeLabel(material, units);
  if (paddler) {
    rows.push({
      group: SPEC_GROUP_LABELS.paddler,
      label: "Body weight",
      value: paddler,
    });
  }
  return rows;
}

/** One line of the all-sizes table: a measurement and each size's value
 * (empty where that size states none). */
export interface SizeTableRow {
  group: string;
  label: string;
  values: string[];
}

/** The union of what the sizes state, one row per measurement, in the order
 * the first size that states it reads. */
export function sizeTableRows(
  materials: Material[],
  units: Units,
): SizeTableRow[] {
  const rows = new Map<string, SizeTableRow>();
  materials.forEach((material, column) => {
    for (const row of specRows(material, units)) {
      const key = `${row.group}|${row.label}`;
      const line = rows.get(key) ?? {
        group: row.group,
        label: row.label,
        values: materials.map(() => ""),
      };
      line.values[column] = row.value;
      rows.set(key, line);
    }
  });
  // Rows of one block stay together even when a later size adds to it.
  const order = [...new Set([...rows.values()].map((row) => row.group))];
  return [...rows.values()].sort(
    (a, b) => order.indexOf(a.group) - order.indexOf(b.group),
  );
}
