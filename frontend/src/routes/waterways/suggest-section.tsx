import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useCanvasScene } from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import FloatingCard from "@/components/canvas/FloatingCard";
import WaterwayMap from "@/components/map/LazyMap";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import SectionFeaturesStep from "@/components/waterway/SectionFeaturesStep";
import SectionLineStep from "@/components/waterway/SectionLineStep";
import SectionNamingForm from "@/components/waterway/SectionNamingForm";
import { buildSectionPayload } from "@/components/waterway/sectionPayload";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import {
  useSectionWizardState,
  WIZARD_STEPS,
} from "@/components/waterway/useSectionWizardState";
import { useSuggestScene } from "@/components/waterway/useSuggestScene";
import SavedMark from "@/components/wizard/SavedMark";
import StepSlide from "@/components/wizard/StepSlide";
import type { SectionWithFeatures } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateSection } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { ConfirmIcon, ForwardIcon, MapIcon } from "@/lib/icons";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const NO_SECTIONS: SectionWithFeatures[] = [];

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
  const sections = waterway?.sections ?? NO_SECTIONS;

  const verb = useMapVerb();
  const wizard = useSectionWizardState(
    waterway?.name ?? "",
    sections,
    waterwayId,
  );
  const { step, putIn, takeOut, finalCoords, featurePickActive } = wizard;

  // Drawn by the canvas host from md; harmless on a phone, which keeps its
  // own map.
  useCanvasScene(useSuggestScene(wizard, sections));

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

  // Desktop: the screen is the card over the canvas map, even for its
  // empty and sign-in states.
  const inCard = (content: ReactNode) =>
    isDesktop ? (
      <CanvasLayout>
        <FloatingCard
          id="suggest"
          side="left"
          kind="side"
          screen="suggest-section"
          title="Suggest section"
          selfHeaded
          fullHeight
        >
          {content}
        </FloatingCard>
      </CanvasLayout>
    ) : (
      content
    );

  if (waterwayId == null) {
    return inCard(
      <Box
        sx={{
          maxWidth: 720,
          mx: "auto",
          px: { xs: `${tokens.phone.line}px`, md: 2 },
          py: 3,
        }}
      >
        <Typography color="textSecondary">No waterway selected.</Typography>
      </Box>,
    );
  }

  if (sessionLoading) {
    return inCard(<LoadingBox size={40} pt={8} />);
  }

  if (!isAuthenticated) {
    return inCard(<SignInGate title="Sign in to suggest a section" />);
  }

  const submittedCard = (
    <SavedMark
      title="Section submitted"
      caption="It appears on the river once an admin approves it."
    />
  );

  const mapNode = step > 0 && (
    <Box
      ref={wizard.mapContainerRef}
      sx={{
        position: "relative",
        height: 380,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        // Mobile has no top bar
        scrollMarginTop: 8,
      }}
    >
      <WaterwayMap
        sections={sections}
        camera={{ onBoundsChange: wizard.setMapBounds }}
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
            ? ([lon, lat]) => wizard.setPutIn({ lat, lon })
            : undefined,
          onPickTakeOut: onSectionStep
            ? ([lon, lat]) => wizard.setTakeOut({ lat, lon })
            : undefined,
        }}
        drawing={{
          sectionPreviewCoords: finalCoords ?? undefined,
          riverHighlightCoords: wizard.snap.river,
          placingFeature: onFeaturesStep && featurePickActive,
          onMapClick:
            onFeaturesStep && featurePickActive
              ? (point) =>
                  wizard.setFeatureVertices((vertices) => [...vertices, point])
              : undefined,
          featureVertices:
            onFeaturesStep && wizard.featureVertices.length > 0
              ? wizard.featureVertices
              : undefined,
          featureGeomType: wizard.featureGeomType,
        }}
      />
    </Box>
  );

  const mapHint = isDesktop && onSectionStep && !submitted && (
    <Typography
      data-testid="map-hint"
      sx={{ fontSize: "0.875rem", color: "text.secondary" }}
    >
      {verb} the map to set where you get on and off the water.
    </Typography>
  );

  const formNode = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
        minWidth: 0,
      }}
    >
      {mapHint}
      <StepSlide step={step}>
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
            finalCoords={finalCoords}
            lookupStalled={wizard.lookupStalled}
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
      </StepSlide>

      {submitError && <Alert severity="error">{submitError}</Alert>}
    </Box>
  );

  const barNode = (
    <PanelBottomBar
      onLeftClick={
        step === 0 || submitted ? backToMap : () => wizard.setStep(step - 1)
      }
      leftLabel={step === 0 || submitted ? "Cancel" : "Back"}
      leftDisabled={submitting}
      title={submitted ? "Section submitted" : "Suggest section"}
      subtitle={
        submitted
          ? "Pending review"
          : `Step ${step + 1} of ${WIZARD_STEPS.length} · ${WIZARD_STEPS[step]}`
      }
      steps={submitted ? undefined : { n: step + 1, of: WIZARD_STEPS.length }}
      action={
        <RoundActionButton
          onClick={
            submitted
              ? backToMap
              : step < WIZARD_STEPS.length - 1
                ? () => wizard.setStep(step + 1)
                : handleSubmit
          }
          disabled={!submitted && !wizard.canProceed}
          busy={submitting}
          ariaLabel={
            submitted
              ? "Back to map"
              : step < WIZARD_STEPS.length - 1
                ? "Next"
                : "Suggest section"
          }
        >
          {submitted ? (
            <MapIcon fontSize="small" />
          ) : step < WIZARD_STEPS.length - 1 ? (
            <ForwardIcon fontSize="small" />
          ) : (
            <ConfirmIcon fontSize="small" />
          )}
        </RoundActionButton>
      }
    />
  );

  // Desktop: the form and its bar in a card over the canvas map, which
  // takes the picking and drawing.
  if (isDesktop) {
    return inCard(
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2 }}>
          <StepSlide step={submitted ? 1 : 0} fadeTo={1}>
            {submitted ? submittedCard : formNode}
          </StepSlide>
        </Box>
        {barNode}
      </Box>,
    );
  }

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        px: { xs: `${tokens.phone.line}px`, md: 2 },
        py: 1.5,
        pb: 12,
      }}
    >
      {/* No header - the bottom bar carries the title, step and cancel. */}
      <StepSlide step={submitted ? 1 : 0} fadeTo={1}>
        {submitted ? (
          submittedCard
        ) : (
          <Box sx={{ display: "grid", gap: 2.5 }}>
            {mapNode}
            {formNode}
          </Box>
        )}
      </StepSlide>

      {/* Pinned to the viewport bottom, above the mobile bottom navigation
          (zIndex 1300). Carries the flow's only action, including the way
          out once the section is submitted. */}
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
        {barNode}
      </Box>
    </Box>
  );
}
