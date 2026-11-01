import type { Material, MaterialAvailability, MaterialModel } from "@/lib/api";
import { formatDate } from "@/lib/text/format";

export const AVAILABILITIES: MaterialAvailability[] = [
  "current",
  "discontinued",
  "unknown",
];

/** The choice in the entry form. */
export const AVAILABILITY_LABELS: Record<MaterialAvailability, string> = {
  current: "Still made",
  discontinued: "Discontinued",
  unknown: "Availability unknown",
};

type Stated = Pick<
  Material | MaterialModel,
  "availability" | "availability_checked" | "availability_source"
> & { year_to?: number | null };

/** The model page's fact: "Still made", "Discontinued (last model year
 * 2008)" or "Availability unknown". */
export function availabilityValue(entry: Stated): string {
  if (entry.availability === "discontinued" && entry.year_to) {
    return `Discontinued (last model year ${entry.year_to})`;
  }
  return AVAILABILITY_LABELS[entry.availability];
}

/** The date the flag was read, as the fact's caption; empty when the entry
 * states none. */
export function availabilityChecked(entry: Stated): string | undefined {
  return entry.availability_checked
    ? `Checked ${formatDate(entry.availability_checked)}`
    : undefined;
}

/** The host of the page the flag came from, for its link text. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The label a list row carries: only a discontinued model says anything. */
export function rowAvailabilityLabel(
  entry: Pick<MaterialModel, "availability">,
): string | undefined {
  return entry.availability === "discontinued" ? "Discontinued" : undefined;
}
