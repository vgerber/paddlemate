import type { components } from "@/lib/api/schema";
import type { SectionNamingValue } from "./SectionNamingForm";
import type { SectionFeatureDraft } from "./SuggestFeatureForm";

type CreateSectionBody = components["schemas"]["CreateSectionBody"];

/** Maps the wizard's naming + line + feature drafts to the create-section
 * request body. Pure - testable without the wizard. */
export function buildSectionPayload(
  naming: SectionNamingValue,
  coordinates: [number, number][],
  draftFeatures: SectionFeatureDraft[],
): CreateSectionBody {
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
    // "Use full section line" features get the final line; everything
    // else keeps the geometry drawn on the map
    features: draftFeatures.map((feature) => ({
      feature_type: feature.feature_type,
      metadata: feature.metadata,
      location: feature.used_section_line
        ? { type: "LineString", coordinates }
        : feature.location,
      name: feature.name,
      description: feature.description,
      lang_code: feature.lang_code,
      water_ranges: feature.water_ranges,
    })),
  };
}
