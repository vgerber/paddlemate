import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import WaterwayMap from "@/components/map/Map";
import {
  computeExtent,
  fmtKm,
} from "@/components/waterway/section-details/utils";
import type { Feature, FeatureType, Proposal } from "@/lib/api";
import { distanceAlongLineM, representativePoint } from "@/lib/geo";
import { fonts } from "@/lib/theme";

interface BundledFeatureData {
  feature_type: FeatureType;
  metadata?: Record<string, unknown> | null;
  location: Feature["location"];
  name?: string | null;
  description?: string | null;
  lang_code?: string | null;
}

interface TranslationData {
  lang_code: string;
  name?: string | null;
  description?: string | null;
}

const labelSx = {
  color: "text.disabled",
  fontFamily: fonts.label,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.62rem",
} as const;

function toPseudoFeature(data: BundledFeatureData, index: number): Feature {
  return {
    id: -(index + 1),
    section_id: 0,
    feature_type: data.feature_type,
    metadata: (data.metadata ?? {}) as Feature["metadata"],
    location: data.location,
    names: data.name
      ? [
          {
            id: 0,
            feature_id: -(index + 1),
            lang_code: data.lang_code ?? "en",
            name: data.name,
          },
        ]
      : [],
    descriptions: [],
    created_by: "",
    created_at: "",
    updated_at: "",
  } as Feature;
}

/** Read-only full view of a proposal — the wizard's review layout without
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
    : 0;

  const detailRows: Array<[string, string]> = [];
  if (typeof data.description === "string" && data.description) {
    detailRows.push(["Description", data.description]);
  }
  const regionCountry = [data.region, data.country]
    .filter((v) => typeof v === "string" && v)
    .join(", ");
  if (regionCountry) detailRows.push(["Region", regionCountry]);

  const focus = location ? representativePoint(location) : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Map */}
      {(sectionLine || pseudoFeatures.length > 0) && (
        <Box
          sx={{
            height: 380,
            border: "1px solid",
            borderColor: "divider",
            position: "relative",
          }}
        >
          <WaterwayMap
            cooperativeGestures
            sectionPreviewCoords={sectionLine}
            proposedFeatures={
              pseudoFeatures.length > 0 ? pseudoFeatures : undefined
            }
            focusedPoint={focus}
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
              <Typography sx={{ ...labelSx, lineHeight: 1.8 }}>
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
                sx={{ ...labelSx, minWidth: 24, color: "text.secondary" }}
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
          {featureData.map((feature, index) => {
            const difficulty = (
              feature.metadata as Record<string, unknown> | null
            )?.difficulty as string | undefined;
            const detail = feature.name
              ? difficulty
                ? `${feature.name} (${difficulty})`
                : feature.name
              : (difficulty ?? "");
            const extent = sectionLine
              ? computeExtent(pseudoFeatures[index], sectionLine)
              : null;
            const isFullSection =
              extent != null &&
              extent.isZone &&
              extent.startM < 50 &&
              totalM - extent.endM < 50;
            return (
              <Box
                key={`${feature.feature_type}-${index}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {detail && (
                    <Typography variant="body2" noWrap>
                      {detail}
                    </Typography>
                  )}
                  <Typography sx={{ ...labelSx, color: "text.secondary" }}>
                    {feature.feature_type.replace(/_/g, " ")}
                  </Typography>
                  {feature.description && (
                    <Typography variant="caption" color="text.secondary">
                      {feature.description}
                    </Typography>
                  )}
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {isFullSection
                      ? "Full section"
                      : feature.location.type === "LineString"
                        ? "Line"
                        : feature.location.type === "Polygon"
                          ? "Area"
                          : "Point"}
                  </Typography>
                  {extent && (
                    <Typography
                      sx={{
                        fontFamily: fonts.mono,
                        fontSize: "0.65rem",
                        color: "text.disabled",
                      }}
                    >
                      {extent.isZone
                        ? `${fmtKm(extent.startM)} – ${fmtKm(extent.endM)}`
                        : fmtKm(extent.distM)}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
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
