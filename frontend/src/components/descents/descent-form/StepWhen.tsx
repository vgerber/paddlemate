import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import type { StepProps } from "./model";

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
        size="small"
      >
        <ToggleButton value="single" sx={{ borderRadius: 0 }}>
          Single day
        </ToggleButton>
        <ToggleButton value="multi" sx={{ borderRadius: 0 }}>
          Multi day
        </ToggleButton>
      </ToggleButtonGroup>

      {form.timing_mode === "single" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Date"
            type="date"
            value={startDate}
            onChange={(e) => {
              const d = e.target.value;
              onChange({
                start_time: `${d}T${startTime}`,
                end_time: `${d}T${endTime}`,
              });
            }}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Start time"
              type="time"
              value={startTime}
              onChange={(e) =>
                onChange({ start_time: `${startDate}T${e.target.value}` })
              }
              sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End time"
              type="time"
              value={endTime}
              onChange={(e) =>
                onChange({ end_time: `${startDate}T${e.target.value}` })
              }
              sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => onChange({ start_time: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={form.end_time}
            onChange={(e) => onChange({ end_time: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      )}
    </Box>
  );
}
