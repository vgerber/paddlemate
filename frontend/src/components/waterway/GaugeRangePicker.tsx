import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import GaugeAttribution from "@/components/GaugeAttribution";
import type { GaugePicker, PickerOption } from "@/lib/hooks/useGaugePicker";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const rangeFieldSx = (color: string) =>
  ({
    flex: 1,
    "& label": { color },
    "& label.Mui-focused": { color },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: color,
    },
  }) as const;

/** Gauge selection + water-level thresholds: an async search over every
 * available gauge (the river's and section's own recommended first, then all
 * providers' catalog stations), a measurement select, and the low/medium/high
 * fields. A catalog station is created and starts fetching when submitted. */
export default function GaugeRangePicker({ picker }: { picker: GaugePicker }) {
  const {
    options,
    selected,
    applySelection,
    setQuery,
    measurementOptions,
    measurement,
    setMeasurement,
    thresholdError,
    attributionSource,
  } = picker;

  const thresholdFields = [
    {
      label: "Low",
      value: picker.rangeLow,
      onChange: picker.setRangeLow,
      color: tokens.waterLow.color,
    },
    {
      label: "Medium",
      value: picker.rangeMedium,
      onChange: picker.setRangeMedium,
      color: tokens.waterMedium.color,
    },
    {
      label: "High",
      value: picker.rangeHigh,
      onChange: picker.setRangeHigh,
      color: tokens.waterHigh.color,
    },
  ];

  return (
    <>
      <Autocomplete<PickerOption>
        options={options}
        value={selected}
        onChange={(_, option) => applySelection(option)}
        onInputChange={(_, value, reason) => {
          if (reason === "input") setQuery(value);
        }}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(a, b) => a.key === b.key}
        filterOptions={(opts) => opts}
        groupBy={(option) => option.group}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.key}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.provider}
                {option.catalog ? " · not yet fetched" : ""}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Gauge"
            size="small"
            placeholder="Search by name…"
          />
        )}
        size="small"
        slotProps={{ popper: { sx: { zIndex: 1500 } } }}
        noOptionsText="No gauges found"
        clearOnBlur={false}
      />

      {selected && (
        <>
          {measurementOptions.length > 1 && (
            <FormControl fullWidth size="small">
              <InputLabel id="measurement-label">Measurement</InputLabel>
              <Select
                labelId="measurement-label"
                label="Measurement"
                value={measurement}
                onChange={(e) => setMeasurement(e.target.value)}
                MenuProps={{ sx: { zIndex: 1500 } }}
              >
                {measurementOptions.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            {thresholdFields.map((field) => (
              <TextField
                key={field.label}
                label={field.label}
                size="small"
                inputMode="decimal"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                sx={rangeFieldSx(field.color)}
              />
            ))}
          </Box>
          {thresholdError ? (
            <Alert severity="warning" sx={{ py: 0.25, fontSize: "0.75rem" }}>
              {thresholdError}
            </Alert>
          ) : (
            selected.catalog && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: -0.5 }}
              >
                New gauge - it starts being fetched once the section is saved.
              </Typography>
            )
          )}
          <GaugeAttribution source={attributionSource} />
        </>
      )}
    </>
  );
}
