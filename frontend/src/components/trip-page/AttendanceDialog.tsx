import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import FormSection from "@/components/waterway/FormSection";
import type { TripMember } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { clockTime } from "@/lib/format";
import { usePatchTripMember } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";

interface Props {
  tripId: number;
  member: TripMember;
  /** Day to fill in, when the dialog was opened from a day on the timeline. */
  preset?: { arrival?: string; departure?: string };
  open: boolean;
  onClose: () => void;
}

/**
 * The days you can personally make. Separate from a base's dates, and settled
 * long before the itinerary is - so it is edited from wherever you happen to
 * notice it, the members list or the day timeline.
 */
export default function AttendanceDialog({
  tripId,
  member,
  preset,
  open,
  onClose,
}: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [arrival, setArrival] = useState(
    preset?.arrival ?? member.arrival ?? "",
  );
  const [arrivalTime, setArrivalTime] = useState(
    clockTime(member.arrival_time ?? ""),
  );
  const [departure, setDeparture] = useState(
    preset?.departure ?? member.departure ?? "",
  );
  const [departureTime, setDepartureTime] = useState(
    clockTime(member.departure_time ?? ""),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const patchMember = usePatchTripMember(tripId);

  const problem = (() => {
    if (arrivalTime && !arrival) return "Set the day you arrive first.";
    if (departureTime && !departure) return "Set the day you leave first.";
    if (arrival && departure && departure < arrival) return "Before you arrive";
    if (
      arrival &&
      arrival === departure &&
      arrivalTime &&
      departureTime &&
      departureTime < arrivalTime
    ) {
      return "You leave before you arrive";
    }
    return null;
  })();
  const invalid = problem !== null;

  async function handleSave() {
    setSaveError(null);
    try {
      await patchMember.mutateAsync({
        userId: member.user_id,
        body: {
          arrival: arrival || null,
          arrival_time: arrivalTime || null,
          departure: departure || null,
          departure_time: departureTime || null,
        },
      });
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
      maxWidth="xs"
      fullScreen={fullScreen}
    >
      <DialogTitle>Your dates</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}
      >
        <FormSection
          label="Arriving"
          hint="Say when you get there. The day usually lands before the hour, so fill in whichever you know."
        >
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="You arrive"
              type="date"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Around"
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              size="small"
              sx={{ width: 150, flexShrink: 0 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </FormSection>

        <FormSection
          label="Leaving"
          hint="Optional, and independent of the above - plenty of people know when they arrive long before they know when they can get away."
        >
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="You leave"
              type="date"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              size="small"
              fullWidth
              error={invalid}
              helperText={problem ?? undefined}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Around"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              size="small"
              sx={{ width: 150, flexShrink: 0 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </FormSection>

        {saveError && <Alert severity="error">{saveError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={patchMember.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleSave}
          disabled={invalid || patchMember.isPending}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
