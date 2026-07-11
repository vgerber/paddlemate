import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, type RefObject, useEffect, useState } from "react";
import type { FeatureType, WaterRangeWithStatus } from "@/lib/api";
import { featuresApi } from "@/lib/api";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import { theme } from "@/lib/theme";

type GeomType = "Point" | "LineString" | "Polygon";

/** Languages offered for localized names/descriptions across the app. */
export const LANGUAGE_CODES = [
  "en",
  "de",
  "fr",
  "cs",
  "sk",
  "pl",
  "sl",
  "hr",
  "it",
  "es",
  "pt",
];

export const FEATURE_TYPES: FeatureType[] = [
  "whitewater",
  "freestyle_spot",
  "hole",
  "siphon",
  "strainer",
  "weir",
  "dam",
  "obstacle",
  "bridge",
  "portage",
  "put_in",
  "take_out",
  "waterfall",
];

/** A feature built by the form without being submitted to the API — used by
 * the suggest-section wizard, where features travel inside the section
 * proposal instead of being created on an existing section. */
export interface SectionFeatureDraft {
  feature_type: FeatureType;
  metadata: Record<string, unknown>;
  location: ReturnType<SuggestFeatureFormBuildGeometry>;
  name: string | null;
  description: string | null;
  lang_code: string;
  /** True when "Use full section line" was checked — the wizard substitutes
   * the final section line at submit time. */
  used_section_line: boolean;
}

type SuggestFeatureFormBuildGeometry = () =>
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
  /** Gauge ranges for the section — drives the water-level threshold fields. */
  gaugeRanges?: WaterRangeWithStatus[];
  /** Vertices picked from map */
  vertices: { lng: number; lat: number }[];
  /** Geometry type — controlled by parent */
  geomType: GeomType;
  onGeomTypeChange: (t: GeomType) => void;
  /** True while map is accepting clicks */
  pickingActive: boolean;
  onRequestPick: () => void;
  onStopPick: () => void;
  onRemoveVertex?: (i: number) => void;
  onClearVertices: () => void;
  onSubmitted: () => void;
  /** Draft mode: receive the built feature instead of creating it via the
   * API, then reset the form for the next one. */
  onDraft?: (feature: SectionFeatureDraft) => void;
  /** Rendered at the right end of the language row (e.g. an add button). */
  headerAction?: ReactNode;
  /** Initial language for name/description (default "en"). */
  defaultLangCode?: string;
  /** Ref populated with the current handleSubmit — lets the parent header trigger submission. */
  submitRef?: RefObject<(() => void) | null>;
  /** Called whenever the form's canSubmit state changes. */
  onCanSubmitChange?: (can: boolean) => void;
}

