import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import WaterwayMap from "@/components/map/Map";
import ProposalDiffTable from "@/components/proposals/ProposalDiffTable";
import FeatureRow from "@/components/waterway/FeatureRow";
import {
  computeExtent,
  featureDifficulty,
  toPseudoFeature,
} from "@/components/waterway/section-details/utils";
import type { Proposal } from "@/lib/api";
import { distanceAlongLineM, lineCoords, representativePoint } from "@/lib/geo";
import { useWaterway } from "@/lib/hooks/useWaterways";
import {
  proposalRecord,
  proposedFeatures,
  proposedLocation,
  proposedTranslations,
} from "@/lib/proposals";
import { alphas, labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

const paneLabelSx = { ...labelSx, color: "text.disabled" } as const;

/** Read-only full view of a proposal - the wizard's review layout without
 * the editing: map, naming, translations and feature rows with positions. */
export default function ProposalDetailPane({
  proposal,
  showMap = true,
}: {
  proposal: Proposal;
  /** False on the canvas, where the screen's own map draws the change. */
  showMap?: boolean;
}) {
  const data = proposalRecord(proposal.proposed_data);

  const location = proposedLocation(data);
  const sectionLine = lineCoords(location) ?? undefined;
  const featureData = proposedFeatures(proposal);
  const pseudoFeatures = featureData.map(toPseudoFeature);
  const translations = proposedTranslations(data);

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

  // Feature positions are measured along the section they belong to; a
  // section proposal measures its bundled features along its own line.
  const measureLine = isFeatureProposal
    ? lineCoords(parentSection?.location)
    : sectionLine;
  const totalM = measureLine
    ? distanceAlongLineM(measureLine[measureLine.length - 1], measureLine)
    : undefined;

  const original = proposal.original_data
    ? proposalRecord(proposal.original_data)
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* What an update changes, before the full proposed state below */}
      {original && proposal.operation === "update" && (
        <ProposalDiffTable original={original} proposed={data} />
      )}

      {/* Map */}
      {showMap &&
        (sectionLine ||
          pseudoFeatures.length > 0 ||
          contextSections.length > 0) && (
          <Box
            sx={{
              // Grows with the desktop pane instead of staying phone-sized.
              height: { xs: 380, md: "clamp(380px, 45vh, 560px)" },
              border: "1px solid",
              borderColor: "divider",
              position: "relative",
              // Keeps the map's own controls beneath the sticky review bar.
              isolation: "isolate",
            }}
          >
            <WaterwayMap
              chrome={{ cooperativeGestures: true }}
              sections={
                contextSections.length > 0 ? contextSections : undefined
              }
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
                  <Typography variant="caption" color="textSecondary">
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
          <Box
            sx={{
              bgcolor: tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e1,
              overflow: "hidden",
              // The card draws the edge; rows only keep a rule between them.
              "& > *": { border: "none" },
              "& > * + *": {
                borderTop: `1px solid ${tokens.outlineVariant}${alphas.hairline}`,
              },
            }}
          >
            {featureData.map((feature, index) => (
              <FeatureRow
                key={`${feature.feature_type}-${index}`}
                featureType={feature.feature_type}
                name={feature.name}
                difficulty={featureDifficulty(feature) ?? undefined}
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
                  measureLine
                    ? computeExtent(pseudoFeatures[index], measureLine)
                    : null
                }
                totalM={totalM}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
