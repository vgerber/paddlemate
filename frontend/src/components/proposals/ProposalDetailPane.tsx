import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import WaterwayMap from "@/components/map/Map";
import ProposalDiffTable from "@/components/proposals/ProposalDiffTable";
import FeatureRow from "@/components/waterway/FeatureRow";
import {
  computeExtent,
  toPseudoFeature,
} from "@/components/waterway/section-details/utils";
import type { Feature, FeatureType, Proposal } from "@/lib/api";
import { distanceAlongLineM, representativePoint } from "@/lib/geo";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { labelSx } from "@/lib/theme";

interface BundledFeatureData {
  feature_type: FeatureType;
  metadata?: Record<string, unknown> | null;
  location: Feature["location"];
  name?: string | null;
  description?: string | null;
  lang_code?: string | null;
  water_ranges?: Array<{ series_id: number }> | null;
}

interface TranslationData {
  lang_code: string;
  name?: string | null;
  description?: string | null;
}

const paneLabelSx = { ...labelSx, color: "text.disabled" } as const;

/** Read-only full view of a proposal - the wizard's review layout without
 * the editing: map, naming, translations and feature rows with positions. */
export default function ProposalDetailPane({
  proposal,
}: {
  proposal: Proposal;
}) {
  const data = (proposal.proposed_data ?? {}) as Record<string, unknown>;

  const location = data.location as Feature["location"] | undefined;
  const sectionLine =
    location?.type === "LineString"
      ? (location.coordinates as [number, number][])
      : undefined;

  // Bundled section features, or the proposal's own feature geometry
  const bundled = Array.isArray(data.features)
    ? (data.features as BundledFeatureData[])
    : [];
  const ownFeature =
    proposal.entity_type === "feature" && location && data.feature_type
      ? [
          {
            feature_type: data.feature_type as FeatureType,
            metadata: data.metadata as Record<string, unknown> | null,
            location,
            name: data.name as string | null,
            description: data.description as string | null,
            lang_code: data.lang_code as string | null,
            water_ranges: (data.water_ranges ??
              null) as BundledFeatureData["water_ranges"],
          },
        ]
      : [];
  const featureData = [...bundled, ...ownFeature];
  const pseudoFeatures = featureData.map(toPseudoFeature);

  const translations = Array.isArray(data.translations)
    ? (data.translations as TranslationData[])
    : [];

  const totalM = sectionLine
    ? distanceAlongLineM(sectionLine[sectionLine.length - 1], sectionLine)
    : undefined;

  const detailRows: Array<[string, string]> = [];
  if (typeof data.description === "string" && data.description) {
    detailRows.push(["Description", data.description]);
  }
  // `regions` array on current proposals; single `region` on ones stored
  // before the regions migration.
  const regionNames = Array.isArray(data.regions)
    ? data.regions.filter((v): v is string => typeof v === "string")
    : [data.region];
  const regionCountry = [...regionNames, data.country]
    .filter((v) => typeof v === "string" && v)
    .join(", ");
  if (regionCountry) detailRows.push(["Region", regionCountry]);

  const focus = location ? representativePoint(location) : null;

  // What already exists around the change, so a reviewer can see whether it
  // fits and is not a duplicate: a feature is shown on its section next to
  // that section's other features, a section among the river's others.
  const contextWaterwayId =
    typeof data.waterway_id === "number" ? data.waterway_id : null;
  const contextSectionId =
    typeof data.section_id === "number" ? data.section_id : undefined;
  const { data: waterway } = useWaterway(contextWaterwayId);

  const isFeatureProposal = proposal.entity_type === "feature";
  const parentSection = waterway?.sections?.find(
    (section) => section.id === contextSectionId,
  );

  // The section being changed is drawn from the proposal itself, so leave
  // its stored version out to avoid two lines on top of each other.
  const contextSections = isFeatureProposal
    ? parentSection
      ? [parentSection]
      : []
    : (waterway?.sections ?? []).filter(
        (section) => section.id !== proposal.entity_id,
      );

  // Likewise for the feature under review: its current version would sit
  // under the proposed one.
  const existingFeatures = isFeatureProposal
    ? (parentSection?.features ?? []).filter(
        (feature) => feature.id !== proposal.entity_id,
      )
    : [];

  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* What an update changes, before the full proposed state below */}
      {original && proposal.operation === "update" && (
        <ProposalDiffTable original={original} proposed={data} />
      )}

      {/* Map */}
      {(sectionLine ||
        pseudoFeatures.length > 0 ||
        contextSections.length > 0) && (
        <Box
          sx={{
            // Grows with the desktop pane instead of staying phone-sized.
            height: { xs: 380, md: "clamp(380px, 45vh, 560px)" },
            border: "1px solid",
            borderColor: "divider",
            position: "relative",
          }}
        >
          <WaterwayMap
            chrome={{ cooperativeGestures: true }}
            sections={contextSections.length > 0 ? contextSections : undefined}
            features={
              existingFeatures.length > 0 ? existingFeatures : undefined
            }
            drawing={{ sectionPreviewCoords: sectionLine }}
            proposedFeatures={
              pseudoFeatures.length > 0 ? pseudoFeatures : undefined
            }
            camera={{ focusedPoint: focus }}
          />
        </Box>
      )}

      {/* Details */}
      {detailRows.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "4px 16px",
          }}
        >
          {detailRows.map(([key, value]) => (
            <Box key={key} sx={{ display: "contents" }}>
              <Typography sx={{ ...paneLabelSx, lineHeight: 1.8 }}>
                {key}
              </Typography>
              <Typography variant="body2" sx={{ lineHeight: 1.8 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Translations */}
      {translations.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="overline" sx={{ lineHeight: 1 }}>
            Translations
          </Typography>
          {translations.map((translation) => (
            <Box
              key={translation.lang_code}
              sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}
            >
              <Typography
                sx={{ ...paneLabelSx, minWidth: 24, color: "text.secondary" }}
              >
                {translation.lang_code.toUpperCase()}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                {translation.name && (
                  <Typography variant="body2">{translation.name}</Typography>
                )}
                {translation.description && (
                  <Typography variant="caption" color="text.secondary">
                    {translation.description}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Features */}
      {featureData.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="overline" sx={{ lineHeight: 1 }}>
            Features
          </Typography>
          {featureData.map((feature, index) => (
            <FeatureRow
              key={`${feature.feature_type}-${index}`}
              featureType={feature.feature_type}
              name={feature.name}
              difficulty={
                (feature.metadata as Record<string, unknown> | null)
                  ?.difficulty as string | undefined
              }
              description={feature.description}
              gaugeName={
                (feature.water_ranges?.length ?? 0) > 0
                  ? "thresholds set"
                  : undefined
              }
              locationType={
                feature.location.type as "Point" | "LineString" | "Polygon"
              }
              extent={
                sectionLine
                  ? computeExtent(pseudoFeatures[index], sectionLine)
                  : null
              }
              totalM={totalM}
            />
          ))}
        </Box>
      )}

      {/* Footer */}
      <Typography variant="caption" color="text.secondary">
        Submitted by {proposal.submitted_by} ·{" "}
        {new Date(proposal.created_at).toLocaleDateString()}
      </Typography>
    </Box>
  );
}
