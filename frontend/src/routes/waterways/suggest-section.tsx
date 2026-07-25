import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import WaterwayMap from "@/components/map/Map";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import type {
  GeometryPicking,
  GeomType,
} from "@/components/waterway/GeometryPicker";
import SectionFeaturesStep from "@/components/waterway/SectionFeaturesStep";
import SectionLineStep from "@/components/waterway/SectionLineStep";
import SectionNamingForm, {
  createInitialNaming,
  type SectionNamingValue,
} from "@/components/waterway/SectionNamingForm";
import type { SectionFeatureDraft } from "@/components/waterway/SuggestFeatureForm";
import { toPseudoFeature } from "@/components/waterway/section-details/utils";
import type { Feature } from "@/lib/api";
import { sectionsApi } from "@/lib/api";
import { downstreamDot } from "@/lib/geo";
import { useRiverSnap } from "@/lib/hooks/useRiverSnap";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway, waterwayKeys } from "@/lib/hooks/useWaterways";
import type { BoundingBox, Coordinate } from "@/lib/riverSnap";

export const Route = createFileRoute("/waterways/suggest-section")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway != null ? Number(search.waterway) : undefined,
  }),
  component: SuggestSectionPage,
});

const STEPS = ["Naming", "Section", "Features"] as const;

function SuggestSectionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { waterway: waterwayId } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const { data: waterway } = useWaterway(waterwayId ?? null);
  const sections = waterway?.sections ?? [];

  const [step, setStep] = useState(0);

  // Step 1: naming
  const [naming, setNaming] = useState<SectionNamingValue>(createInitialNaming);

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
  const [featureGeomType, setFeatureGeomType] = useState<GeomType>("Point");
  const [featurePickActive, setFeaturePickActive] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const featureGeometry: GeometryPicking = {
    vertices: featureVertices,
    geomType: featureGeomType,
    pickingActive: featurePickActive,
    onGeomTypeChange: (t) => {
      setFeatureGeomType(t);
      setFeatureVertices([]);
    },
    onRequestPick: () => setFeaturePickActive(true),
    onStopPick: () => setFeaturePickActive(false),
    onRemoveVertex: (i) =>
      setFeatureVertices((vertices) =>
        vertices.filter((_, index) => index !== i),
      ),
    onClearVertices: () => setFeatureVertices([]),
  };

  // Bring the map into view whenever a pick starts (any trigger: place
  // point, start drawing a line/area, move) - the buttons sit below the
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
    downstreamDot(
      sections.map(
        (s) =>
          (s.location as unknown as GeoJSON.LineString)
            .coordinates as Coordinate[],
      ),
      putIn,
      takeOut,
    ) < 0;

  // Drafted features shown on the map as ghost markers (same rendering as
  // pending feature proposals)
  const draftFeaturePseudos: Feature[] = useMemo(
    () =>
      draftFeatures.map((feature, index) =>
        toPseudoFeature(
          {
            feature_type: feature.feature_type,
            // Full-section features are label-suppressed on the map, so
            // the difficulty fallback must not resurface there either
            metadata: feature.used_section_line
              ? { ...feature.metadata, difficulty: undefined }
              : feature.metadata,
            location: (feature.used_section_line && finalCoords
              ? { type: "LineString", coordinates: finalCoords }
              : feature.location) as Feature["location"],
            // Full-section features skip the on-map name label - the section
            // label already covers the whole line
            name: feature.used_section_line ? null : feature.name,
            lang_code: feature.lang_code,
          },
          index,
        ),
      ),
    [draftFeatures, finalCoords],
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
          location: (feature.used_section_line
            ? { type: "LineString", coordinates }
            : feature.location) as never,
          name: feature.name,
          description: feature.description,
          lang_code: feature.lang_code,
          water_ranges: feature.water_ranges,
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
      {/* No header - the bottom bar carries the title, step and cancel. */}
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
          {/* Map - for picking the section line and placing features */}
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

          {step === 0 && (
            <SectionNamingForm value={naming} onChange={setNaming} />
          )}

          {step === 1 && (
            <SectionLineStep
              waterwayName={waterway?.name}
              snap={snap}
              putIn={putIn}
              takeOut={takeOut}
              onClearPutIn={() => setPutIn(null)}
              onClearTakeOut={() => setTakeOut(null)}
              snapActive={snapActive}
              onLineSourceChange={setLineSource}
              orderWrong={orderWrong}
            />
          )}

          {step === 2 && (
            <SectionFeaturesStep
              finalCoords={finalCoords}
              nearPoint={
                finalCoords
                  ? {
                      lat: finalCoords[Math.floor(finalCoords.length / 2)][1],
                      lon: finalCoords[Math.floor(finalCoords.length / 2)][0],
                    }
                  : (putIn ?? undefined)
              }
              draftFeatures={draftFeatures}
              draftFeaturePseudos={draftFeaturePseudos}
              onAddDraft={(feature) =>
                setDraftFeatures((features) => [...features, feature])
              }
              onRemoveDraft={(index) =>
                setDraftFeatures((features) =>
                  features.filter((_, i) => i !== index),
                )
              }
              geometry={featureGeometry}
              defaultLangCode={naming.langCode}
            />
          )}

          {submitError && (
            <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
              {submitError}
            </Alert>
          )}

          {/* Bottom bar - pinned to the viewport bottom, above the mobile
              bottom navigation (zIndex 1300) */}
          <Box
            sx={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 720,
              zIndex: 1350,
              bgcolor: "background.paper",
            }}
          >
            <PanelBottomBar
              leftIcon={step === 0 ? <CloseIcon /> : <ArrowBackIcon />}
              onLeftClick={step === 0 ? backToMap : () => setStep(step - 1)}
              leftLabel={step === 0 ? "Cancel" : "Back"}
              leftDisabled={submitting}
              title={`New section · ${waterway?.name ?? "…"}`}
              subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
              action={
                <RoundActionButton
                  onClick={
                    step < STEPS.length - 1
                      ? () => setStep(step + 1)
                      : handleSubmit
                  }
                  disabled={!canProceed || submitting}
                  ariaLabel={
                    step < STEPS.length - 1 ? "Next" : "Suggest section"
                  }
                >
                  {submitting ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : step < STEPS.length - 1 ? (
                    <ArrowForwardIcon fontSize="small" />
                  ) : (
                    <CheckIcon fontSize="small" />
                  )}
                </RoundActionButton>
              }
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
