import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useLayoutEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GaugeReading, WaterRangeWithStatus } from "@/lib/api";
import { useGaugeReadings } from "@/lib/hooks/useWaterways";
import type { TimeRange } from "./types";

export interface SeriesChartProps {
  range: WaterRangeWithStatus;
  from: string;
  showThresholds?: boolean;
  timeRange: TimeRange;
}

function formatTick(v: number): string {
  return Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(1)}k`
    : String(Math.round(v));
}

export default function SeriesChart({
  range,
  from,
  showThresholds = true,
  timeRange,
}: SeriesChartProps) {
  const { series, gauge } = range;

  const { data: readings, isLoading } = useGaugeReadings(
    gauge.id,
    series.id,
    from,
    1000,
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    const sorted = [...readings].reverse();

    const rawX = sorted.map((r: GaugeReading) =>
      new Date(r.measured_at).getTime(),
    );
    const rawY = sorted.map((r: GaugeReading) => r.value);

    if (rawX.length < 2)
      return rawX.map((t, i) => ({ time: t, value: rawY[i] }));

    const intervals = rawX.slice(1).map((t, i) => t - rawX[i]);
    const sorted_intervals = [...intervals].sort((a, b) => a - b);
    const median = sorted_intervals[Math.floor(sorted_intervals.length / 2)];
    const gapThreshold = median * 5;

    const out: { time: number; value: number | null }[] = [
      { time: rawX[0], value: rawY[0] },
    ];
    for (let i = 1; i < rawX.length; i++) {
      if (intervals[i - 1] > gapThreshold) {
        out.push({ time: rawX[i - 1] + 1, value: null });
      }
      out.push({ time: rawX[i], value: rawY[i] });
    }
    return out;
  }, [readings]);

  const { yMin, yMax, yAxisWidth } = useMemo(() => {
    const values = chartData
      .map((d) => d.value)
      .filter((v): v is number => v !== null);
    if (values.length === 0)
      return { yMin: undefined, yMax: undefined, yAxisWidth: 32 };

    const thresholds = [
      range.range_low,
      range.range_medium,
      range.range_high,
    ].filter((v): v is number => v != null);

    const lo = Math.min(...values, ...thresholds);
    const hi = Math.max(...values, ...thresholds);
    const span = hi - lo || 1;
    const margin = span * 0.2;
    const yMinVal = Math.max(lo - margin, lo >= 0 ? 0 : -Infinity);
    const yMaxVal = hi + margin;

    const widestLabel = [yMinVal, yMaxVal]
      .map(formatTick)
      .reduce((a, b) => (a.length >= b.length ? a : b));
    // 7px per character at fontSize 11, plus 6px right padding
    const yAxisWidth = widestLabel.length * 7 + 6;

    return { yMin: yMinVal, yMax: yMaxVal, yAxisWidth };
  }, [chartData, range.range_low, range.range_medium, range.range_high]);

  // Measure container explicitly and pass width/height directly to AreaChart,
  // bypassing ResponsiveContainer's -1/-1 initial state which causes console warnings.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!container) return;
    const read = () => {
      const { offsetWidth: w, offsetHeight: h } = container;
      if (w > 0 && h > 0) setSize({ width: w, height: h });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (chartData.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          No readings available.
        </Typography>
      </Box>
    );
  }

  const tickStyle = { fontSize: 11, fill: "#8a9295" };

  return (
    <div ref={setContainer} style={{ width: "100%", height: "100%", WebkitTapHighlightColor: "transparent", outline: "none" }}>
      {size && (
        <AreaChart
          width={size.width}
          height={size.height}
          data={chartData}
          margin={{ top: 6, right: 12, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient
              id={`fill-${series.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor="#004b5b" stopOpacity={0.9} />
              <stop offset="95%" stopColor="#004b5b" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => {
              const d = new Date(ts);
              if (timeRange === "24h") {
                return d.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }
              return d.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
            }}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            domain={[yMin ?? "auto", yMax ?? "auto"]}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickCount={5}
            tickFormatter={formatTick}
          />
          <Tooltip
            labelFormatter={(ts) =>
              new Date(ts as number).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            formatter={(value) => [
              value != null ? `${Number(value).toFixed(1)} ${series.unit}` : "",
              series.label ?? gauge.name,
            ]}
            contentStyle={{
              backgroundColor: "#1e2124",
              border: "1px solid #2e3236",
              borderRadius: 6,
              fontSize: 12,
            }}
            itemStyle={{ color: "#e2e2e5" }}
            labelStyle={{ color: "#8a9295", marginBottom: 2 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#1a8ca0"
            strokeWidth={1.5}
            fill={`url(#fill-${series.id})`}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {showThresholds && range.range_low != null && (
            <ReferenceLine
              y={range.range_low}
              stroke="#b0ceb8"
              strokeDasharray="4 2"
              label={{
                value: `L ${range.range_low}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#b0ceb8",
              }}
            />
          )}
          {showThresholds && range.range_medium != null && (
            <ReferenceLine
              y={range.range_medium}
              stroke="#c2cf47"
              strokeDasharray="4 2"
              label={{
                value: `M ${range.range_medium}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#c2cf47",
              }}
            />
          )}
          {showThresholds && range.range_high != null && (
            <ReferenceLine
              y={range.range_high}
              stroke="#ffb4ab"
              strokeDasharray="4 2"
              label={{
                value: `H ${range.range_high}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#ffb4ab",
              }}
            />
          )}
        </AreaChart>
      )}
    </div>
  );
}
