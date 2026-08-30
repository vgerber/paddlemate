import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import { fromForRange, TIME_RANGE_OPTIONS, typeLabel } from "./chartTime";
import SeriesChart from "./SeriesChart";
import type { DescentSpan, TimeRange } from "./types";

export interface WaterChartProps {
  ranges: WaterRangeWithStatus[];
  showThresholds?: boolean;
  /** Controlled time range - when provided the time-range toggle is hidden. */
  timeRange?: TimeRange;
  onTimeRangeChange?: (v: TimeRange) => void;
  /** Controlled measurement type - when provided the type toggle is hidden. */
  measurementType?: string | null;
  onMeasurementTypeChange?: (v: string) => void;
  /** Own descents drawn as shaded time bands in each series chart. */
  descentSpans?: DescentSpan[];
  /** Feature whose water ranges are brought to the front; the default
   * thresholds dim while it is set. */
  selectedFeatureId?: number | null;
  /** Feature whose ranges act as each chart's default thresholds (usually
   * the section-spanning whitewater feature). Without it, the first
   * calibrated range of a series wins - an arbitrary pick. */
  preferredFeatureId?: number | null;
  /** Name and type of that feature, shown as a chart caption. */
  selectedFeature?: { name: string; type: string } | null;
}

export default function WaterChart({
  ranges,
  showThresholds = true,
  timeRange: controlledTimeRange,
  onTimeRangeChange,
  measurementType: controlledMeasurementType,
  onMeasurementTypeChange,
  descentSpans,
  selectedFeatureId,
  preferredFeatureId,
  selectedFeature,
}: WaterChartProps) {
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>("7d");
  const timeRange = controlledTimeRange ?? internalTimeRange;
  const setTimeRange = onTimeRangeChange ?? setInternalTimeRange;
  const from = useMemo(() => fromForRange(timeRange), [timeRange]);

  const measurementTypes = useMemo(() => {
    const types = new Set(ranges.map((r) => r.series.measurement_type));
    return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
  }, [ranges]);

  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Prefer controlled value, then internal selection, then auto-select the
  // first calibrated type (one with threshold values), then the first type.
  const activeType = useMemo(() => {
    if (
      controlledMeasurementType != null &&
      (measurementTypes as string[]).includes(controlledMeasurementType)
    )
      return controlledMeasurementType;
    if (selectedType && (measurementTypes as string[]).includes(selectedType))
      return selectedType;
    const calibrated = ranges.find(
      (r) =>
        r.range_low != null || r.range_medium != null || r.range_high != null,
    );
    return calibrated?.series.measurement_type ?? measurementTypes[0] ?? null;
  }, [controlledMeasurementType, selectedType, measurementTypes, ranges]);

  const handleTypeChange = onMeasurementTypeChange ?? setSelectedType;

  const visibleRanges = useMemo(
    () =>
      activeType
        ? ranges.filter((r) => r.series.measurement_type === activeType)
        : ranges,
    [ranges, activeType],
  );

  // One chart per gauge series, not per feature range - sections with many
  // features would otherwise stack charts until unreadable. Each chart shows
  // its series' default (first calibrated) range; the selected feature's
  // range is passed alongside so it can be brought to the front.
  const seriesGroups = useMemo(() => {
    const bySeries = new Map<number, WaterRangeWithStatus[]>();
    for (const r of visibleRanges) {
      const group = bySeries.get(r.series.id);
      if (group) group.push(r);
      else bySeries.set(r.series.id, [r]);
    }
    const isCalibrated = (r: WaterRangeWithStatus) =>
      r.range_low != null || r.range_medium != null || r.range_high != null;
    return [...bySeries.values()].map((group) => ({
      primary:
        (preferredFeatureId != null
          ? group.find(
              (r) => r.feature_id === preferredFeatureId && isCalibrated(r),
            )
          : undefined) ??
        group.find(isCalibrated) ??
        group[0],
      group,
    }));
  }, [visibleRanges, preferredFeatureId]);

  const showInternalControls =
    onTimeRangeChange == null ||
    (onMeasurementTypeChange == null && measurementTypes.length > 1);

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}
    >
      {showInternalControls && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            flexShrink: 0,
            gap: 0.5,
          }}
        >
          {onMeasurementTypeChange == null && measurementTypes.length > 1 && (
            <>
              <ToggleButtonGroup
                value={activeType}
                exclusive
                size="small"
                onChange={(_, v) => v && handleTypeChange(v)}
                sx={{
                  "& .MuiToggleButton-root": {
                    py: 0.25,
                    px: 1,
                    fontSize: "0.75rem",
                  },
                }}
              >
                {measurementTypes.map((t) => (
                  <ToggleButton key={t} value={t}>
                    {typeLabel(t)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {onTimeRangeChange == null && (
                <Box
                  sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.5 }}
                />
              )}
            </>
          )}
          {onTimeRangeChange == null && (
            <ToggleButtonGroup
              value={timeRange}
              exclusive
              size="small"
              onChange={(_, v) => v && setTimeRange(v)}
              sx={{
                "& .MuiToggleButton-root": {
                  py: 0.25,
                  px: 1,
                  fontSize: "0.75rem",
                },
              }}
            >
              {TIME_RANGE_OPTIONS.map((o) => (
                <ToggleButton key={o.value} value={o.value}>
                  {o.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        </Box>
      )}

      {visibleRanges.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
          No gauge data configured for this section.
        </Typography>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {seriesGroups.map(({ primary, group }) => (
            <Box
              // timeRange in the key remounts the chart, dropping its zoom
              // window - a new time axis is a new chart.
              key={`${primary.series.id}-${timeRange}`}
              sx={{ flex: 1, minHeight: 0, position: "relative" }}
            >
              <Box sx={{ position: "absolute", inset: 0 }}>
                <SeriesChart
                  range={primary}
                  selectedRange={
                    selectedFeatureId != null
                      ? (group.find(
                          (r) => r.feature_id === selectedFeatureId,
                        ) ?? null)
                      : null
                  }
                  selectedFeature={selectedFeature}
                  from={from}
                  showThresholds={showThresholds}
                  timeRange={timeRange}
                  descentSpans={descentSpans}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
