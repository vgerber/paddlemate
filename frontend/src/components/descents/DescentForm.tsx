import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateDescent, usePatchDescent } from "@/lib/hooks/useDescents";
import { PANEL_HEIGHT, theme } from "@/lib/theme";
import {
  buildPayload,
  copyFromDescent,
  defaultForm,
  initFromDescent,
  type LogForm,
  makeDraft,
  toDatetimeLocal,
} from "./descent-form/model";
import SectionPickerMap from "./descent-form/SectionPickerMap";
import StepDetails from "./descent-form/StepDetails";
import StepSections from "./descent-form/StepSections";
import StepWhen from "./descent-form/StepWhen";
import { useSectionPicking } from "./descent-form/useSectionPicking";

const { tokens } = theme;

const STEPS = ["When", "Sections", "Details"];

interface Props {
  descent?: Descent;
  /** Seed a new log from somebody else's, keeping their sections and times. */
  copyFrom?: Descent;
  initialSection?: { section: SectionWithFeatures; waterwayId: number };
  initialStartTime?: string;
  initialTripId?: number;
  onSave: (id: number) => void;
  onCancel: () => void;
  /** Wide screen: the steps in a left pane with the map beside them. */
  embedded?: boolean;
}

/**
 * Three-step wizard for creating or editing a descent log. Holds the form
 * state and step navigation; the steps themselves live in descent-form/.
 */
export default function DescentForm({
  descent,
  copyFrom,
  initialSection,
  initialStartTime,
  initialTripId,
  onSave,
  onCancel,
  embedded,
}: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LogForm>(() => {
    if (descent) return initFromDescent(descent);
    if (copyFrom) return copyFromDescent(copyFrom);
    const base = initialStartTime
      ? { ...defaultForm(), start_time: toDatetimeLocal(initialStartTime) }
      : defaultForm();
    const seeded = initialTripId ? { ...base, trip_id: initialTripId } : base;
    if (initialSection) {
      return { ...seeded, sections: [makeDraft(initialSection.section, 1)] };
    }
    return seeded;
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

  const picking = useSectionPicking(
    form,
    patch,
    initialSection?.waterwayId ?? null,
  );

  const isLast = step === STEPS.length - 1;
  const isBusy = createDescent.isPending || patchDescent.isPending;

  const bar = (
    <PanelBottomBar
      onLeftClick={step === 0 ? onCancel : () => setStep((s) => s - 1)}
      leftLabel={step === 0 ? "Cancel" : "Back"}
      leftDisabled={isBusy}
      title={descent ? "Edit descent" : "Log descent"}
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      steps={{ n: step + 1, of: STEPS.length }}
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
  );

  const steps = (
    <>
      {step === 0 && <StepWhen form={form} onChange={patch} />}
      {step === 1 && (
        <StepSections
          form={form}
          onChange={patch}
          picking={picking}
          mapBeside={embedded}
        />
      )}
      {step === 2 && <StepDetails form={form} onChange={patch} />}

      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}
    </>
  );

  // Wide screen: the steps and their bar in a left pane, the map beside it
  // on every step so it never shifts.
  if (embedded) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "400px minmax(0, 1fr)",
          height: PANEL_HEIGHT.md,
          bgcolor: tokens.surfaceLow,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            bgcolor: tokens.surface,
            borderRight: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2 }}>
            {steps}
          </Box>
          {bar}
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, p: 1.5 }}>
          <SectionPickerMap picking={picking} readOnly={step !== 1} fill />
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          maxWidth: 720,
          mx: "auto",
          width: "100%",
          boxSizing: "border-box",
          px: 2,
          py: 3,
          // Clear the fixed bottom bar so the last field stays reachable.
          pb: "calc(88px + env(safe-area-inset-bottom))",
        }}
      >
        {steps}
      </Box>

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
        {bar}
      </Box>
    </Box>
  );
}
