import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateDescent, usePatchDescent } from "@/lib/hooks/useDescents";
import {
  buildPayload,
  defaultForm,
  initFromDescent,
  type LogForm,
  makeDraft,
  toDatetimeLocal,
} from "./descent-form/model";
import StepDetails from "./descent-form/StepDetails";
import StepSections from "./descent-form/StepSections";
import StepWhen from "./descent-form/StepWhen";

const STEPS = ["When", "Sections", "Details"];

interface Props {
  descent?: Descent;
  initialSection?: { section: SectionWithFeatures; waterwayId: number };
  initialStartTime?: string;
  onSave: (id: number) => void;
  onCancel: () => void;
}

/**
 * Three-step wizard for creating or editing a descent log. Holds the form
 * state and step navigation; the steps themselves live in descent-form/.
 */
export default function DescentForm({
  descent,
  initialSection,
  initialStartTime,
  onSave,
  onCancel,
}: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LogForm>(() => {
    if (descent) return initFromDescent(descent);
    const base = initialStartTime
      ? { ...defaultForm(), start_time: toDatetimeLocal(initialStartTime) }
      : defaultForm();
    if (initialSection) {
      return { ...base, sections: [makeDraft(initialSection.section, 1)] };
    }
    return base;
  });

  const createDescent = useCreateDescent();
  const patchDescent = usePatchDescent();
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaveError(null);
    try {
      const payload = buildPayload(form);
      const result = descent
        ? await patchDescent.mutateAsync({ id: descent.id, body: payload })
        : await createDescent.mutateAsync(payload);
      onSave(result.id);
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Saving failed. Please try again."));
    }
  }

  function patch(update: Partial<LogForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  const isLast = step === STEPS.length - 1;
  const isBusy = createDescent.isPending || patchDescent.isPending;

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        px: 2,
        py: 3,
        // Clear the fixed bottom bar so the last field stays reachable.
        pb: "calc(88px + env(safe-area-inset-bottom))",
      }}
    >
      {step === 0 && <StepWhen form={form} onChange={patch} />}
      {step === 1 && (
        <StepSections
          form={form}
          onChange={patch}
          initialWaterwayId={initialSection?.waterwayId}
        />
      )}
      {step === 2 && <StepDetails form={form} onChange={patch} />}

      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}

      {/* Bottom bar - pinned to the viewport bottom, above the mobile
          bottom navigation (zIndex 1300); same pattern as the section and
          feature wizards. */}
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
          onLeftClick={step === 0 ? onCancel : () => setStep((s) => s - 1)}
          leftLabel={step === 0 ? "Cancel" : "Back"}
          leftDisabled={isBusy}
          title={descent ? "Edit descent" : "Log descent"}
          subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          action={
            <RoundActionButton
              onClick={isLast ? handleSave : () => setStep((s) => s + 1)}
              disabled={isBusy}
              ariaLabel={isLast ? "Save" : "Next"}
            >
              {isBusy ? (
                <CircularProgress size={20} color="inherit" />
              ) : isLast ? (
                <CheckIcon fontSize="small" />
              ) : (
                <ArrowForwardIcon fontSize="small" />
              )}
            </RoundActionButton>
          }
        />
      </Box>
    </Box>
  );
}
