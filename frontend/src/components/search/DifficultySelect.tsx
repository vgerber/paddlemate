import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

const OPTIONS = [
  { label: "Any", value: "" },
  { label: "I", value: 1 },
  { label: "II", value: 2 },
  { label: "III", value: 3 },
  { label: "IV", value: 4 },
  { label: "V", value: 5 },
  { label: "VI", value: 6 },
  { label: "X", value: 10 },
];

const GRADE_LABELS = new Map(OPTIONS.map((o) => [o.value, o.label]));

/** What the Grade chip reads: "III-IV", "III" for a single grade, "III+"
 * with only a minimum, "-IV" with only a maximum, empty when nothing is set. */
export function gradeSummary(minDiff: number | "", maxDiff: number | "") {
  const min = GRADE_LABELS.get(minDiff);
  const max = GRADE_LABELS.get(maxDiff);
  if (minDiff !== "" && maxDiff !== "") {
    return minDiff === maxDiff ? min : `${min}-${max}`;
  }
  if (minDiff !== "") return `${min}+`;
  if (maxDiff !== "") return `-${max}`;
  return "";
}

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
