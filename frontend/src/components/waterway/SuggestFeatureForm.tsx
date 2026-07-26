import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, type RefObject, useEffect, useState } from "react";
import LanguagePicker from "@/components/LanguagePicker";
import type {
  FeatureType,
  FeatureWaterRangeBody,
  WaterRangeWithStatus,
} from "@/lib/api";
import { featuresApi } from "@/lib/api";
import { FEATURE_TYPES } from "@/lib/featureTypes";
import { useGaugePicker } from "@/lib/hooks/useGaugePicker";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import { preferredLanguage } from "@/lib/languagePreference";
import GaugeRangePicker from "./GaugeRangePicker";
import GeometryPicker, {
  type GeometryPicking,
  minVerticesFor,
} from "./GeometryPicker";

/** A feature built by the form without being submitted to the API - used by
 * the suggest-section wizard, where features travel inside the section
 * proposal instead of being created on an existing section. */
export interface SectionFeatureDraft {
  feature_type: FeatureType;
  metadata: Record<string, unknown>;
  location: BuiltGeometry;
  name: string | null;
  description: string | null;
  lang_code: string;
  water_ranges: FeatureWaterRangeBody[];
  /** Display-only: name of the selected gauge (not sent to the API). */
  gauge_name: string | null;
  /** True when "Use full section line" was checked - the wizard substitutes
   * the final section line at submit time. */
  used_section_line: boolean;
}

type BuiltGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

interface SuggestFeatureFormProps {
  /** Required unless `onDraft` is set. */
  waterwayId?: number;
  /** Required unless `onDraft` is set. */
  sectionId?: number;
  /** Full line of the section, offered as a one-click fill for LineString features. */
  sectionLine?: { lng: number; lat: number }[];
  /** Gauge ranges for the section - drives the water-level threshold fields. */
  gaugeRanges?: WaterRangeWithStatus[];
  /** Map-driven geometry drawing state, owned by the page/panel. */
  geometry: GeometryPicking;
  onSubmitted?: () => void;
  /** Draft mode: receive the built feature instead of creating it via the
   * API, then reset the form for the next one. */
  onDraft?: (feature: SectionFeatureDraft) => void;
  /** Rendered at the right end of the language row (e.g. an add button). */
  headerAction?: ReactNode;
  /** Initial language for name/description; defaults to the display language.
   * Read once on mount, so changing it later does not override a deliberate
   * per-feature choice. */
  defaultLangCode?: string;
  /** Reference point for the gauge search - nearby gauges are listed first. */
  nearPoint?: { lat: number; lon: number };
  /** Ref populated with the current handleSubmit - lets the parent header trigger submission. */
  submitRef?: RefObject<(() => void) | null>;
  /** Called whenever the form's canSubmit state changes. */
  onCanSubmitChange?: (can: boolean) => void;
}

export default function SuggestFeatureForm({
  waterwayId,
  sectionId,
  sectionLine,
  gaugeRanges,
  geometry,
  onSubmitted,
  onDraft,
  headerAction,
  defaultLangCode,
  nearPoint,
  submitRef,
  onCanSubmitChange,
}: SuggestFeatureFormProps) {
  const queryClient = useQueryClient();
  const [langCode, setLangCode] = useState(
    defaultLangCode ?? preferredLanguage(),
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [featureType, setFeatureType] = useState<FeatureType>("whitewater");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [useSectionLine, setUseSectionLine] = useState(false);
  const [difficulty, setDifficulty] = useState("");

  const gaugePicker = useGaugePicker({ gaugeRanges, nearPoint });

  const { vertices, geomType, pickingActive, onStopPick, onClearVertices } =
    geometry;

  // Auto-stop picking after first vertex in Point mode
  useEffect(() => {
    if (geomType === "Point" && vertices.length >= 1 && pickingActive) {
      onStopPick();
    }
  }, [geomType, vertices.length, pickingActive, onStopPick]);

  const canSubmit =
    ((useSectionLine && geomType === "LineString" && !!sectionLine) ||
      (vertices.length >= minVerticesFor(geomType) && !submitting)) &&
    gaugePicker.thresholdError == null;

  // No dependency list: keep the parent's submit ref pointing at the latest
  // handleSubmit
  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmit;
  });
  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  function buildGeometry(): BuiltGeometry {
    if (useSectionLine && geomType === "LineString" && sectionLine) {
      return {
        type: "LineString",
        coordinates: sectionLine.map((v) => [v.lng, v.lat] as [number, number]),
      };
    }
    const coords = vertices.map((v) => [v.lng, v.lat] as [number, number]);
    if (geomType === "Point") return { type: "Point", coordinates: coords[0] };
    if (geomType === "LineString")
      return { type: "LineString", coordinates: coords };
    return { type: "Polygon", coordinates: [[...coords, coords[0]]] };
  }

  function resetFields() {
    setName("");
    setDescription("");
    setDifficulty("");
    setUseSectionLine(false);
    onClearVertices();
    onStopPick();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const diff = difficulty.trim() || null;
    const metadata = diff ? { difficulty: diff } : {};
    const waterRanges = gaugePicker.buildWaterRanges();

    if (onDraft) {
      onDraft({
        feature_type: featureType,
        metadata,
        location: buildGeometry(),
        name: name.trim() || null,
        description: description.trim() || null,
        lang_code: langCode,
        water_ranges: waterRanges,
        gauge_name:
          waterRanges.length > 0
            ? (gaugePicker.selectedGauge?.name ?? null)
            : null,
        used_section_line:
          useSectionLine && geomType === "LineString" && !!sectionLine,
      });
      resetFields();
      onSubmitted?.();
      return;
    }

    if (waterwayId == null || sectionId == null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await featuresApi.create(waterwayId, sectionId, {
        feature_type: featureType,
        location: buildGeometry() as never,
        metadata,
        lang_code: langCode,
        name: name.trim() || null,
        description: description.trim() || null,
        water_ranges: waterRanges,
      });
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.detail(waterwayId),
      });
      onSubmitted?.();
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        px: 1.5,
        pt: 1.5,
        pb: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        "& .MuiInputBase-inputSizeSmall": {
          py: { xs: "12px", md: "8.5px" },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <LanguagePicker
          value={langCode}
          onChange={setLangCode}
          size="small"
          overlay
        />
        {headerAction && (
          <>
            <Box sx={{ flex: 1 }} />
            {headerAction}
          </>
        )}
      </Box>

      <TextField
        label="Name"
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
      />

      <TextField
        label="Description"
        size="small"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        minRows={2}
      />

      <FormControl fullWidth size="small">
        <InputLabel id="feature-type-label">Feature type</InputLabel>
        <Select
          labelId="feature-type-label"
          label="Feature type"
          value={featureType}
          onChange={(e) => setFeatureType(e.target.value as FeatureType)}
          MenuProps={{ sx: { zIndex: 1500 } }}
        >
          {FEATURE_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t.replace(/_/g, " ")}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Difficulty"
        size="small"
        value={difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
        placeholder="e.g. III+, III-IV, IV-V+"
        fullWidth
      />

      <GaugeRangePicker picker={gaugePicker} />

      <GeometryPicker
        geometry={geometry}
        sectionLine={sectionLine}
        useSectionLine={useSectionLine}
        onUseSectionLineChange={setUseSectionLine}
        disabled={submitting}
      />

      {submitError && (
        <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
          {submitError}
        </Alert>
      )}
    </Box>
  );
}
