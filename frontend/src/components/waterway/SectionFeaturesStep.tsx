import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useMemo, useRef, useState } from "react";
import { PUT_IN_COLOR, TAKE_OUT_COLOR } from "@/components/map/LocationPin";
import DelayedSpinner from "@/components/states/DelayedSpinner";
import { featureDifficulty } from "@/components/waterway/section-details/utils";
import type { Feature } from "@/lib/api";
import { plural } from "@/lib/format";
import { distanceAlongLineM, type LngLat } from "@/lib/geo";
import { AddIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import FeatureRow from "./FeatureRow";
import FormSection from "./FormSection";
import type { GeometryPicking } from "./geometryPicking";
import SectionPointCard from "./SectionPointCard";
import SuggestFeatureForm, {
  type SectionFeatureDraft,
} from "./SuggestFeatureForm";
import { computeExtent, fmtKm } from "./section-details/utils";

const { tokens } = theme;

interface SectionFeaturesStepProps {
  /** The section line the features belong to. */
  finalCoords: LngLat[] | null;
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
  const [adding, setAdding] = useState(false);

  function closeForm() {
    geometry.onStopPick();
    geometry.onClearVertices();
    setCanAdd(false);
    setAdding(false);
  }

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
      <FormSection
        label="Where it is"
        hint="Looked up from OpenStreetMap for your line - correct it if it looks wrong."
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <TextField
            label="Regions"
            size="small"
            value={regionCountry.regions}
            onChange={(e) =>
              regionCountry.onChange({ regions: e.target.value })
            }
            helperText="Comma-separated, most specific first"
            fullWidth
            slotProps={{
              input: {
                endAdornment: regionCountry.loading ? (
                  <DelayedSpinner size={16} />
                ) : undefined,
              },
            }}
          />
          <TextField
            label="Country"
            size="small"
            value={regionCountry.country}
            onChange={(e) =>
              regionCountry.onChange({ country: e.target.value })
            }
            sx={{ maxWidth: 110 }}
          />
        </Box>
      </FormSection>

      <FormSection
        label="On this section"
        hint={
          draftFeatures.length > 0
            ? `${plural(draftFeatures.length, "feature")} added, plus the access points.`
            : "The access points come from your line; rapids and hazards are optional."
        }
      >
        {/* Fixed entries: the section's own endpoints (derived from the line,
            not submitted as separate features) */}
        {finalCoords && (
          <>
            <SectionPointCard
              num={1}
              color={PUT_IN_COLOR}
              name="Put-in"
              detail={fmtKm(0)}
            />
            <SectionPointCard
              num={2}
              color={TAKE_OUT_COLOR}
              name="Take-out"
              detail={fmtKm(totalM ?? 0)}
            />
          </>
        )}

        {draftFeatures.map((feature, index) => (
          <FeatureRow
            key={`${feature.feature_type}-${index}`}
            featureType={feature.feature_type}
            name={feature.name}
            difficulty={featureDifficulty(feature) ?? undefined}
            gaugeName={feature.gauge_name}
            locationType={feature.location.type}
            extent={draftExtents[index]}
            totalM={totalM}
            onRemove={() => onRemoveDraft(index)}
          />
        ))}
      </FormSection>

      <FormSection
        label="Add a feature"
        hint="Optional - a rapid, weir or hazard worth knowing about."
      >
        {adding ? (
          <>
            <SuggestFeatureForm
              sectionLine={
                finalCoords?.map(([lng, lat]) => ({ lng, lat })) ?? undefined
              }
              nearPoint={nearPoint}
              geometry={geometry}
              onDraft={onAddDraft}
              onSubmitted={closeForm}
              defaultLangCode={defaultLangCode}
              submitRef={submitRef}
              onCanSubmitChange={setCanAdd}
            />
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button onClick={closeForm} sx={{ minHeight: tokens.touch.min }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => submitRef.current?.()}
                disabled={!canAdd}
                sx={{ minHeight: tokens.touch.min }}
              >
                Add feature
              </Button>
            </Box>
          </>
        ) : (
          <Button
            startIcon={<AddIcon />}
            onClick={() => setAdding(true)}
            sx={{ minHeight: tokens.touch.min, alignSelf: "flex-start" }}
          >
            Add feature
          </Button>
        )}
      </FormSection>
    </>
  );
}
