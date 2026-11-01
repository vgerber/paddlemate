import type { Material } from "@/lib/api";

const BOAT_FIELDS: [keyof Material, string][] = [
  ["length_cm", "length"],
  ["width_cm", "width"],
  ["volume_l", "volume"],
  ["weight_kg", "weight"],
  ["cockpit_length_cm", "cockpit"],
  ["paddler_weight_min_kg", "paddler weight"],
  ["year_from", "release year"],
  ["construction", "construction"],
];

const PADDLE_FIELDS: [keyof Material, string][] = [
  ["blade_area_cm2", "blade area"],
  ["length_min_cm", "length"],
  ["weight_kg", "weight"],
  ["shaft", "shaft"],
  ["pieces", "pieces"],
  ["year_from", "release year"],
];

/** What an entry does not state yet, as short lowercase names in a fixed
 * order, "photo" last. Only the fields that matter for its category. */
export function missingFields(material: Material): string[] {
  const fields = material.category === "paddle" ? PADDLE_FIELDS : BOAT_FIELDS;
  const missing = fields
    .filter(([key]) => material[key] == null)
    .map(([, label]) => label);
  if (material.category !== "paddle" && material.disciplines.length === 0) {
    missing.push("groups");
  }
  if (material.availability === "unknown") missing.push("availability");
  if (material.images.length === 0) missing.push("photo");
  return missing;
}

/** "No photo, volume or release year yet" - the photo first as the most
 * visible gap, then the rest in field order. Empty when nothing is missing. */
export function missingSentence(missing: string[]): string {
  if (missing.length === 0) return "";
  const ordered = [
    ...missing.filter((name) => name === "photo"),
    ...missing.filter((name) => name !== "photo"),
  ];
  const head = ordered.slice(0, -1);
  const last = ordered[ordered.length - 1];
  return `No ${head.length > 0 ? `${head.join(", ")} or ${last}` : last} yet`;
}
