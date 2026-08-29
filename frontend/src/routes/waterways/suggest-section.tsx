import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import MapIcon from "@mui/icons-material/Map";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import WaterwayMap from "@/components/map/Map";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import SectionFeaturesStep from "@/components/waterway/SectionFeaturesStep";
import SectionLineStep from "@/components/waterway/SectionLineStep";
import SectionNamingForm from "@/components/waterway/SectionNamingForm";
import { buildSectionPayload } from "@/components/waterway/sectionPayload";
import {
  useSectionWizardState,
  WIZARD_STEPS,
} from "@/components/waterway/useSectionWizardState";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateSection } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/waterways/suggest-section")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway != null ? Number(search.waterway) : undefined,
  }),
  component: SuggestSectionPage,
});

function SuggestSectionPage() {
  const router = useRouter();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { waterway: waterwayId } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const { data: waterway } = useWaterway(waterwayId ?? null);
  const sections = waterway?.sections ?? [];

  const wizard = useSectionWizardState(
    waterway?.name ?? "",
    sections,
    waterwayId,
  );
  const { step, putIn, takeOut, finalCoords, featurePickActive } = wizard;

  const createSection = useCreateSection(waterwayId ?? 0);
  const submitting = createSection.isPending;
  const submitError = createSection.error
    ? apiErrorMessage(
        createSection.error,
        "Failed to submit. Please try again.",
      )
    : null;
  const [submitted, setSubmitted] = useState(false);

  const onSectionStep = step === 1;
  const onFeaturesStep = step === 2;

  function handleSubmit() {
    if (!wizard.naming.name.trim() || !putIn || !takeOut || submitting) return;
    const coordinates: [number, number][] =
      finalCoords && finalCoords.length >= 2
        ? finalCoords
        : [
            [putIn.lon, putIn.lat],
            [takeOut.lon, takeOut.lat],
          ];
    createSection.mutate(
      buildSectionPayload(
        wizard.naming,
        wizard.regionInfo,
        coordinates,
        wizard.draftFeatures,
        putIn,
        takeOut,
      ),
      {
        onSuccess: () => setSubmitted(true),
      },
    );
  }

  const backToMap = () =>
    router.navigate({
      to: "/",
      search: { ...EMPTY_MAP_SEARCH, waterway: waterwayId },
    });

  if (waterwayId == null) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
        <Typography color="text.secondary">No waterway selected.</Typography>
      </Box>
    );
  }

  if (sessionLoading) {
    return <LoadingBox size={40} pt={8} />;
  }

  if (!isAuthenticated) {
    return <SignInGate icon={null} title="Sign in to suggest a section" />;
  }

  return (
    <Box
      sx={{
        maxWidth: { xs: 720, md: 1240 },
        mx: "auto",
        px: 2,
        py: { xs: 1.5, md: 2 },
        pb: { xs: 12, md: 13 },
      }}
    >
      {/* No header - the bottom bar carries the title, step and cancel. */}
      {submitted ? (
        <EmptyState
          icon={
            <CheckCircleOutlineIcon
              sx={{ fontSize: 40, color: "text.disabled" }}
            />
          }
          title="Section submitted"
          caption="It appears on the river once an admin approves it."
          py={8}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            // Desktop keeps the map beside the form so picking points and
            // filling fields never fight over the same scroll position.
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 420px" },
            alignItems: "start",
            gap: { xs: 2.5, md: 3 },
          }}
        >
          {/* Map - for picking the section line and placing features. Shown
              from the naming step on desktop, where it fits beside the form
              and gives the river as context. */}
          {(step > 0 || isDesktop) && (
            <Box
              ref={wizard.mapContainerRef}
              sx={{
                height: { xs: 380, md: "calc(100vh - 200px)" },
                minHeight: { md: 460 },
                position: { xs: "relative", md: "sticky" },
                top: { md: 88 },
                border: "1px solid",
                borderColor: "divider",
                // Keep clear of the fixed AppBar when scrolled into view
                // (mobile has no top bar)
                scrollMarginTop: { xs: 8, md: 80 },
              }}
            >
              <WaterwayMap
                sections={sections}
                onBoundsChange={wizard.setMapBounds}
                proposedFeatures={
                  onFeaturesStep && wizard.draftFeaturePseudos.length > 0
                    ? wizard.draftFeaturePseudos
                    : undefined
                }
                chrome={{ cooperativeGestures: true }}
                picking={{
                  putIn,
                  takeOut,
                  onPickPutIn: onSectionStep
                    ? (lat, lon) => wizard.setPutIn({ lat, lon })
                    : undefined,
                  onPickTakeOut: onSectionStep
                    ? (lat, lon) => wizard.setTakeOut({ lat, lon })
                    : undefined,
                }}
                drawing={{
                  sectionPreviewCoords: finalCoords ?? undefined,
                  riverHighlightCoords: wizard.snap.river,
                  placingFeature: onFeaturesStep && featurePickActive,
                  onMapClick:
                    onFeaturesStep && featurePickActive
                      ? (lng, lat) =>
                          wizard.setFeatureVertices((vertices) => [
                            ...vertices,
                            { lng, lat },
                          ])
                      : undefined,
                  featureVertices:
                    onFeaturesStep && wizard.featureVertices.length > 0
                      ? wizard.featureVertices
                      : undefined,
                  featureGeomType: wizard.featureGeomType,
                }}
              />
            </Box>
          )}

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2.5,
              minWidth: 0,
            }}
          >
            {step === 0 && (
              <SectionNamingForm
                value={wizard.naming}
                onChange={wizard.setNaming}
              />
            )}

            {step === 1 && (
              <SectionLineStep
                waterwayName={waterway?.name}
                snap={wizard.snap}
                putIn={putIn}
                takeOut={takeOut}
                onClearPutIn={() => wizard.setPutIn(null)}
                onClearTakeOut={() => wizard.setTakeOut(null)}
                snapActive={wizard.snapActive}
                onLineSourceChange={wizard.setLineSource}
                orderWrong={wizard.orderWrong}
              />
            )}

            {step === 2 && (
              <SectionFeaturesStep
                regionCountry={{
                  regions: wizard.regionInfo.regions,
                  country: wizard.regionInfo.country,
                  loading: wizard.regionLookup === "loading",
                  onChange: wizard.setRegionInfo,
                }}
                finalCoords={finalCoords}
                nearPoint={
                  finalCoords
                    ? {
                        lat: finalCoords[Math.floor(finalCoords.length / 2)][1],
                        lon: finalCoords[Math.floor(finalCoords.length / 2)][0],
                      }
                    : (putIn ?? undefined)
                }
                draftFeatures={wizard.draftFeatures}
                draftFeaturePseudos={wizard.draftFeaturePseudos}
                onAddDraft={(feature) =>
                  wizard.setDraftFeatures((features) => [...features, feature])
                }
                onRemoveDraft={(index) =>
                  wizard.setDraftFeatures((features) =>
                    features.filter((_, i) => i !== index),
                  )
                }
                geometry={wizard.featureGeometry}
                defaultLangCode={wizard.naming.langCode}
              />
            )}

            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Box>
        </Box>
      )}

      {/* Bottom bar - pinned to the viewport bottom, above the mobile
          bottom navigation (zIndex 1300). Carries the flow's only action,
          including the way out once the section is submitted. */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: { xs: 720, md: 1240 },
          zIndex: 1350,
          bgcolor: "background.paper",
        }}
      >
        <PanelBottomBar
          leftIcon={step === 0 || submitted ? <CloseIcon /> : <ArrowBackIcon />}
          onLeftClick={
            step === 0 || submitted ? backToMap : () => wizard.setStep(step - 1)
          }
          leftLabel={step === 0 || submitted ? "Cancel" : "Back"}
          leftDisabled={submitting}
          title={
            submitted
              ? "Section submitted"
              : `New section · ${waterway?.name ?? "…"}`
          }
          subtitle={
            submitted
              ? "Pending review"
              : `Step ${step + 1} of ${WIZARD_STEPS.length} · ${WIZARD_STEPS[step]}`
          }
          action={
            <RoundActionButton
              onClick={
                submitted
                  ? backToMap
                  : step < WIZARD_STEPS.length - 1
                    ? () => wizard.setStep(step + 1)
                    : handleSubmit
              }
              disabled={!submitted && (!wizard.canProceed || submitting)}
              ariaLabel={
                submitted
                  ? "Back to map"
                  : step < WIZARD_STEPS.length - 1
                    ? "Next"
                    : "Suggest section"
              }
            >
              {submitting ? (
                <CircularProgress size={20} color="inherit" />
              ) : submitted ? (
                <MapIcon fontSize="small" />
              ) : step < WIZARD_STEPS.length - 1 ? (
                <ArrowForwardIcon fontSize="small" />
              ) : (
                <CheckIcon fontSize="small" />
              )}
            </RoundActionButton>
          }
        />
      </Box>
    </Box>
  );
}
