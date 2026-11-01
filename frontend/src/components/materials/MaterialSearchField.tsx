import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { CloseIcon, SearchIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The brand-or-model search of the wiki. */
export default function MaterialSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      fullWidth
      hiddenLabel
      placeholder="Brand or model"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        htmlInput: { "aria-label": "Brand or model", maxLength: 100 },
        input: {
          sx: { pr: 0.5, minHeight: 56, "& input": { py: 1.75 } },
          startAdornment: (
            <SearchIcon
              sx={{ mr: 1, color: tokens.onSurfaceVariant }}
              fontSize="small"
            />
          ),
          endAdornment: value ? (
            <IconButton
              aria-label="Clear"
              onClick={() => onChange("")}
              sx={{ width: tokens.touch.min, height: tokens.touch.min }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          ) : undefined,
        },
      }}
    />
  );
}
