import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useLayoutEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GaugeReading, WaterRangeWithStatus } from "@/lib/api";
import { useGaugeReadings } from "@/lib/hooks/useWaterways";
import { theme } from "@/lib/theme";
import type { DescentSpan, TimeRange } from "./types";

const { tokens } = theme;

export interface SeriesChartProps {
  range: WaterRangeWithStatus;
  from: string;
  showThresholds?: boolean;
  timeRange: TimeRange;
  /** Own descents drawn as shaded time bands. */
  descentSpans?: DescentSpan[];
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
  descentSpans,
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

  // Clamp descent bands to the visible domain and give very short runs a
  // minimum visual width so they stay visible in long time ranges.
  const visibleSpans = useMemo(() => {
    if (!descentSpans?.length || chartData.length === 0) return [];
    const dataMin = chartData[0].time;
    const dataMax = chartData[chartData.length - 1].time;
    const minWidth = (dataMax - dataMin) * 0.005;
    return descentSpans
      .filter((s) => s.end >= dataMin && s.start <= dataMax)
      .map((s) => {
        let x1 = Math.max(s.start, dataMin);
        let x2 = Math.min(s.end, dataMax);
        if (x2 - x1 < minWidth) {
          const mid = (x1 + x2) / 2;
          x1 = Math.max(mid - minWidth / 2, dataMin);
          x2 = Math.min(mid + minWidth / 2, dataMax);
        }
        return { id: s.id, x1, x2, name: s.name };
      });
  }, [descentSpans, chartData]);

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

  const tickStyle = { fontSize: 11, fill: tokens.outline };

  return (
    <div
      ref={setContainer}
      style={{
        width: "100%",
        height: "100%",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
      }}
    >
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
              <stop
                offset="5%"
                stopColor={tokens.primaryContainer}
                stopOpacity={0.9}
              />
              <stop
                offset="95%"
                stopColor={tokens.primaryContainer}
                stopOpacity={0.55}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={tokens.chartGrid}
            vertical={false}
          />
          {visibleSpans.map((s) => (
            <ReferenceArea
              key={s.id}
              x1={s.x1}
              x2={s.x2}
              fill={tokens.secondary}
              fillOpacity={0.15}
              stroke={tokens.secondary}
              strokeOpacity={0.35}
            />
          ))}
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
            content={({ active, payload, label }) => {
              const value = payload?.[0]?.value;
              if (!active || value == null) return null;
              const ts = label as number;
              const span = visibleSpans.find(
                (s) => ts >= s.x1 && ts <= s.x2 && s.name,
              );
              return (
                <div
                  style={{
                    backgroundColor: tokens.surface,
                    border: `1px solid ${tokens.outlineVariant}`,
                    borderRadius: 6,
                    fontSize: 12,
                    padding: "8px 10px",
                  }}
                >
                  <div style={{ color: tokens.outline, marginBottom: 2 }}>
                    {new Date(ts).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div style={{ color: tokens.onSurface }}>
                    {`${Number(value).toFixed(1)} ${series.unit}`}
                  </div>
                  {span && (
                    <div style={{ color: tokens.secondary, marginTop: 2 }}>
                      {span.name}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={tokens.chartSeries}
            strokeWidth={1.5}
            fill={`url(#fill-${series.id})`}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {showThresholds && range.range_low != null && (
            <ReferenceLine
              y={range.range_low}
              stroke={tokens.secondary}
              strokeDasharray="4 2"
              label={{
                value: `L ${range.range_low}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: tokens.secondary,
              }}
            />
          )}
          {showThresholds && range.range_medium != null && (
            <ReferenceLine
              y={range.range_medium}
              stroke={tokens.tertiary}
              strokeDasharray="4 2"
              label={{
                value: `M ${range.range_medium}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: tokens.tertiary,
              }}
            />
          )}
          {showThresholds && range.range_high != null && (
            <ReferenceLine
              y={range.range_high}
              stroke={tokens.error}
              strokeDasharray="4 2"
              label={{
                value: `H ${range.range_high}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: tokens.error,
              }}
            />
          )}
        </AreaChart>
      )}
    </div>
  );
}
