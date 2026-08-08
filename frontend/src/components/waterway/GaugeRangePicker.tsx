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
import { humanize } from "@/lib/format";
import type { GaugePicker } from "@/lib/hooks/useGaugePicker";
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

/** Gauge selection + water-level thresholds: an async search over the full
 * gauge collection (the section's own gauges grouped first), a series select
 * for multi-series gauges, and the low/medium/high fields. */
export default function GaugeRangePicker({ picker }: { picker: GaugePicker }) {
  const {
    gaugeOptions,
    sectionGaugeIds,
    selectedGauge,
    applyGaugeSelection,
    seriesId,
    setSeriesId,
    selectedSeries,
    setGaugeQuery,
    thresholdError,
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
      <Autocomplete
        options={gaugeOptions}
        value={selectedGauge}
        onChange={(_, gauge) => applyGaugeSelection(gauge)}
        onInputChange={(_, value, reason) => {
          if (reason === "input") setGaugeQuery(value);
        }}
        getOptionLabel={(gauge) => gauge.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={(options) => options}
        groupBy={
          sectionGaugeIds.size > 0
            ? (gauge) =>
                sectionGaugeIds.has(gauge.id) ? "On this section" : "All gauges"
            : undefined
        }
        renderOption={(props, gauge) => (
          <Box component="li" {...props} key={gauge.id}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {gauge.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {gauge.provider}
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

      {selectedGauge && (
        <>
          {selectedGauge.series.length > 1 && (
            <FormControl fullWidth size="small">
              <InputLabel id="series-label">Gauge series</InputLabel>
              <Select
                labelId="series-label"
                label="Gauge series"
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value as number | "")}
                MenuProps={{ sx: { zIndex: 1500 } }}
              >
                {selectedGauge.series.map((series) => (
                  <MenuItem key={series.id} value={series.id}>
                    {series.label ?? humanize(series.measurement_type)}
                    {` (${series.unit})`}
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
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: -0.5 }}
            >
              {selectedSeries?.label ?? selectedGauge.name}
              {selectedSeries?.unit ? ` · ${selectedSeries.unit}` : ""}
            </Typography>
          )}
          <GaugeAttribution source={selectedGauge.source} />
        </>
      )}
    </>
  );
}
