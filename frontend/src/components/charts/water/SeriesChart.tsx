import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { JSX } from "react";
import { useLayoutEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import type { GaugeReading, WaterRangeWithStatus } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useGaugeReadings } from "@/lib/hooks/useGauges";
import { isStale } from "@/lib/staleness";
import { theme } from "@/lib/theme";
import { levelInk } from "@/lib/waterLevel";
import { pointTime } from "./chartTime";
import RailOverlay, {
  RAIL_AXIS,
  RailTick,
  type RailTickProps,
} from "./RailOverlay";
import { axisTicks, insetExtent, tickLabel } from "./railGeometry";
import type { DescentSpan, TimeRange } from "./types";
import { useChartZoom } from "./useChartZoom";

const { tokens } = theme;

/** Single source of truth for the plot geometry - the zoom hook derives the
 * plot area's pixel bounds from these same numbers. */
const CHART_MARGIN = { top: 6, right: 12, bottom: 4, left: 0 };

/** Radius of the latest reading's dot, and the gap the threshold labels keep
 * from it. The labels end this far short of the plot's right edge. */
const DOT_RADIUS = 5;
const LABEL_GAP = DOT_RADIUS + 10;

/** The rail's plot runs edge to edge: no margins but the headroom. */
const RAIL_MARGIN = { top: 6, right: 0, bottom: 0, left: 0 };

export interface ScrubPoint {
  time: number;
  value: number;
}

export interface SeriesChartProps {
  range: WaterRangeWithStatus;
  /** Range of the feature selected in the timeline. While set, its
   * thresholds replace the default ones. */
  selectedRange?: WaterRangeWithStatus | null;
  /** Name and type of the selected feature, shown as a chart caption. */
  selectedFeature?: { name: string; type: string } | null;
  from: string;
  showThresholds?: boolean;
  /** Own descents drawn as shaded time bands. */
  descentSpans?: DescentSpan[];
  /** Room kept above the plot, in px, for text laid over the chart. */
  headroom?: number;
  /** The reading rail's look: edge to edge, threshold words on the lines,
   * its own hover readout, a 20px axis row. */
  rail?: boolean;
  /** The period drawn; the rail picks its axis ticks from it. */
  timeRange?: TimeRange;
  /** The point the pointer picked, kept marked on the rail. */
  marker?: ScrubPoint | null;
  /** The reading under the pointer; it stays until the caller clears it. */
  onScrub?: (point: ScrubPoint | null) => void;
}

/** Midnight ticks across the window, stepped so about four fit: a day label
 * never repeats. */
export function dayTicks([from, to]: [number, number], target = 4): number[] {
  const days = differenceInCalendarDays(to, from);
  const step = Math.max(1, Math.ceil(days / target));
  const ticks: number[] = [];
  for (
    let d = addDays(startOfDay(from), 1);
    d.getTime() <= to;
    d = addDays(d, step)
  ) {
    ticks.push(d.getTime());
  }
  return ticks;
}

