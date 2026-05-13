import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import type { WaterRangeWithStatus, GaugeReading } from "@/lib/api";
import { useGaugeReadings } from "@/lib/hooks/useWaterways";

type TimeRange = "24h" | "7d" | "1m" | "3m" | "6m" | "1y";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
];

function fromForRange(range: TimeRange): string {
  const d = new Date();
  switch (range) {
    case "24h":
      d.setDate(d.getDate() - 1);
      break;
    case "7d":
      d.setDate(d.getDate() - 7);
      break;
    case "1m":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3m":
      d.setMonth(d.getMonth() - 3);
      break;
    case "6m":
      d.setMonth(d.getMonth() - 6);
      break;
    case "1y":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  // Truncate to the minute so the query key is stable within the same minute
  d.setSeconds(0, 0);
  return d.toISOString();
}

interface WaterChartProps {
  range: WaterRangeWithStatus;
  from: string;
}

function SeriesChart({ range, from }: WaterChartProps) {
  const { series, gauge } = range;

  const { data: readings, isLoading } = useGaugeReadings(
    gauge.id,
    series.id,
    from,
    1000,
  );

  const { xData, yData } = useMemo(() => {
    if (!readings) return { xData: [], yData: [] };
    // Readings come newest-first; reverse for chronological order
    const sorted = [...readings].reverse();

    // Detect gaps: if a consecutive interval is > 5× the median interval,
    // insert a null so the line breaks instead of interpolating.
    const rawX = sorted.map((r: GaugeReading) => new Date(r.measured_at));
    const rawY = sorted.map((r: GaugeReading) => r.value);

    if (rawX.length < 2) return { xData: rawX, yData: rawY };

    const intervals = rawX
      .slice(1)
      .map((t, i) => t.getTime() - rawX[i].getTime());
    const sorted_intervals = [...intervals].sort((a, b) => a - b);
    const median = sorted_intervals[Math.floor(sorted_intervals.length / 2)];
    const threshold = median * 5;

    const xOut: Date[] = [rawX[0]];
    const yOut: (number | null)[] = [rawY[0]];
    for (let i = 1; i < rawX.length; i++) {
      if (intervals[i - 1] > threshold) {
        // Insert a null just after the previous point to create a gap
        xOut.push(new Date(rawX[i - 1].getTime() + 1));
        yOut.push(null);
      }
      xOut.push(rawX[i]);
      yOut.push(rawY[i]);
    }

    return { xData: xOut, yData: yOut };
  }, [readings]);

  // Y axis: include all three range thresholds in the extent, then add 1/3 padding
  const { yMin, yMax } = useMemo(() => {
    const values = yData.filter((v) => v !== null) as number[];
    if (values.length === 0) return { yMin: undefined, yMax: undefined };
    const lo = Math.min(...values, range.range_low);
    const hi = Math.max(...values, range.range_high);
    const span = hi - lo || 1;
    return { yMin: lo - span / 3, yMax: hi + span / 3 };
  }, [yData, range.range_low, range.range_high]);

  const unit = series.unit ?? "";
  const label = series.label ?? gauge.name;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (xData.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        No readings available.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        {label} ({unit}) — {gauge.name}
      </Typography>
      <LineChart
        xAxis={[
          {
            data: xData,
            scaleType: "time",
            valueFormatter: (v: Date) =>
              v.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
          },
        ]}
        yAxis={[{ label: unit, min: yMin, max: yMax }]}
        series={[
          {
            data: yData,
            showMark: false,
            color: "#004b5b",
            area: true,
            connectNulls: false,
          },
        ]}
        height={220}
        margin={{ top: 10, right: 16, bottom: 40, left: 56 }}
      >
        <ChartsReferenceLine
          y={range.range_low}
          label={`Low  ${range.range_low}`}
          labelAlign="end"
          lineStyle={{ stroke: "#b0ceb8", strokeDasharray: "4 2" }}
          labelStyle={{ fill: "#b0ceb8", fontSize: 10 }}
        />
        <ChartsReferenceLine
          y={range.range_medium}
          label={`Medium  ${range.range_medium}`}
          labelAlign="end"
          lineStyle={{ stroke: "#c2cf47", strokeDasharray: "4 2" }}
          labelStyle={{ fill: "#c2cf47", fontSize: 10 }}
        />
        <ChartsReferenceLine
          y={range.range_high}
          label={`High  ${range.range_high}`}
          labelAlign="end"
          lineStyle={{ stroke: "#ffb4ab", strokeDasharray: "4 2" }}
          labelStyle={{ fill: "#ffb4ab", fontSize: 10 }}
        />
      </LineChart>
    </Box>
  );
}

interface WaterChartListProps {
  ranges: WaterRangeWithStatus[];
}

/**
 * Renders all water ranges with a shared time-range filter.
 * Each range gets its own chart. Gaps in readings are shown as breaks.
 */
export default function WaterChart({ ranges }: WaterChartListProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const from = useMemo(() => fromForRange(timeRange), [timeRange]);

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}
    >
      {/* Time range selector */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          size="small"
          onChange={(_, v) => v && setTimeRange(v)}
          sx={{
            "& .MuiToggleButton-root": { py: 0.25, px: 1, fontSize: "0.7rem" },
          }}
        >
          {TIME_RANGE_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value}>
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {ranges.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
          No gauge data configured for this section.
        </Typography>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {ranges.map((range) => (
            <SeriesChart key={range.id} range={range} from={from} />
          ))}
        </Box>
      )}
    </Box>
  );
}
