import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { JSX } from "react";
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
import { humanize } from "@/lib/format";
import { useGaugeReadings } from "@/lib/hooks/useGauges";
import { fonts, theme } from "@/lib/theme";
import type { DescentSpan, TimeRange } from "./types";
import { useChartZoom } from "./useChartZoom";

const { tokens } = theme;

/** Single source of truth for the plot geometry - the zoom hook derives the
 * plot area's pixel bounds from these same numbers. */
const CHART_MARGIN = { top: 6, right: 12, bottom: 4, left: 0 };

export interface SeriesChartProps {
  range: WaterRangeWithStatus;
  /** Range of the feature selected in the timeline. While set (and not the
   * default range itself), the default thresholds dim and these render on
   * top. */
  selectedRange?: WaterRangeWithStatus | null;
  /** Name and type of the selected feature, shown as a chart caption. */
  selectedFeature?: { name: string; type: string } | null;
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

/** Padded y range for a set of values (falling back to the thresholds alone
 * when there are no values, so an empty chart still frames its calibration),
 * or null when there is nothing at all. */
function yDomainOf(
  values: number[],
  thresholds: number[],
): { lo: number; hi: number } | null {
  const all = values.length > 0 ? [...values, ...thresholds] : thresholds;
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const margin = span * 0.2;
  return {
    lo: Math.max(lo - margin, lo >= 0 ? 0 : -Infinity),
    hi: hi + margin,
  };
}

/** Threshold reference lines for one range. Returned as an element array
 * because recharts only recognizes direct children. */
function thresholdLines(
  r: WaterRangeWithStatus,
  opacity: number,
  keyPrefix: string,
) {
  const line = (key: string, y: number, color: string, labelText: string) => (
    <ReferenceLine
      key={`${keyPrefix}-${key}`}
      y={y}
      ifOverflow="hidden"
      stroke={color}
      strokeOpacity={opacity}
      strokeDasharray="4 2"
      label={{
        value: labelText,
        position: "insideTopRight",
        fontSize: 10,
        fill: color,
        opacity,
      }}
    />
  );
  return [
    r.range_low != null &&
      line("low", r.range_low, tokens.secondary, `L ${r.range_low}`),
    r.range_medium != null &&
      line("medium", r.range_medium, tokens.tertiary, `M ${r.range_medium}`),
    r.range_high != null &&
      line("high", r.range_high, tokens.error, `H ${r.range_high}`),
  ].filter((l): l is JSX.Element => l !== false);
}

export default function SeriesChart({
  range,
  selectedRange,
  selectedFeature,
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
  // The time axis spans the SELECTED range up to the present, not the data
  // extent - a silent gauge shows a visible gap instead of the axis quietly
  // ending at the last reading, and short data doesn't shrink a 3m view
  // down to a week.
  const extent = useMemo<[number, number]>(() => {
    const lastReading = chartData[chartData.length - 1]?.time ?? 0;
    return [new Date(from).getTime(), Math.max(Date.now(), lastReading)];
  }, [chartData, from]);

  const visibleSpans = useMemo(() => {
    if (!descentSpans?.length) return [];
    const [axisMin, axisMax] = extent;
    const minWidth = (axisMax - axisMin) * 0.005;
    return descentSpans
      .filter((s) => s.end >= axisMin && s.start <= axisMax)
      .map((s) => {
        let x1 = Math.max(s.start, axisMin);
        let x2 = Math.min(s.end, axisMax);
        if (x2 - x1 < minWidth) {
          const mid = (x1 + x2) / 2;
          x1 = Math.max(mid - minWidth / 2, axisMin);
          x2 = Math.min(mid + minWidth / 2, axisMax);
        }
        return { id: s.id, x1, x2, name: s.name };
      });
  }, [descentSpans, extent]);

  const allValues = useMemo(
    () => chartData.map((d) => d.value).filter((v): v is number => v !== null),
    [chartData],
  );
  // The selected feature's range drives the y window so its thresholds are
  // always clearly in view; otherwise the default range does.
  const displayRange = selectedRange ?? range;
  const hasSelectedRange = selectedRange != null;
  // No dimming when the selected feature owns the default range itself.
  const dimDefault = selectedRange != null && selectedRange.id !== range.id;
  const thresholds = useMemo(
    () =>
      [
        displayRange.range_low,
        displayRange.range_medium,
        displayRange.range_high,
      ].filter((v): v is number => v != null),
    [
      displayRange.range_low,
      displayRange.range_medium,
      displayRange.range_high,
    ],
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

  const plotLeft = yAxisWidth + CHART_MARGIN.left;
  const { domain, reset } = useChartZoom(container, {
    extent,
    plotLeft,
    plotWidth: Math.max((size?.width ?? 0) - plotLeft - CHART_MARGIN.right, 1),
  });

  // Zooming only narrows the time axis; the y window stays fixed on the
  // full data range so values remain comparable while panning.
  const yDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    const d = yDomainOf(allValues, thresholds);
    return d ? [d.lo, d.hi] : ["auto", "auto"];
  }, [allValues, thresholds]);

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
      {chartData.length === 0 && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            No readings in this time range.
          </Typography>
        </Box>
      )}
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
            domain={domain ?? extent ?? ["dataMin", "dataMax"]}
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
          {showThresholds &&
            thresholdLines(range, dimDefault ? 0.25 : 1, "default")}
          {showThresholds &&
            dimDefault &&
            selectedRange &&
            thresholdLines(selectedRange, 1, "selected")}
        </AreaChart>
      )}
      {hasSelectedRange && selectedFeature && (
        <Box
          sx={{
            position: "absolute",
            top: 2,
            left: yAxisWidth + 8,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "text.primary",
              lineHeight: 1.2,
            }}
          >
            {selectedFeature.name}
          </Typography>
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontSize: "0.55rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "text.secondary",
            }}
          >
            {humanize(selectedFeature.type)}
          </Typography>
        </Box>
      )}
    </div>
  );
}