export default function SuggestFeatureForm({
  waterwayId,
  sectionId,
  sectionLine,
  gaugeRanges,
  vertices,
  geomType,
  onGeomTypeChange,
  pickingActive,
  onRequestPick,
  onStopPick,
  onRemoveVertex,
  onClearVertices,
  onSubmitted,
  onDraft,
  headerAction,
  defaultLangCode,
  submitRef,
  onCanSubmitChange,
}: SuggestFeatureFormProps) {
  const queryClient = useQueryClient();
  const [langCode, setLangCode] = useState(defaultLangCode ?? "en");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [featureType, setFeatureType] = useState<FeatureType>("whitewater");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [useSectionLine, setUseSectionLine] = useState(false);
  const [difficulty, setDifficulty] = useState("");
  // Gauge range thresholds
  const availableSeries = gaugeRanges?.map((r) => r.series) ?? [];
  const [seriesId, setSeriesId] = useState<number | "">(
    availableSeries[0]?.id ?? "",
  );
  const defaultRange = gaugeRanges?.[0];
  const [rangeLow, setRangeLow] = useState(
    defaultRange?.range_low?.toString() ?? "",
  );
  const [rangeMedium, setRangeMedium] = useState(
    defaultRange?.range_medium?.toString() ?? "",
  );
  const [rangeHigh, setRangeHigh] = useState(
    defaultRange?.range_high?.toString() ?? "",
  );
  const activeSeries =
    seriesId !== ""
      ? (gaugeRanges?.find((r) => r.series.id === seriesId) ?? gaugeRanges?.[0])
      : gaugeRanges?.[0];

  useEffect(() => {
    const range =
      seriesId !== ""
        ? (gaugeRanges?.find((r) => r.series.id === seriesId) ??
          gaugeRanges?.[0])
        : gaugeRanges?.[0];
    if (!range) return;
    setRangeLow(range.range_low?.toString() ?? "");
    setRangeMedium(range.range_medium?.toString() ?? "");
    setRangeHigh(range.range_high?.toString() ?? "");
  }, [gaugeRanges, seriesId]);

  // Auto-stop picking after first vertex in Point mode
  useEffect(() => {
    if (geomType === "Point" && vertices.length >= 1 && pickingActive) {
      onStopPick();
    }
  }, [geomType, vertices.length, pickingActive, onStopPick]);

  function handleGeomTypeChange(newType: GeomType) {
    if (newType === geomType) return;
    setUseSectionLine(false);
    onGeomTypeChange(newType); // parent resets vertices
  }

  const minVertices =
    geomType === "Point" ? 1 : geomType === "LineString" ? 2 : 3;
  const canSubmit =
    (useSectionLine && geomType === "LineString" && !!sectionLine) ||
    (vertices.length >= minVertices && !submitting);

  // No dependency list: keep the parent's submit ref pointing at the latest
  // handleSubmit
  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmit;
  });
  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  function buildGeometry() {
    if (useSectionLine && geomType === "LineString" && sectionLine) {
      return {
        type: "LineString" as const,
        coordinates: sectionLine.map((v) => [v.lng, v.lat] as [number, number]),
      };
    }
    const coords = vertices.map((v) => [v.lng, v.lat] as [number, number]);
    if (geomType === "Point")
      return { type: "Point" as const, coordinates: coords[0] };
    if (geomType === "LineString")
      return { type: "LineString" as const, coordinates: coords };
    return { type: "Polygon" as const, coordinates: [[...coords, coords[0]]] };
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
    const low = rangeLow !== "" ? Number(rangeLow) : null;
    const med = rangeMedium !== "" ? Number(rangeMedium) : null;
    const high = rangeHigh !== "" ? Number(rangeHigh) : null;
    const hasRange =
      seriesId !== "" && (low != null || med != null || high != null);
    const metadata = {
      ...(diff ? { difficulty: diff } : {}),
      ...(hasRange
        ? {
            water_range: {
              series_id: seriesId,
              ...(low != null ? { range_low: low } : {}),
              ...(med != null ? { range_medium: med } : {}),
              ...(high != null ? { range_high: high } : {}),
            },
          }
        : {}),
    };

    if (onDraft) {
      onDraft({
        feature_type: featureType,
        metadata,
        location: buildGeometry(),
        name: name.trim() || null,
        description: description.trim() || null,
        lang_code: langCode,
        used_section_line:
          useSectionLine && geomType === "LineString" && !!sectionLine,
      });
      resetFields();
      onSubmitted();
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
      });
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.detail(waterwayId),
      });
      onSubmitted();
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const coordLabel = (v: { lng: number; lat: number }) =>
    `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;

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
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel id="lang-label">Language</InputLabel>
          <Select
            labelId="lang-label"
            label="Language"
            value={langCode}
            onChange={(e) => setLangCode(e.target.value)}
            MenuProps={{ sx: { zIndex: 1500 } }}
          >
            {LANGUAGE_CODES.map((lc) => (
              <MenuItem key={lc} value={lc}>
                {lc.toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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

      {availableSeries.length > 0 && (
        <>
          {availableSeries.length > 1 && (
            <FormControl fullWidth size="small">
              <InputLabel id="series-label">Gauge series</InputLabel>
              <Select
                labelId="series-label"
                label="Gauge series"
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value as number | "")}
                MenuProps={{ sx: { zIndex: 1500 } }}
              >
                {(gaugeRanges ?? []).map((r) => (
                  <MenuItem key={r.series.id} value={r.series.id}>
                    {r.series.label ?? r.gauge.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="Low"
              size="small"
              inputMode="decimal"
              value={rangeLow}
              onChange={(e) => setRangeLow(e.target.value)}
              sx={{
                flex: 1,
                "& label": { color: theme.tokens.waterLow.color },
                "& label.Mui-focused": { color: theme.tokens.waterLow.color },
                "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                  { borderColor: theme.tokens.waterLow.color },
              }}
            />
            <TextField
              label="Medium"
              size="small"
              inputMode="decimal"
              value={rangeMedium}
              onChange={(e) => setRangeMedium(e.target.value)}
              sx={{
                flex: 1,
                "& label": { color: theme.tokens.waterMedium.color },
                "& label.Mui-focused": {
                  color: theme.tokens.waterMedium.color,
                },
                "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                  { borderColor: theme.tokens.waterMedium.color },
              }}
            />
            <TextField
              label="High"
              size="small"
              inputMode="decimal"
              value={rangeHigh}
              onChange={(e) => setRangeHigh(e.target.value)}
              sx={{
                flex: 1,
                "& label": { color: theme.tokens.waterHigh.color },
                "& label.Mui-focused": { color: theme.tokens.waterHigh.color },
                "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                  { borderColor: theme.tokens.waterHigh.color },
              }}
            />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: -0.5 }}
          >
            {activeSeries?.series.label ?? activeSeries?.gauge.name}
            {activeSeries?.series.unit ? ` · ${activeSeries.series.unit}` : ""}
          </Typography>
        </>
      )}

      <ToggleButtonGroup
        value={geomType}
        exclusive
        onChange={(_, v) => v && handleGeomTypeChange(v as GeomType)}
        size="small"
        fullWidth
        sx={{
          "& .MuiToggleButton-root": { flex: 1, py: 0.5, fontSize: "0.75rem" },
        }}
      >
        <ToggleButton value="Point">Point</ToggleButton>
        <ToggleButton value="LineString">Line</ToggleButton>
        <ToggleButton value="Polygon">Area</ToggleButton>
      </ToggleButtonGroup>

      {geomType === "Point" ? (
        vertices.length > 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "action.hover",
              borderRadius: 1,
              px: 1,
              py: 0.5,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <LocationOnIcon
              fontSize="small"
              sx={{ color: "text.disabled", flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              sx={{ flex: 1, fontFamily: "monospace", fontSize: "0.75rem" }}
            >
              {coordLabel(vertices[0])}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                onClearVertices();
                onRequestPick();
              }}
              disabled={submitting}
            >
              Move
            </Button>
          </Box>
        ) : (
          <Button
            variant={pickingActive ? "contained" : "outlined"}
            size="small"
            color="primary"
            fullWidth
            startIcon={<LocationOnIcon />}
            onClick={pickingActive ? onStopPick : onRequestPick}
            disabled={submitting}
          >
            {pickingActive ? "Tap the map to place\u2026" : "Place on map"}
          </Button>
        )
      ) : (
        <>
          {geomType === "LineString" && sectionLine && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={useSectionLine}
                  onChange={(e) => {
                    setUseSectionLine(e.target.checked);
                    if (e.target.checked) onClearVertices();
                  }}
                  disabled={submitting}
                />
              }
              label={
                <Typography variant="caption">Use full section line</Typography>
              }
            />
          )}
          {!useSectionLine && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="caption"
                  color={
                    vertices.length === 0
                      ? "text.secondary"
                      : vertices.length < minVertices
                        ? "warning.main"
                        : "success.main"
                  }
                  sx={{ flex: 1 }}
                >
                  {vertices.length === 0
                    ? `Min. ${minVertices} points required`
                    : vertices.length < minVertices
                      ? `${vertices.length} point${vertices.length !== 1 ? "s" : ""} \u2014 ${minVertices - vertices.length} more needed`
                      : `${vertices.length} point${vertices.length !== 1 ? "s" : ""} placed`}
                </Typography>
              </Box>
              {vertices.length > 0 && (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                >
                  {vertices.map((v, i) => (
                    <Box
                      key={`${v.lat},${v.lng}`}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        px: 1,
                        py: 0.5,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.disabled",
                          minWidth: "1rem",
                          textAlign: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          flex: 1,
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                        }}
                      >
                        {coordLabel(v)}
                      </Typography>
                      {onRemoveVertex && (
                        <Box
                          component="span"
                          onClick={() => !submitting && onRemoveVertex(i)}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            borderRadius: 0.5,
                            bgcolor: "action.selected",
                            color: "text.disabled",
                            fontSize: "0.8rem",
                            cursor: submitting ? "default" : "pointer",
                            flexShrink: 0,
                            "&:hover": submitting
                              ? {}
                              : {
                                  color: "text.secondary",
                                },
                          }}
                        >
                          <CloseIcon sx={{ fontSize: "0.75rem" }} />
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Button
                variant={pickingActive ? "contained" : "outlined"}
                color="primary"
                size="small"
                fullWidth
                startIcon={<LocationOnIcon />}
                onClick={pickingActive ? onStopPick : onRequestPick}
                disabled={submitting}
              >
                {pickingActive
                  ? "Done adding points"
                  : vertices.length === 0
                    ? "Start drawing"
                    : "Add another point"}
              </Button>
            </>
          )}
        </>
      )}

      {submitError && (
        <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
          {submitError}
        </Alert>
      )}
    </Box>
  );
}
