import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import VisibilityPicker from "@/components/VisibilityPicker";
import FormSection from "@/components/waterway/FormSection";
import type { Trip, TripStayKind } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateTrip, usePatchTrip } from "@/lib/hooks/useTrips";
import { STAY_KINDS } from "./stayKinds";
import {
  buildCreatePayload,
  buildPatchPayload,
  defaultTripForm,
  initFromTrip,
  type TripForm as TripFormState,
  tripFormError,
} from "./trip-form/model";

interface Props {
  trip?: Trip;
  onSave: (id: number) => void;
  onCancel: () => void;
}

/**
 * Create or edit a trip. Creating also takes the first base, since a trip
 * always has somewhere for its watch list to hang off; editing leaves the
 * itinerary to the Bases tab, which is where it keeps moving.
 */
export default function TripForm({ trip, onSave, onCancel }: Props) {
  const [form, setForm] = useState<TripFormState>(() =>
    trip ? initFromTrip(trip) : defaultTripForm(),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const createTrip = useCreateTrip();
  const patchTrip = usePatchTrip(trip?.id ?? 0);
  const isBusy = createTrip.isPending || patchTrip.isPending;
  const problem = tripFormError(form, !trip);

  function patch(update: Partial<TripFormState>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  async function handleSave() {
    setSaveError(null);
    try {
      const result = trip
        ? await patchTrip.mutateAsync(buildPatchPayload(form))
        : await createTrip.mutateAsync(buildCreatePayload(form));
      onSave(result.id);
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Saving failed. Please try again."));
    }
  }

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: 1.5,
          py: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          // Touch targets on a phone, compact rows on a desktop panel.
          "& .MuiInputBase-inputSizeSmall": {
            py: { xs: "12px", md: "8.5px" },
          },
        }}
      >
        <FormSection
          label="Name this trip"
          hint="What the group calls it - shown in everyone's trip list."
        >
          <TextField
            size="small"
            label="Trip name"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <TextField
            size="small"
            label="Description"
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            multiline
            minRows={2}
            fullWidth
          />
        </FormSection>

        <FormSection
          label="When it runs"
          hint="The window the trip covers. Leave the end open if you do not know yet - members set their own dates separately."
        >
          <TextField
            size="small"
            label="Starts"
            type="date"
            value={form.start_date}
            onChange={(e) => patch({ start_date: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            label="Ends (optional)"
            type="date"
            value={form.end_date}
            onChange={(e) => patch({ end_date: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </FormSection>

        {!trip && (
          <FormSection
            label="First base"
            hint='A rough idea is enough - "somewhere in the Oetztal" works while you are still booking. Refine it and add more bases later.'
          >
            <TextField
              select
              label="Kind"
              value={form.stay_kind}
              onChange={(e) =>
                patch({ stay_kind: e.target.value as TripStayKind })
              }
              fullWidth
            >
              {STAY_KINDS.map(({ value, label }) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Name"
              value={form.stay_name}
              onChange={(e) => patch({ stay_name: e.target.value })}
              fullWidth
            />
          </FormSection>
        )}

        <FormSection
          label="Who can see it"
          hint="Members always can. This is about everybody else."
        >
          <VisibilityPicker
            value={{
              type: form.visibility_type,
              groups: form.shared_groups,
              users: form.shared_users,
            }}
            onChange={(p) =>
              patch({
                ...(p.type !== undefined && { visibility_type: p.type }),
                ...(p.groups !== undefined && { shared_groups: p.groups }),
                ...(p.users !== undefined && { shared_users: p.users }),
              })
            }
            privateHint="Only trip members can see it."
          />
          <TextField
            size="small"
            label="Publish after (optional)"
            type="datetime-local"
            value={form.visible_from}
            onChange={(e) => patch({ visible_from: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </FormSection>

        {saveError && <Alert severity="error">{saveError}</Alert>}
      </Box>

      <PanelBottomBar
        leftIcon={<CloseIcon />}
        onLeftClick={onCancel}
        leftLabel="Cancel"
        leftDisabled={isBusy}
        title={trip ? "Edit trip" : "New trip"}
        subtitle={problem ?? (trip ? "Save changes" : "Create the trip")}
        action={
          <RoundActionButton
            onClick={handleSave}
            disabled={isBusy || problem !== null}
            ariaLabel="Save trip"
          >
            {isBusy ? <CircularProgress size={22} /> : <CheckIcon />}
          </RoundActionButton>
        }
      />
    </>
  );
}
