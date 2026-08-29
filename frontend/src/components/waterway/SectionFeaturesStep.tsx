import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import { useMemo, useRef, useState } from "react";
import { PUT_IN_COLOR, TAKE_OUT_COLOR } from "@/components/map/LocationPin";
import NumberBadge from "@/components/NumberBadge";
import { RoundActionButton } from "@/components/PanelBottomBar";
import type { Feature } from "@/lib/api";
import { distanceAlongLineM } from "@/lib/geo";
import type { Coordinate } from "@/lib/riverSnap";
import FeatureRow from "./FeatureRow";
import type { GeometryPicking } from "./GeometryPicker";
import SuggestFeatureForm, {
  type SectionFeatureDraft,
} from "./SuggestFeatureForm";
import { computeExtent } from "./section-details/utils";

interface SectionFeaturesStepProps {
  /** The section line the features belong to. */
  finalCoords: Coordinate[] | null;
  /** Reference point for the gauge search. */
  nearPoint?: { lat: number; lon: number };
  draftFeatures: SectionFeatureDraft[];
  /** Map-ready pseudo features for the drafts, in the same order. */
  draftFeaturePseudos: Feature[];
  onAddDraft: (feature: SectionFeatureDraft) => void;
  onRemoveDraft: (index: number) => void;
  /** Map-driven geometry drawing state, owned by the wizard page. */
  geometry: GeometryPicking;
  defaultLangCode: string;
  /** Regions/country derived from OSM for the line, editable here. */
  regionCountry: {
    regions: string;
    country: string;
    loading: boolean;
    onChange: (patch: { regions?: string; country?: string }) => void;
  };
}

/** Features step of the suggest-section wizard: the section's fixed
 * endpoints, the drafted features so far, and the shared feature form in
 * draft mode - each added feature travels inside the section proposal. */
export default function SectionFeaturesStep({
  finalCoords,
  nearPoint,
  draftFeatures,
  draftFeaturePseudos,
  onAddDraft,
  onRemoveDraft,
  geometry,
  defaultLangCode,
  regionCountry,
}: SectionFeaturesStepProps) {
  const submitRef = useRef<(() => void) | null>(null);
  const [canAdd, setCanAdd] = useState(false);

  const totalM = useMemo(
    () =>
      finalCoords
        ? distanceAlongLineM(finalCoords[finalCoords.length - 1], finalCoords)
        : undefined,
    [finalCoords],
  );

  // Position of each draft along the section line, for the list rows
  const draftExtents = useMemo(
    () =>
      finalCoords
        ? draftFeaturePseudos.map((feature) =>
            computeExtent(feature, finalCoords),
          )
        : [],
    [draftFeaturePseudos, finalCoords],
  );

  return (
    <>
      {/* Region and country, derived from OSM for the picked line - shown
          here so they can be checked and adjusted before submitting */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <TextField
          label="Regions"
          value={regionCountry.regions}
          onChange={(e) => regionCountry.onChange({ regions: e.target.value })}
          helperText={
            regionCountry.loading
              ? "Looking up regions from OpenStreetMap…"
              : "From OpenStreetMap - comma-separated, most specific first"
          }
          fullWidth
          slotProps={{
            input: {
              endAdornment: regionCountry.loading ? (
                <CircularProgress size={16} />
              ) : undefined,
            },
          }}
        />
        <TextField
          label="Country"
          value={regionCountry.country}
          onChange={(e) => regionCountry.onChange({ country: e.target.value })}
          sx={{ maxWidth: 110 }}
        />
      </Box>

      {/* Fixed entries: the section's own endpoints (derived from the line,
          not submitted as separate features) */}
      {finalCoords &&
        (
          [
            { num: 1, label: "put in", color: PUT_IN_COLOR, km: 0 },
            {
              num: 2,
              label: "take out",
              color: TAKE_OUT_COLOR,
              km: totalM ?? 0,
            },
          ] as const
        ).map((endpoint) => (
          <Box key={endpoint.label} sx={{ opacity: 0.8 }}>
            <FeatureRow
              featureType={endpoint.label}
              locationType="Point"
              extent={{
                distM: endpoint.km,
                startM: endpoint.km,
                endM: endpoint.km,
                isZone: false,
              }}
              leading={
                <NumberBadge num={endpoint.num} color={endpoint.color} />
              }
              // Spacer where removable rows show the ✕
              trailing={<Box sx={{ width: 34, flexShrink: 0 }} />}
            />
          </Box>
        ))}

      {draftFeatures.map((feature, index) => (
        <FeatureRow
          key={`${feature.feature_type}-${index}`}
          featureType={feature.feature_type}
          name={feature.name}
          difficulty={feature.metadata.difficulty as string | undefined}
          gaugeName={feature.gauge_name}
          locationType={feature.location.type}
          extent={draftExtents[index]}
          totalM={totalM}
          onRemove={() => onRemoveDraft(index)}
        />
      ))}

      <SuggestFeatureForm
        sectionLine={
          finalCoords?.map(([lng, lat]) => ({ lng, lat })) ?? undefined
        }
        nearPoint={nearPoint}
        geometry={geometry}
        onDraft={onAddDraft}
        defaultLangCode={defaultLangCode}
        submitRef={submitRef}
        onCanSubmitChange={setCanAdd}
        headerAction={
          <RoundActionButton
            onClick={() => submitRef.current?.()}
            disabled={!canAdd}
            ariaLabel="Add feature"
          >
            <CheckIcon fontSize="small" />
          </RoundActionButton>
        }
      />
    </>
  );
}
