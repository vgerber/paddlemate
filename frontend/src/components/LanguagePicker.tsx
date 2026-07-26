import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { useLanguage } from "@/lib/languagePreference";
import {
  type LanguageOption,
  languageOption,
  languageOptions,
} from "@/lib/languages";

interface LanguagePickerProps {
  value: string;
  onChange: (code: string) => void;
  /** Languages already in use elsewhere; `value` is never hidden. */
  exclude?: readonly string[];
  label?: string;
  size?: "small" | "medium";
  /** Lift the dropdown above the map overlays. */
  overlay?: boolean;
}

const filterOptions = createFilterOptions<LanguageOption>({
  stringify: (option) => option.search,
});

/** Language chooser over the full ISO 639-1 set, searchable by the language's
 * own name, its name in the user's language, or its code. */
export default function LanguagePicker({
  value,
  onChange,
  exclude,
  label = "Language",
  size = "medium",
  overlay,
}: LanguagePickerProps) {
  const displayLanguage = useLanguage();

  const options = useMemo(() => {
    const hidden = new Set(exclude ?? []);
    return languageOptions(displayLanguage).filter(
      (option) => option.code === value || !hidden.has(option.code),
    );
  }, [displayLanguage, exclude, value]);

  // A stored code outside the list still has to render, so fall back to a
  // one-off option rather than showing an empty field.
  const selected = useMemo(
    () =>
      options.find((option) => option.code === value) ??
      languageOption(value, displayLanguage),
    [options, value, displayLanguage],
  );

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, option) => option && onChange(option.code)}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      filterOptions={filterOptions}
      groupBy={(option) => (option.suggested ? "Suggested" : "All languages")}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.code}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {option.native}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.code}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} size={size} />
      )}
      size={size}
      disableClearable
      autoHighlight
      slotProps={overlay ? { popper: { sx: { zIndex: 1500 } } } : undefined}
      sx={{ minWidth: 170 }}
    />
  );
}
