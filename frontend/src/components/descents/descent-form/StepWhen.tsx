import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { theme } from "@/lib/theme";
import type { StepProps } from "./model";
import PickerField from "./PickerField";

const toggleSx = { minHeight: theme.tokens.touch.min, flex: 1 };

/** Step 1: single/multi day toggle plus date and time fields. */
export default function StepWhen({ form, onChange }: StepProps) {
  const startDate = form.start_time.slice(0, 10);
  const startTime = form.start_time.slice(11, 16);
  const endTime = form.end_time.slice(11, 16);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <ToggleButtonGroup
        exclusive
        value={form.timing_mode}
        onChange={(_, v) => v && onChange({ timing_mode: v })}
        fullWidth
      >
        <ToggleButton value="single" sx={toggleSx}>
          Single day
        </ToggleButton>
        <ToggleButton value="multi" sx={toggleSx}>
          Multi day
        </ToggleButton>
      </ToggleButtonGroup>

      {form.timing_mode === "single" ? (
        <>
          <PickerField
            kind="date"
            label="Date"
            value={startDate}
            onChange={(d) =>
              d &&
              onChange({
                start_time: `${d}T${startTime}`,
                end_time: `${d}T${endTime}`,
              })
            }
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <PickerField
              kind="time"
              label="Start time"
              value={startTime}
              onChange={(t) => onChange({ start_time: `${startDate}T${t}` })}
            />
            <PickerField
              kind="time"
              label="End time"
              value={endTime}
              onChange={(t) => onChange({ end_time: `${startDate}T${t}` })}
            />
          </Box>
        </>
      ) : (
        <>
          <PickerField
            kind="datetime-local"
            label="Start"
            value={form.start_time}
            onChange={(v) => onChange({ start_time: v })}
          />
          <PickerField
            kind="datetime-local"
            label="End"
            value={form.end_time}
            onChange={(v) => onChange({ end_time: v })}
          />
        </>
      )}
    </Box>
  );
}
