import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import { fromForRange } from "./chartTime";
import SeriesChart from "./SeriesChart";
import { activeMeasurementType, seriesGroups } from "./series";
import type { DescentSpan, TimeRange } from "./types";

export interface WaterChartProps {
  ranges: WaterRangeWithStatus[];
  showThresholds?: boolean;
  timeRange: TimeRange;
  measurementType?: string | null;
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
  /** Room kept above the plot for text laid over it, in px. */
  headroom?: number;
}

/** One chart per gauge series of the charted measurement. The controls
 * (reading and period) live in the chart card. */
export default function WaterChart({
  ranges,
  showThresholds = true,
  timeRange,
  measurementType,
  descentSpans,
  selectedFeatureId,
  preferredFeatureId,
  selectedFeature,
  headroom,
}: WaterChartProps) {
  const from = useMemo(() => fromForRange(timeRange), [timeRange]);
  const activeType = activeMeasurementType(ranges, measurementType);

  // One chart per gauge series, not per feature range - sections with many
  // features would otherwise stack charts until unreadable. Each chart shows
  // its series' default (first calibrated) range; the selected feature's
  // range is passed alongside so it can be brought to the front.
  const groups = useMemo(
    () => seriesGroups(ranges, activeType, preferredFeatureId),
    [ranges, activeType, preferredFeatureId],
  );

  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No gauge data configured for this section.
      </Typography>
    );
  }

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}
    >
      {groups.map(({ primary, group }) => (
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
                  ? (group.find((r) => r.feature_id === selectedFeatureId) ??
                    null)
                  : null
              }
              selectedFeature={selectedFeature}
              from={from}
              showThresholds={showThresholds}
              descentSpans={descentSpans}
              headroom={headroom}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
