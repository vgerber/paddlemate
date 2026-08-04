import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
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
import { useChartZoom } from "./useChartZoom";

const { tokens } = theme;

/** Single source of truth for the plot geometry - the zoom hook derives the
 * plot area's pixel bounds from these same numbers. */
const CHART_MARGIN = { top: 6, right: 12, bottom: 4, left: 0 };

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

/** Padded y range for a set of values, or null when there are none. */
function yDomainOf(
  values: number[],
  thresholds: number[],
): { lo: number; hi: number } | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values, ...thresholds);
  const hi = Math.max(...values, ...thresholds);
  const span = hi - lo || 1;
  const margin = span * 0.2;
  return {
    lo: Math.max(lo - margin, lo >= 0 ? 0 : -Infinity),
    hi: hi + margin,
  };
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

  const allValues = useMemo(
    () => chartData.map((d) => d.value).filter((v): v is number => v !== null),
    [chartData],
  );
  const thresholds = useMemo(
    () =>
      [range.range_low, range.range_medium, range.range_high].filter(
        (v): v is number => v != null,
      ),
    [range.range_low, range.range_medium, range.range_high],
  );

  // Axis width from the full data range so the plot geometry (and with it
  // the zoom gesture math) stays stable while zooming.
  const yAxisWidth = useMemo(() => {
    const d = yDomainOf(allValues, thresholds);
    if (!d) return 32;
    const widestLabel = [d.lo, d.hi]
      .map(formatTick)
      .reduce((a, b) => (a.length >= b.length ? a : b));
    // 7px per character at fontSize 11, plus 6px right padding
    return widestLabel.length * 7 + 6;
  }, [allValues, thresholds]);

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

  const extent: [number, number] | null =
    chartData.length >= 2
      ? [chartData[0].time, chartData[chartData.length - 1].time]
      : null;

  const plotLeft = yAxisWidth + CHART_MARGIN.left;
  const { domain, reset } = useChartZoom(container, {
    extent,
    plotLeft,
    plotWidth: Math.max((size?.width ?? 0) - plotLeft - CHART_MARGIN.right, 1),
  });

  // Y window follows the zoom; thresholds only stretch it in the full view.
  const yDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    let d: ReturnType<typeof yDomainOf>;
    if (domain) {
      const visible = chartData
        .filter((p) => p.time >= domain[0] && p.time <= domain[1])
        .map((p) => p.value)
        .filter((v): v is number => v !== null);
      d = yDomainOf(visible.length > 0 ? visible : allValues, []);
    } else {
      d = yDomainOf(allValues, thresholds);
    }
    return d ? [d.lo, d.hi] : ["auto", "auto"];
  }, [chartData, allValues, thresholds, domain]);

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
        position: "relative",
        // Keep one-finger vertical page scrolling; claim pinches for the
        // zoom hook instead of the browser.
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
      }}
    >
      {domain && (
        <IconButton
          size="small"
          aria-label="Reset zoom"
          title="Reset zoom"
          onClick={reset}
          sx={{
            position: "absolute",
            top: 2,
            right: CHART_MARGIN.right + 2,
            zIndex: 2,
            color: "text.secondary",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          <ZoomOutMapIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      {size && (
        <AreaChart
          width={size.width}
          height={size.height}
          data={chartData}
          margin={CHART_MARGIN}
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
              ifOverflow="hidden"
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
            domain={domain ?? ["dataMin", "dataMax"]}
            allowDataOverflow
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
            domain={yDomain}
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
              ifOverflow="hidden"
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
              ifOverflow="hidden"
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
              ifOverflow="hidden"
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
