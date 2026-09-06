import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import { STAY_KINDS } from "@/components/trips/stayKinds";
import FormSection from "@/components/waterway/FormSection";
import type { TripStay, TripStayKind } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { pointCoords } from "@/lib/geo";
import { useCreateTripStay, usePatchTripStay } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";
import StayLocationPicker, { type StayPoint } from "./StayLocationPicker";

interface Props {
  tripId: number;
  stay?: TripStay;
  /** Day to start on, when the base is added from a day on the timeline. */
  presetArrival?: string;
  open: boolean;
  onClose: () => void;
}

interface StayForm {
  kind: TripStayKind;
  name: string;
  description: string;
  point: StayPoint | null;
  arrival: string;
  departure: string;
}

function initForm(stay?: TripStay, presetArrival?: string): StayForm {
  const coords = stay?.location ? pointCoords(stay.location) : null;
  return {
    kind: stay?.kind ?? "camp",
    name: stay?.name ?? "",
    description: stay?.description ?? "",
    point: coords ? { lat: coords[1], lon: coords[0] } : null,
    arrival: stay?.arrival ?? presetArrival ?? "",
    departure: stay?.departure ?? "",
  };
}

function formError(form: StayForm): string | null {
  if (!form.name.trim()) return "A base needs a name.";
  if (form.departure && form.arrival && form.departure < form.arrival) {
    return "Departure cannot be before arrival.";
  }
  return null;
}

/**
 * Add or edit a base. Only kind and name are needed, so a placeholder can be
 * planned against while booking is open and refined once it is settled.
 */
export default function StayDialog({
  tripId,
  stay,
  presetArrival,
  open,
  onClose,
}: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [form, setForm] = useState<StayForm>(() =>
    initForm(stay, presetArrival),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const createStay = useCreateTripStay(tripId);
  const patchStay = usePatchTripStay(tripId);

  const isBusy = createStay.isPending || patchStay.isPending;
  const problem = formError(form);

  function patch(update: Partial<StayForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  async function handleSave() {
    setSaveError(null);
    const body = {
      kind: form.kind,
      name: form.name.trim(),
      description: form.description || null,
      lat: form.point?.lat ?? null,
      lon: form.point?.lon ?? null,
      arrival: form.arrival || null,
      departure: form.departure || null,
    };
    try {
      if (stay) await patchStay.mutateAsync({ stayId: stay.id, body });
      else await createStay.mutateAsync(body);
      onClose();
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Saving failed. Please try again."));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>{stay ? "Edit base" : "Add a base"}</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}
      >
        <FormSection
          label="Where you are based"
          hint="A rough name is enough while you are still booking."
        >
          <TextField
            select
            label="Kind"
            value={form.kind}
            onChange={(e) => patch({ kind: e.target.value as TripStayKind })}
            fullWidth
          >
            {STAY_KINDS.map(({ value, label }) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            fullWidth
            autoFocus
          />
          <TextField
            label="Notes"
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            multiline
            minRows={2}
            fullWidth
          />
        </FormSection>

        <FormSection
          label="Dates"
          hint="When the group is based here. Optional while the plan moves."
        >
          <TextField
            label="Arrives"
            type="date"
            value={form.arrival}
            onChange={(e) => patch({ arrival: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Leaves"
            type="date"
            value={form.departure}
            onChange={(e) => patch({ departure: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </FormSection>

        <FormSection
          label="Where it is"
          hint="Optional. Placing it shows what water is within reach."
        >
          <StayLocationPicker
            tripId={tripId}
            point={form.point}
            onChange={(point) => patch({ point })}
          />
        </FormSection>

        {saveError && <Alert severity="error">{saveError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleSave}
          disabled={isBusy || problem !== null}
        >
          {problem ?? (stay ? "Save" : "Add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
