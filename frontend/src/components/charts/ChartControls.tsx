import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  TIME_RANGE_OPTIONS,
  typeLabel,
} from "@/components/charts/water/chartTime";
import type { TimeRange } from "@/components/charts/water/types";
import { theme } from "@/lib/theme";

const toggleGroupSx = {
  flexShrink: 0,
  "& .MuiToggleButton-root": { py: 0.25, px: 1, fontSize: "0.7rem" },
} as const;

interface ChartControlsProps {
  measurementTypes: string[];
  measurementType: string;
  onMeasurementTypeChange: (type: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export default function ChartControls({
  measurementTypes,
  measurementType,
  onMeasurementTypeChange,
  timeRange,
  onTimeRangeChange,
}: ChartControlsProps) {
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <>
      {measurementTypes.length > 1 &&
        (isMobile ? (
          <FormControl size="small" sx={{ flexShrink: 0 }}>
            <Select
              value={measurementType}
              onChange={(e) => onMeasurementTypeChange(e.target.value)}
              sx={{ fontSize: "0.75rem" }}
            >
              {measurementTypes.map((t) => (
                <MenuItem key={t} value={t}>
                  {typeLabel(t)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <ToggleButtonGroup
            value={measurementType}
            exclusive
            size="small"
            onChange={(_, v) => v && onMeasurementTypeChange(v)}
            sx={toggleGroupSx}
          >
            {measurementTypes.map((t) => (
              <ToggleButton key={t} value={t}>
                {typeLabel(t)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ))}
      {isMobile ? (
        <FormControl size="small" sx={{ flexShrink: 0 }}>
          <Select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
            sx={{ fontSize: "0.75rem" }}
          >
            {TIME_RANGE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          size="small"
          onChange={(_, v) => v && onTimeRangeChange(v)}
          sx={toggleGroupSx}
        >
          {TIME_RANGE_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value}>
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    </>
  );
}
