import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import MarkdownField from "@/components/MarkdownField";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import { STAY_KINDS } from "@/components/trips/stayKinds";
import FormSection from "@/components/waterway/FormSection";
import type { TripStay, TripStayCandidate, TripStayKind } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { pointCoords } from "@/lib/geo";
import {
  useCreateTripStay,
  usePatchCandidate,
  usePatchTripStay,
  useProposeCandidate,
} from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";
import StayLocationPicker, { type StayPoint } from "./StayLocationPicker";

interface Props {
  tripId: number;
  stay?: TripStay;
  /** Day to start on, when the base is added from a day on the timeline. */
  presetArrival?: string;
  /** Put the base up for the group instead of adding it. Same form either
   * way - a candidate is a base nobody has agreed to yet. */
  propose?: boolean;
  /** Correct a suggestion somebody already put up. Any member may: it belongs
   * to the trip rather than to whoever typed it first. */
  candidate?: TripStayCandidate;
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

function initForm(
  from?: TripStay | TripStayCandidate,
  presetArrival?: string,
): StayForm {
  const coords = from?.location ? pointCoords(from.location) : null;
  return {
    kind: from?.kind ?? "camp",
    name: from?.name ?? "",
    description: from?.description ?? "",
    point: coords ? { lat: coords[1], lon: coords[0] } : null,
    arrival: from?.arrival ?? presetArrival ?? "",
    departure: from?.departure ?? "",
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
  propose = false,
  candidate,
  open,
  onClose,
}: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [form, setForm] = useState<StayForm>(() =>
    initForm(candidate ?? stay, presetArrival),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const createStay = useCreateTripStay(tripId);
  const patchStay = usePatchTripStay(tripId);

  const proposeCandidate = useProposeCandidate(tripId);
  const patchCandidate = usePatchCandidate(tripId);
  const isBusy =
    createStay.isPending ||
    patchStay.isPending ||
    proposeCandidate.isPending ||
    patchCandidate.isPending;
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
    // A candidate carries its location as GeoJSON where a stay takes lat/lon,
    // so the same form produces two shapes.
    const asCandidate = {
      kind: form.kind,
      name: form.name.trim(),
      description: form.description || null,
      location: form.point
        ? {
            type: "Point" as const,
            coordinates: [form.point.lon, form.point.lat],
          }
        : null,
      arrival: form.arrival || null,
      departure: form.departure || null,
    };

    try {
      if (candidate) {
        await patchCandidate.mutateAsync({
          candidateId: candidate.id,
          body: asCandidate,
        });
      } else if (propose) {
        await proposeCandidate.mutateAsync(asCandidate);
      } else if (stay) await patchStay.mutateAsync({ stayId: stay.id, body });
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
          <MarkdownField
            label="Notes"
            value={form.description}
            onChange={(description) => patch({ description })}
            placeholder="Drying room, price, the booking link - whatever the group needs to decide."
            minRows={3}
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
      <PanelBottomBar
        leftIcon={<CloseIcon />}
        onLeftClick={onClose}
        leftLabel="Close"
        leftDisabled={isBusy}
        title={
          candidate
            ? "Edit the suggestion"
            : propose
              ? "Propose a base"
              : stay
                ? "Edit base"
                : "Add a base"
        }
        subtitle={
          problem ??
          (candidate
            ? "Its votes stay as they are"
            : propose
              ? "The group votes on it"
              : stay
                ? "Save changes"
                : "Add the base")
        }
        action={
          <RoundActionButton
            onClick={handleSave}
            disabled={isBusy || problem !== null}
            ariaLabel="Save base"
          >
            {isBusy ? <CircularProgress size={22} /> : <CheckIcon />}
          </RoundActionButton>
        }
      />
    </Dialog>
  );
}
