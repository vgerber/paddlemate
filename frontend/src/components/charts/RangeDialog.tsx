import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  dayOf,
  defaultDays,
  rangeError,
  rangeOfDays,
} from "@/components/charts/water/summary";
import type { CustomRange } from "@/components/charts/water/types";
import PickerField from "@/components/descents/descent-form/PickerField";
import { todayIso } from "@/lib/format";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface RangeDialogProps {
  open: boolean;
  /** The range shown now, else the last 30 days are offered. */
  current: CustomRange | null;
  onCancel: () => void;
  onApply: (range: CustomRange) => void;
}

/** From and To for a custom chart range. The error shows as soon as the pair
 * is unusable; Apply then does nothing. */
export default function RangeDialog({
  open,
  current,
  onCancel,
  onApply,
}: RangeDialogProps) {
  const [days, setDays] = useState(() =>
    current
      ? { from: dayOf(current.from), to: dayOf(current.to) }
      : defaultDays(),
  );
  const today = todayIso();
  const problem = rangeError(days.from, days.to, today);
  return (
    <ConfirmDialog
      open={open}
      title="Custom range"
      confirmLabel="Apply"
      onCancel={onCancel}
      onConfirm={() => {
        if (!problem) onApply(rangeOfDays(days.from, days.to));
      }}
    >
      <Box sx={{ display: "flex", gap: 1.5, pt: 1 }}>
        <PickerField
          kind="date"
          label="From"
          value={days.from}
          max={today}
          onChange={(from) => setDays((d) => ({ ...d, from }))}
        />
        <PickerField
          kind="date"
          label="To"
          value={days.to}
          max={today}
          onChange={(to) => setDays((d) => ({ ...d, to }))}
        />
      </Box>
      {problem && (
        <Typography
          role="alert"
          sx={{ mt: 1.5, fontSize: "0.875rem", color: tokens.error }}
        >
          {problem}
        </Typography>
      )}
    </ConfirmDialog>
  );
}
