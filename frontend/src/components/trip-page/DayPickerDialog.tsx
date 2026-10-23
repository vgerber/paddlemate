import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import PanelBottomBar from "@/components/PanelBottomBar";
import type { Trip } from "@/lib/api";
import { useTripTimeline } from "@/lib/hooks/useTrips";
import { runCounts } from "@/lib/tripTimeline";
import DayCalendar from "./DayCalendar";

/**
 * Which day to add to. Only the choice lives here - once it is made the day
 * itself opens in the plan, where the rest of the week is still visible.
 */
export default function DayPickerDialog({
  trip,
  open,
  onSelect,
  onClose,
}: {
  trip: Trip;
  open: boolean;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const { days } = useTripTimeline(trip);
  const runs = useMemo(() => runCounts(days), [days]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent>
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ display: "block", pb: 1 }}
        >
          A dot marks a day that already has something on it. Any day works,
          including before the trip starts.
        </Typography>
        <DayCalendar
          selected={null}
          runs={runs}
          from={trip.start_date}
          to={trip.end_date ?? null}
          onSelect={onSelect}
        />
      </DialogContent>
      <PanelBottomBar
        onLeftClick={onClose}
        leftLabel="Close"
        title="Plan a day"
        subtitle="Pick the day to add to"
        action={null}
      />
    </Dialog>
  );
}
