import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { GRADE_OPTIONS as OPTIONS } from "./gradeSummary";

interface DifficultySelectProps {
  minDiff: number | "";
  maxDiff: number | "";
  onMinChange: (value: number | "") => void;
  onMaxChange: (value: number | "") => void;
}

/** Native selects: the phone's own picker, 16px so iOS does not zoom. */
function GradeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (value: number | "") => void;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) =>
        onChange(e.target.value === "" ? "" : Number(e.target.value))
      }
      slotProps={{
        select: { native: true },
        // A native select always shows a value, so the label never rests.
        inputLabel: { shrink: true },
      }}
      sx={{ flex: 1, minWidth: 0 }}
    >
      {OPTIONS.map((o) => (
        <option key={o.label} value={o.value}>
          {o.label}
        </option>
      ))}
    </TextField>
  );
}

export default function DifficultySelect({
  minDiff,
  maxDiff,
  onMinChange,
  onMaxChange,
}: DifficultySelectProps) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <GradeField label="Min grade" value={minDiff} onChange={onMinChange} />
      <GradeField label="Max grade" value={maxDiff} onChange={onMaxChange} />
    </Box>
  );
}
