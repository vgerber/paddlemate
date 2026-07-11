import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ReplayIcon from "@mui/icons-material/Replay";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
import WaterwayMap from "@/components/map/Map";
import SectionNamingForm, {
  initialNaming,
  type SectionNamingValue,
} from "@/components/waterway/SectionNamingForm";
import SuggestFeatureForm, {
  type SectionFeatureDraft,
} from "@/components/waterway/SuggestFeatureForm";
import {
  computeExtent,
  fmtKm,
} from "@/components/waterway/section-details/utils";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import { sectionsApi } from "@/lib/api";
import { distanceAlongLineM } from "@/lib/geo";
import { useRiverSnap } from "@/lib/hooks/useRiverSnap";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway, waterwayKeys } from "@/lib/hooks/useWaterways";
import type { BoundingBox, Coordinate } from "@/lib/riverSnap";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

export const Route = createFileRoute("/waterways/suggest-section")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway != null ? Number(search.waterway) : undefined,
  }),
  component: SuggestSectionPage,
});

const STEPS = ["Naming", "Section", "Features"] as const;

/** Dot product of proposed direction vs. estimated river flow.
 *  Negative → proposed take-out is upstream of put-in. */
function downstreamDot(
  sections: SectionWithFeatures[],
  putIn: { lat: number; lon: number },
  takeOut: { lat: number; lon: number },
): number {
  let dx = 0;
  let dy = 0;
  for (const s of sections) {
    const coords = (s.location as unknown as GeoJSON.LineString).coordinates;
    if (coords.length >= 2) {
      const start = coords[0];
      const end = coords[coords.length - 1];
      dx += end[0] - start[0];
      dy += end[1] - start[1];
    }
  }
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 1;
  const fx = dx / len;
  const fy = dy / len;
  return (takeOut.lon - putIn.lon) * fx + (takeOut.lat - putIn.lat) * fy;
}

function SuggestSectionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { waterway: waterwayId } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const { data: waterway } = useWaterway(waterwayId ?? null);
  const sections = waterway?.sections ?? [];

  const [step, setStep] = useState(0);

  // Step 1: naming
  const [naming, setNaming] = useState<SectionNamingValue>(initialNaming);

  // Step 2: section line
  const [putIn, setPutIn] = useState<{ lat: number; lon: number } | null>(null);
  const [takeOut, setTakeOut] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [lineSource, setLineSource] = useState<"snap" | "straight">("snap");
  const [mapBounds, setMapBounds] = useState<BoundingBox | null>(null);
  const snap = useRiverSnap(waterway?.name ?? "", putIn, takeOut, mapBounds);

  // Step 3: features (drafted with the shared feature form, drawn on the map)
  const [draftFeatures, setDraftFeatures] = useState<SectionFeatureDraft[]>([]);
  const [featureVertices, setFeatureVertices] = useState<
    { lng: number; lat: number }[]
  >([]);
  const [featureGeomType, setFeatureGeomType] = useState<
    "Point" | "LineString" | "Polygon"
  >("Point");
  const [featurePickActive, setFeaturePickActive] = useState(false);
  const featureSubmitRef = useRef<(() => void) | null>(null);
  const [canAddFeature, setCanAddFeature] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Bring the map into view whenever a pick starts (any trigger: place
  // point, start drawing a line/area, move) — the buttons sit below the
  // map, often off-screen on mobile. Deferred a frame so the button's own
  // focus scrolling can't cancel the smooth scroll.
  useEffect(() => {
    if (!featurePickActive) return;
    const frame = requestAnimationFrame(() => {
      mapContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [featurePickActive]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const hasLocation = putIn != null && takeOut != null;
  const snapActive = lineSource === "snap" && snap.status === "done";
  const snapInProgress =
    snap.status === "searching" || snap.status === "routing";

  const finalCoords: Coordinate[] | null = useMemo(
    () =>
      lineSource === "snap" &&
      snap.snappedCoords &&
      snap.snappedCoords.length >= 2
        ? snap.snappedCoords
        : putIn && takeOut
          ? [
              [putIn.lon, putIn.lat],
              [takeOut.lon, takeOut.lat],
            ]
          : null,
    [lineSource, snap.snappedCoords, putIn, takeOut],
  );

  const orderWrong =
    hasLocation &&
    sections.length > 0 &&
    downstreamDot(sections, putIn, takeOut) < 0;

  // Drafted features shown on the map as ghost markers (same rendering as
  // pending feature proposals)
  const draftFeaturePseudos: Feature[] = useMemo(
    () =>
      draftFeatures.map(
        (feature, index) =>
          ({
            id: -(index + 1),
            section_id: 0,
            feature_type: feature.feature_type,
            // Full-section features are label-suppressed on the map, so
            // the difficulty fallback must not resurface there either
            metadata: feature.used_section_line
              ? { ...feature.metadata, difficulty: undefined }
              : feature.metadata,
            location: (feature.used_section_line && finalCoords
              ? { type: "LineString", coordinates: finalCoords }
              : feature.location) as Feature["location"],
            // Full-section features skip the on-map name label — the section
            // label already covers the whole line
            names:
              feature.name && !feature.used_section_line
                ? [
                    {
                      id: 0,
                      feature_id: -(index + 1),
                      lang_code: feature.lang_code,
                      name: feature.name,
                    },
                  ]
                : [],
            descriptions: [],
            created_by: "",
            created_at: "",
            updated_at: "",
          }) as Feature,
      ),
    [draftFeatures, finalCoords],
  );

  // Position of each draft along the section line, for the list rows
  const draftFeatureExtents = useMemo(
    () =>
      finalCoords
        ? draftFeaturePseudos.map((feature) =>
            computeExtent(feature, finalCoords),
          )
        : [],
    [draftFeaturePseudos, finalCoords],
  );

  const canProceed =
    step === 0
      ? naming.name.trim().length > 0
      : step === 1
        ? hasLocation
        : true;

  const onSectionStep = step === 1;
  const onFeaturesStep = step === 2;

  async function handleSubmit() {
    if (!naming.name.trim() || !putIn || !takeOut || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const coordinates: [number, number][] =
        finalCoords && finalCoords.length >= 2
          ? finalCoords
          : [
              [putIn.lon, putIn.lat],
              [takeOut.lon, takeOut.lat],
            ];
      await sectionsApi.create(waterwayId as number, {
        name: naming.name.trim(),
        region: naming.region.trim() || null,
        country: naming.country.trim() || null,
        description: naming.description.trim() || null,
        location: { type: "LineString", coordinates } as never,
        // The primary entry is stored as a tagged localization too — the
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
          location: (feature.used_section_line
            ? { type: "LineString", coordinates }
            : feature.location) as never,
          name: feature.name,
          description: feature.description,
          lang_code: feature.lang_code,
        })),
      });
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.detail(waterwayId as number),
      });
      setSubmitted(true);
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const backToMap = () =>
    router.navigate({
      to: "/",
      search: {
        waterway: waterwayId,
        section: undefined,
        q: undefined,
        country: undefined,
        min_diff: undefined,
        max_diff: undefined,
        mode: undefined,
        lat: undefined,
        lon: undefined,
        radius: undefined,
        panel: undefined,
      },
    });

  if (waterwayId == null) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
        <Typography color="text.secondary">No waterway selected.</Typography>
      </Box>
    );
  }

  if (sessionLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pt: 10,
          px: 2,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          Sign in to suggest a section
        </Typography>
        <Button variant="contained" color="secondary" onClick={login}>
          Sign In
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: { xs: 1.5, md: 2 } }}>
      {/* Header — compact single row: title, step progress, cancel */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1.5,
          pb: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.05em",
            minWidth: 0,
          }}
          noWrap
        >
          Suggest section · {waterway?.name ?? "…"}
        </Typography>
        <Button
          onClick={backToMap}
          size="small"
          sx={{ ml: "auto", borderRadius: 0, flexShrink: 0 }}
        >
          Cancel
        </Button>
      </Box>

      {submitted ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Alert severity="success">
            Thanks! Your section was submitted and is pending review. It will
            appear on the river once an admin approves it.
          </Alert>
          <Button
            variant="contained"
            color="secondary"
            onClick={backToMap}
            sx={{ alignSelf: "flex-start", borderRadius: 0 }}
          >
            Back to map
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Map — for picking the section line and placing features */}
          {step > 0 && (
            <Box
              ref={mapContainerRef}
              sx={{
                height: 380,
                border: "1px solid",
                borderColor: "divider",
                position: "relative",
                // Keep clear of the fixed AppBar when scrolled into view
                // (mobile has no top bar)
                scrollMarginTop: { xs: 8, md: 80 },
              }}
            >
              <WaterwayMap
                sections={sections}
                cooperativeGestures
                putIn={putIn}
                takeOut={takeOut}
                onPickPutIn={
                  onSectionStep
                    ? (lat, lon) => setPutIn({ lat, lon })
                    : undefined
                }
                onPickTakeOut={
                  onSectionStep
                    ? (lat, lon) => setTakeOut({ lat, lon })
                    : undefined
                }
                sectionPreviewCoords={finalCoords ?? undefined}
                riverHighlightCoords={snap.river}
                onBoundsChange={setMapBounds}
                placingFeature={onFeaturesStep && featurePickActive}
                onMapClick={
                  onFeaturesStep && featurePickActive
                    ? (lng, lat) =>
                        setFeatureVertices((vertices) => [
                          ...vertices,
                          { lng, lat },
                        ])
                    : undefined
                }
                featureVertices={
                  onFeaturesStep && featureVertices.length > 0
                    ? featureVertices
                    : undefined
                }
                featureGeomType={featureGeomType}
                proposedFeatures={
                  onFeaturesStep && draftFeaturePseudos.length > 0
                    ? draftFeaturePseudos
                    : undefined
                }
              />
            </Box>
          )}

          {/* Step 1 — Naming */}
          {step === 0 && (
            <SectionNamingForm value={naming} onChange={setNaming} />
          )}

          {/* Step 2 — Section line */}
          {step === 1 && (
            <>
              {!hasLocation && (
                <>
                  {snap.riverLookup === "searching" && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={14} />
                      <Typography variant="caption" color="text.secondary">
                        Searching for {waterway?.name ?? "the river"} on
                        OpenStreetMap…
                      </Typography>
                    </Box>
                  )}
                  {snap.riverLookup === "found" && (
                    <Typography variant="caption" color="text.secondary">
                      River course highlighted on the map — pick your points on
                      it.
                    </Typography>
                  )}
                  {snap.riverLookup === "not-found" && (
                    <Typography variant="caption" color="text.secondary">
                      Couldn't find {waterway?.name ?? "the river"} in this map
                      view — pan or zoom to it, or pick your points anyway.
                    </Typography>
                  )}
                  {snap.riverLookup === "zoomed-out" && (
                    <Typography variant="caption" color="text.secondary">
                      Zoom in to preview the river course.
                    </Typography>
                  )}
                </>
              )}

              <Box sx={{ display: "flex", gap: 1.5 }}>
                <LocationPin
                  num={1}
                  color={PUT_IN_COLOR}
                  title="PUT-IN"
                  coords={putIn}
                  onClear={() => setPutIn(null)}
                />
                <LocationPin
                  num={2}
                  color={TAKE_OUT_COLOR}
                  title="TAKE-OUT"
                  coords={takeOut}
                  onClear={() => setTakeOut(null)}
                />
              </Box>

              {hasLocation && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {snap.status === "failed" && (
                    <Alert
                      severity="warning"
                      sx={{ py: 0.25, fontSize: "0.75rem" }}
                    >
                      Couldn't match this river on OpenStreetMap — a straight
                      line between your points will be used.
                    </Alert>
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ToggleButtonGroup
                      value={snapActive ? "snap" : "straight"}
                      exclusive
                      size="small"
                      onChange={(_, v) => {
                        if (v) setLineSource(v);
                      }}
                      sx={{
                        flex: 1,
                        "& .MuiToggleButton-root": {
                          flex: 1,
                          py: { xs: 1.25, md: 0.5 },
                          fontSize: { xs: "0.75rem", md: "0.7rem" },
                        },
                      }}
                    >
                      <ToggleButton
                        value="snap"
                        disabled={snap.status !== "done"}
                      >
                        {snapInProgress && (
                          <CircularProgress
                            size={12}
                            color="inherit"
                            sx={{ mr: 0.75 }}
                          />
                        )}
                        Snapped course
                      </ToggleButton>
                      <ToggleButton value="straight">
                        Straight line
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <Tooltip title="Retry OSM matching">
                      <span>
                        <IconButton
                          size="small"
                          onClick={snap.retry}
                          disabled={snapInProgress}
                          sx={{ p: { xs: 1.25, md: 0.625 } }}
                        >
                          <ReplayIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  {orderWrong && (
                    <Alert
                      severity="warning"
                      sx={{ py: 0.25, fontSize: "0.75rem" }}
                    >
                      Put-in appears to be downstream of take-out — check the
                      order.
                    </Alert>
                  )}
                </Box>
              )}
            </>
          )}

          {/* Step 3 — Features: the shared feature form in draft mode;
              each added feature travels inside the section proposal */}
          {step === 2 && (
            <>
              {/* Fixed entries: the section's own endpoints (derived from the
                  line, not submitted as separate features) */}
              {finalCoords &&
                (
                  [
                    { num: 1, label: "put in", color: PUT_IN_COLOR, km: 0 },
                    {
                      num: 2,
                      label: "take out",
                      color: TAKE_OUT_COLOR,
                      km: distanceAlongLineM(
                        finalCoords[finalCoords.length - 1],
                        finalCoords,
                      ),
                    },
                  ] as const
                ).map((endpoint) => (
                  <Box
                    key={endpoint.label}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      opacity: 0.8,
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        bgcolor: endpoint.color,
                        color: tokens.white,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {endpoint.num}
                    </Box>
                    <Typography
                      sx={{
                        flex: 1,
                        color: "text.secondary",
                        fontFamily: fonts.label,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontSize: "0.62rem",
                      }}
                    >
                      {endpoint.label}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Point
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: fonts.mono,
                          fontSize: "0.65rem",
                          color: "text.disabled",
                        }}
                      >
                        {fmtKm(endpoint.km)}
                      </Typography>
                    </Box>
                    {/* Spacer where removable rows show the ✕ */}
                    <Box sx={{ width: 34, flexShrink: 0 }} />
                  </Box>
                ))}

              {draftFeatures.map((feature, index) => {
                const difficulty = feature.metadata.difficulty as
                  | string
                  | undefined;
                const detail = feature.name
                  ? difficulty
                    ? `${feature.name} (${difficulty})`
                    : feature.name
                  : (difficulty ?? "");
                const extent = draftFeatureExtents[index];
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
                      <Typography
                        sx={{
                          color: "text.secondary",
                          fontFamily: fonts.label,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontSize: "0.62rem",
                        }}
                      >
                        {feature.feature_type.replace(/_/g, " ")}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {feature.used_section_line
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
                    <IconButton
                      aria-label="Remove feature"
                      onClick={() =>
                        setDraftFeatures(
                          draftFeatures.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}

              <SuggestFeatureForm
                sectionLine={
                  finalCoords?.map(([lng, lat]) => ({ lng, lat })) ?? undefined
                }
                vertices={featureVertices}
                geomType={featureGeomType}
                onGeomTypeChange={(t) => {
                  setFeatureGeomType(t);
                  setFeatureVertices([]);
                }}
                pickingActive={featurePickActive}
                onRequestPick={() => setFeaturePickActive(true)}
                onStopPick={() => setFeaturePickActive(false)}
                onRemoveVertex={(i) =>
                  setFeatureVertices(
                    featureVertices.filter((_, index) => index !== i),
                  )
                }
                onClearVertices={() => setFeatureVertices([])}
                onDraft={(feature) =>
                  setDraftFeatures((features) => [...features, feature])
                }
                defaultLangCode={naming.langCode}
                onSubmitted={() => {}}
                submitRef={featureSubmitRef}
                onCanSubmitChange={setCanAddFeature}
                headerAction={
                  <IconButton
                    onClick={() => featureSubmitRef.current?.()}
                    disabled={!canAddFeature}
                    aria-label="Add feature"
                    sx={{
                      borderRadius: "50%",
                      bgcolor: "secondary.main",
                      color: "secondary.contrastText",
                      "&:hover": { bgcolor: "secondary.light" },
                      "&.Mui-disabled": {
                        bgcolor: "action.disabledBackground",
                        color: "action.disabled",
                      },
                    }}
                  >
                    <CheckIcon fontSize="small" />
                  </IconButton>
                }
              />
            </>
          )}

          {submitError && (
            <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
              {submitError}
            </Alert>
          )}

          {/* Bottom bar — mirrors the suggest-feature panel: pinned to the
              viewport bottom (over the bottom navigation), back/cancel left,
              progress in the middle, round action right */}
          <Box
            sx={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 720,
              // Above the mobile bottom navigation (zIndex 1300)
              zIndex: 1350,
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1,
              pt: 1,
              pb: "calc(8px + env(safe-area-inset-bottom))",
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <IconButton
              onClick={step === 0 ? backToMap : () => setStep(step - 1)}
              disabled={submitting}
              aria-label={step === 0 ? "Cancel" : "Back"}
            >
              {step === 0 ? <CloseIcon /> : <ArrowBackIcon />}
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                {waterway?.name ?? "…"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block" }}
              >
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </Typography>
            </Box>
            <IconButton
              size="large"
              onClick={
                step < STEPS.length - 1 ? () => setStep(step + 1) : handleSubmit
              }
              disabled={!canProceed || submitting}
              aria-label={step < STEPS.length - 1 ? "Next" : "Suggest section"}
              sx={{
                borderRadius: "50%",
                bgcolor: "secondary.main",
                color: "secondary.contrastText",
                "&:hover": { bgcolor: "secondary.light" },
                "&.Mui-disabled": {
                  bgcolor: "action.disabledBackground",
                  color: "action.disabled",
                },
              }}
            >
              {submitting ? (
                <CircularProgress size={20} color="inherit" />
              ) : step < STEPS.length - 1 ? (
                <ArrowForwardIcon fontSize="small" />
              ) : (
                <CheckIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
