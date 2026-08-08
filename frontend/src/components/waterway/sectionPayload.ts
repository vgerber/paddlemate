import type { components } from "@/lib/api/schema";
import type { SectionNamingValue } from "./SectionNamingForm";
import type { SectionFeatureDraft } from "./SuggestFeatureForm";

type CreateSectionBody = components["schemas"]["CreateSectionBody"];

type FeatureBody = CreateSectionBody["features"][number];

/** Point on the map, as picked in the wizard. */
interface Point {
  lat: number;
  lon: number;
}

/** Maps the wizard's naming + line + feature drafts to the create-section
 * request body. The picked put-in and take-out become `put_in`/`take_out`
 * features (unless the user already drafted one), so a new section carries
 * its access points like imported sections do. Pure - testable without the
 * wizard. */
export function buildSectionPayload(
  naming: SectionNamingValue,
  coordinates: [number, number][],
  draftFeatures: SectionFeatureDraft[],
  putIn?: Point | null,
  takeOut?: Point | null,
): CreateSectionBody {
  const drafted = draftFeatures.map((feature) => ({
    feature_type: feature.feature_type,
    metadata: feature.metadata,
    // "Use full section line" features get the final line; everything
    // else keeps the geometry drawn on the map.
    location: feature.used_section_line
      ? { type: "LineString" as const, coordinates }
      : feature.location,
    name: feature.name,
    description: feature.description,
    lang_code: feature.lang_code,
    water_ranges: feature.water_ranges,
  }));

  // An access point at the picked location, skipped if the user already
  // drafted a feature of that type.
  const accessPoint = (
    type: "put_in" | "take_out",
    point: Point | null | undefined,
  ): FeatureBody[] =>
    point && !draftFeatures.some((f) => f.feature_type === type)
      ? [
          {
            feature_type: type,
            metadata: {},
            location: { type: "Point", coordinates: [point.lon, point.lat] },
            name: null,
            description: null,
            lang_code: naming.langCode,
            water_ranges: [],
          },
        ]
      : [];

  return {
    name: naming.name.trim(),
    region: naming.region.trim() || null,
    country: naming.country.trim() || null,
    description: naming.description.trim() || null,
    location: { type: "LineString", coordinates },
    // The primary entry is stored as a tagged localization too - the
    // plain columns are just the untagged fallback
    translations: [
      {
        lang_code: naming.langCode,
        name: naming.name.trim(),
        description: naming.description.trim() || null,
      },
      ...naming.translations
        .filter((t) => t.name.trim() || t.description.trim())
        .map((t) => ({
          lang_code: t.langCode,
          name: t.name.trim() || null,
          description: t.description.trim() || null,
        })),
    ],
    features: [
      ...accessPoint("put_in", putIn),
      ...accessPoint("take_out", takeOut),
      ...drafted,
    ],
  };
}
