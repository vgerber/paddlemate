import type {
  Descent,
  SectionWaterSnapshot,
  SectionWithFeatures,
} from "@/lib/api";
import { localizedName } from "@/lib/localization";

/** One snapshot per gauge series - older descents stored one per feature
 * range, which would repeat the same reading. */
export function uniqueSnapshotsBySeries(
  snaps: SectionWaterSnapshot[],
): SectionWaterSnapshot[] {
  return snaps.filter(
    (s, i) => snaps.findIndex((x) => x.series_id === s.series_id) === i,
  );
}

/** Display-only SectionWithFeatures for map rendering when only id, name and
 * geometry are known (descent routes, wizard drafts). */
export function toPseudoSection(input: {
  id: number;
  name: string;
  location: SectionWithFeatures["location"];
}): SectionWithFeatures {
  return {
    id: input.id,
    name: input.name,
    waterway_id: 0,
    description: null,
    regions: [],
    location: input.location,
    features: [],
    names: [],
    descriptions: [],
    created_at: "",
    updated_at: "",
  } as SectionWithFeatures;
}

/** The river names of a log in section order, each once. */
export function descentRivers(descent: Pick<Descent, "sections">): string[] {
  const names = [...descent.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.waterway_name)
    .filter(Boolean) as string[];
  return [...new Set(names)];
}

/** What a log is called everywhere: its own name, else its rivers, else its
 * sections, else "Descent". */
export function descentTitle(
  descent: Pick<Descent, "name" | "sections">,
): string {
  const sections = [...descent.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.section_name)
    .filter(Boolean);
  return (
    descent.name ||
    descentRivers(descent).join(" / ") ||
    sections.join(", ") ||
    "Descent"
  );
}

/** How a log's audience reads, by visibility type. */
export const VISIBILITY_LABELS = {
  private: "Private",
  shared: "Shared",
  public: "Public",
} as const;

/** Name of the put-in or take-out feature a log starts or ends at: the first
 * such feature of the first picked section, the last of the last. Undefined
 * when the river has none, so the form falls back to coordinates. */
export function endpointName(
  picked: number[],
  sections: SectionWithFeatures[],
  end: "put_in" | "take_out",
): string | undefined {
  const id = end === "put_in" ? picked[0] : picked[picked.length - 1];
  const section = sections.find((s) => s.id === id);
  const feature = section?.features?.find((f) => f.feature_type === end);
  const first = feature?.names?.[0]?.name;
  return first ? localizedName(first, feature?.names) : undefined;
}