function typeCaption(type: string): string {
  const text = humanize(type);
  return text.charAt(0).toUpperCase() + text.slice(1);
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

/** Threshold reference lines for one range. The phone labels each under its
 * line and short of the latest reading's dot; the rail names them in its
 * overlay. Returned as an element array because recharts only recognizes
 * direct children. */
function thresholdLines(r: WaterRangeWithStatus, rail: boolean) {
  const line = (key: string, y: number, color: string, labelText: string) => (
    <ReferenceLine
      key={`thresholds-${key}`}
      y={y}
      ifOverflow="hidden"
      stroke={color}
      strokeWidth={1.2}
      strokeDasharray="4 4"
      label={
        rail
          ? undefined
          : {
              content: ({ viewBox }) =>
                viewBox && "width" in viewBox ? (
                  <text
                    data-testid="threshold-label"
                    x={(viewBox.x ?? 0) + (viewBox.width ?? 0) - LABEL_GAP}
                    y={(viewBox.y ?? 0) + 13}
                    textAnchor="end"
                    fontSize={11}
                    fontWeight={600}
                    fill={color}
                  >
                    {labelText}
                  </text>
                ) : (
                  <g />
                ),
            }
      }
    />
  );
  return [
    r.range_low != null &&
      line("low", r.range_low, levelInk("low"), `L ${r.range_low}`),
    r.range_medium != null &&
      line("medium", r.range_medium, levelInk("medium"), `M ${r.range_medium}`),
    r.range_high != null &&
      line("high", r.range_high, levelInk("high"), `H ${r.range_high}`),
  ].filter((l): l is JSX.Element => l !== false);
}

/** The quiet wash between thresholds: green from low to medium, amber from
 * medium to high. */
function thresholdBands(r: WaterRangeWithStatus) {
  const band = (key: string, y1: number, y2: number, fill: string) => (
    <ReferenceArea
      key={key}
      y1={y1}
      y2={y2}
      ifOverflow="hidden"
      fill={fill}
      fillOpacity={0.06}
      stroke="none"
    />
  );
  return [
    r.range_low != null &&
      r.range_medium != null &&
      band("low", r.range_low, r.range_medium, tokens.levels.low.text),
    r.range_medium != null &&
      r.range_high != null &&
      band("medium", r.range_medium, r.range_high, tokens.levels.medium.text),
  ].filter((l): l is JSX.Element => l !== false);
}

export default function SeriesChart({
  range,
  selectedRange,
  selectedFeature,
  from,
  showThresholds = true,
  descentSpans,
  headroom = CHART_MARGIN.top,
  rail = false,
  timeRange,
  marker = null,
  onScrub,
}: SeriesChartProps) {
  const { series, gauge } = range;

  const {
    data: readings,
    isLoading,
    isError,
    error,
    refetch,
  } = useGaugeReadings(gauge.id, series.id, from, 1000);

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
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const median = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
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

  // The chart runs edge to edge: no y axis, the threshold labels and the
  // tooltip carry the scale.
  const yAxisWidth = 0;
  const margin = { ...(rail ? RAIL_MARGIN : CHART_MARGIN), top: headroom };
  const lastPoint = useMemo(() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      const v = chartData[i].value;
      if (v !== null) return { time: chartData[i].time, value: v };
    }
    return null;
  }, [chartData]);

  // Measure container explicitly and pass width/height directly to AreaChart,
  // bypassing ResponsiveContainer's -1/-1 initial state which causes console warnings.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // A touch leaves the tooltip standing; pointerleave hides it until the
  // next touch or move.
  const [hoverOff, setHoverOff] = useState(false);
  // The rail's readout shows only while the pointer is over the plot.
  const [inside, setInside] = useState(false);
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

  // The rail leaves the newest reading a few px short of the right edge;
  // bands and threshold lines run on to the edge.
  const plotExtent = useMemo<[number, number]>(
    () => (rail && size ? insetExtent(extent, size.width) : extent),
    [rail, size, extent],
  );

  const plotLeft = yAxisWidth + margin.left;
  const { domain, reset } = useChartZoom(container, {
    extent: plotExtent,
    plotLeft,
    plotWidth: Math.max((size?.width ?? 0) - plotLeft - margin.right, 1),
  });

  // Zooming only narrows the time axis; the y window stays fixed on the
  // full data range so values remain comparable while panning.
  const yWindow = useMemo(
    () => yDomainOf(allValues, thresholds),
    [allValues, thresholds],
  );
  const yDomain: [number | "auto", number | "auto"] = yWindow
    ? [yWindow.lo, yWindow.hi]
    : ["auto", "auto"];

  // Day labels while the window spans days; clock times once it is zoomed in.
  const [winFrom, winTo] = domain ?? plotExtent;
  const byDay = winTo - winFrom >= 2 * 24 * 3600 * 1000;

  if (isError) return <ChartError error={error} onRetry={() => refetch()} />;
  if (isLoading) return <ChartSkeleton />;
  if (chartData.length === 0) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="caption" color="textSecondary">
          No readings in this time range.
        </Typography>
      </Box>
    );
  }

  const tickStyle = { fontSize: 11, fill: tokens.outline };
  const zoomed = domain != null;
  const railPeriod = rail && !zoomed && timeRange != null;
  const xTicks = railPeriod
    ? axisTicks(timeRange, plotExtent)
    : byDay
      ? dayTicks((domain ?? plotExtent) as [number, number])
      : undefined;
  const formatTickLabel = (ts: number) => {
    if (railPeriod) return tickLabel(timeRange, ts);
    const d = new Date(ts);
    if (!byDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const latestRail = rail ? lastPoint : null;
  const staleLatest =
    lastPoint != null &&
    isStale(
      new Date(lastPoint.time).toISOString(),
      Date.now(),
      gauge.fetch_interval_secs,
    );

  return (
    <div
      ref={setContainer}
      data-plot-top={headroom}
      onPointerLeave={() => {
        setHoverOff(true);
        setInside(false);
      }}
      onPointerDown={() => {
        setHoverOff(false);
        setInside(true);
      }}
      onPointerMove={() => {
        setHoverOff(false);
        setInside(true);
      }}
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
          aria-label="Reset zoom"
          title="Reset zoom"
          onClick={reset}
          sx={{
            position: "absolute",
            top: headroom,
            right: 0,
            zIndex: 2,
            width: tokens.touch.min,
            height: tokens.touch.min,
            color: "text.secondary",
          }}
        >
          <ZoomOutMapIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}
      {size && (
        <AreaChart
          width={size.width}
          height={size.height}
          data={chartData}
          margin={margin}
          onMouseMove={
            onScrub
              ? (st) => {
                  const i = Number(st.activeIndex);
                  const d = Number.isInteger(i) ? chartData[i] : undefined;
                  onScrub(
                    d && d.value !== null
                      ? { time: d.time, value: d.value }
                      : null,
                  );
                }
              : undefined
          }
        >
          <defs>
            <linearGradient
              id={`fill-${series.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={tokens.primary} stopOpacity={0.24} />
              <stop offset="100%" stopColor={tokens.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          {visibleSpans.map((s) => (
            <ReferenceArea
              key={s.id}
              x1={s.x1}
              x2={s.x2}
              ifOverflow="hidden"
              fill={tokens.success}
              fillOpacity={0.15}
              stroke={tokens.success}
              strokeOpacity={0.35}
            />
          ))}
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={domain ?? plotExtent}
            allowDataOverflow
            ticks={xTicks}
            tickFormatter={formatTickLabel}
            tick={
              rail
                ? (p: RailTickProps) => (
                    <RailTick
                      {...p}
                      width={size?.width ?? 0}
                      label={formatTickLabel(Number(p.payload?.value))}
                    />
                  )
                : tickStyle
            }
            axisLine={false}
            tickLine={false}
            interval={rail ? 0 : "preserveEnd"}
            minTickGap={60}
            height={rail ? RAIL_AXIS : undefined}
          />
          <YAxis
            hide
            domain={yDomain}
            width={yAxisWidth}
            tickFormatter={formatTick}
          />
          <Tooltip
            active={hoverOff ? false : undefined}
            cursor={!rail}
            content={({ active, payload, label }) => {
              if (rail) return null;
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
                    {pointTime(ts)}
                  </div>
                  <div style={{ color: tokens.onSurface }}>
                    {`${Number(value).toFixed(1)} ${series.unit}`}
                  </div>
                  {span && (
                    <div style={{ color: tokens.success, marginTop: 2 }}>
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
            strokeWidth={2}
            strokeLinecap="round"
            fill={`url(#fill-${series.id})`}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {showThresholds && thresholdBands(displayRange)}
          {showThresholds && thresholdLines(displayRange, rail)}
          {lastPoint && !rail && (
            <ReferenceDot
              x={lastPoint.time}
              y={lastPoint.value}
              ifOverflow="hidden"
              shape={({ cx, cy }) => (
                <circle
                  data-testid="latest-dot"
                  cx={cx}
                  cy={cy}
                  r={DOT_RADIUS}
                  fill={tokens.surface}
                  stroke={tokens.chartSeries}
                  strokeWidth={2}
                />
              )}
            />
          )}
        </AreaChart>
      )}
      {rail && size && (
        <RailOverlay
          width={size.width}
          height={size.height}
          top={headroom}
          domain={(domain ?? plotExtent) as [number, number]}
          yDomain={yWindow}
          thresholds={showThresholds ? displayRange : undefined}
          unit={series.unit}
          latest={latestRail}
          stale={staleLatest}
          marker={marker}
          hovering={inside}
        />
      )}
      {hasSelectedRange && selectedFeature && (
        <Box
          sx={{
            position: "absolute",
            top: headroom + 2,
            left: yAxisWidth + 14,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "text.primary",
              lineHeight: 1.2,
            }}
          >
            {selectedFeature.name}
            <Box
              component="span"
              sx={{ fontWeight: 400, color: "text.secondary" }}
            >
              {` · ${typeCaption(selectedFeature.type)}`}
            </Box>
          </Typography>
        </Box>
      )}
    </div>
  );
}
