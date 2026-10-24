import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { JSX, KeyboardEvent } from "react";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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
import { periodLabel } from "@/components/charts/PeriodMenu";
import type { WaterRangeWithStatus } from "@/lib/api";
import {
  formatDay,
  formatReading,
  formatSpread,
  humanize,
  sentenceCase,
} from "@/lib/format";
import { useReadingSummary } from "@/lib/hooks/useGauges";
import { FitIcon } from "@/lib/icons";
import { isStale } from "@/lib/staleness";
import { alphas, labelSx, theme } from "@/lib/theme";
import { levelInk } from "@/lib/waterLevel";
import { announce, cancelAnnounce } from "./announce";
import { pointTime, typeLabel } from "./chartTime";
import RailOverlay, {
  RAIL_AXIS,
  RailTick,
  type RailTickProps,
} from "./RailOverlay";
import { AXIS_EDGE, axisTicks, insetExtent, tickLabel } from "./railGeometry";
import { stepReading } from "./series";
import {
  type ChartRow,
  periodForSpan,
  pointsForWidth,
  readingsStart,
  toChartRows,
} from "./summary";
import type { CustomRange, DescentSpan, TimeRange } from "./types";
import { useChartZoom } from "./useChartZoom";
import { useDragSelect } from "./useDragSelect";

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
  /** The bucket's extremes and length in seconds; absent for a raw reading. */
  low?: number;
  high?: number;
  bucket?: number;
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
  /** How far the rail's words and axis labels keep from the plot's edges. */
  edge?: number;
  /** The period drawn; the rail picks its axis ticks from it. */
  timeRange?: TimeRange;
  /** A custom range, which sets the end of the window and the period's name. */
  customRange?: CustomRange | null;
  /** A span picked by dragging a mouse over the plot. */
  onSelectRange?: (range: CustomRange) => void;
  /** The point the pointer picked, kept marked on the rail. */
  marker?: ScrubPoint | null;
  /** The reading under the pointer; it stays until the caller clears it. */
  onScrub?: (point: ScrubPoint | null) => void;
}

/** The scrub readout of a drawn point: the average, with the bucket's
 * extremes when the data is bucketed. */
function scrubOf(row: ChartRow & { value: number }): ScrubPoint {
  if (row.bucket === 0 || row.low == null || row.high == null) {
    return { time: row.time, value: row.value };
  }
  return {
    time: row.time,
    value: row.value,
    low: row.low,
    high: row.high,
    bucket: row.bucket,
  };
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
  edge = AXIS_EDGE,
  timeRange,
  customRange = null,
  onSelectRange,
  marker = null,
  onScrub,
}: SeriesChartProps) {
  const { series, gauge } = range;
  const to = customRange?.to;

  // Measure container explicitly and pass width/height directly to AreaChart,
  // bypassing ResponsiveContainer's -1/-1 initial state which causes console warnings.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  // Asked for once the plot has a width: about a point per 2-3px.
  const {
    data: summary,
    isError,
    error,
    refetch,
  } = useReadingSummary(
    gauge.id,
    series.id,
    { from, to },
    size ? pointsForWidth(size.width) : null,
  );
  const bucketSeconds = summary?.bucket_seconds ?? 0;

  const chartData = useMemo(
    () => (summary ? toChartRows(summary.items, bucketSeconds) : []),
    [summary, bucketSeconds],
  );

  // Clamp descent bands to the visible domain and give very short runs a
  // minimum visual width so they stay visible in long time ranges.
  // The time axis spans the SELECTED range up to the present (or the range's
  // end), not the data extent - a silent gauge shows a visible gap instead of
  // the axis quietly ending at the last reading. It starts at the first
  // reading instead when the gauge began well after the range's start.
  const fromMs = new Date(from).getTime();
  const toMs = to ? new Date(to).getTime() : null;
  const firstTime = chartData[0]?.time;
  const dataStart = useMemo(
    () => readingsStart(firstTime, fromMs, toMs ?? Date.now(), bucketSeconds),
    [firstTime, fromMs, toMs, bucketSeconds],
  );
  const extent = useMemo<[number, number]>(() => {
    const lastReading = chartData[chartData.length - 1]?.time ?? 0;
    return [dataStart ?? fromMs, toMs ?? Math.max(Date.now(), lastReading)];
  }, [chartData, dataStart, fromMs, toMs]);

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
    () =>
      chartData.flatMap((d) =>
        d.low != null && d.high != null ? [d.low, d.high] : [],
      ),
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

  // The pointer is over the plot: the rail's readout shows, and the tooltip
  // hides again on pointerleave, since a touch would leave it standing.
  const [pointerInside, setPointerInside] = useState(false);
  // The keyboard's reading by time, so a new period or gauge cannot leave it
  // pointing at some other reading.
  const [kbTime, setKbTime] = useState<number | null>(null);

  useEffect(() => cancelAnnounce, []);

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

  const readable = useMemo(
    () =>
      chartData.filter(
        (d): d is ChartRow & { value: number } => d.value !== null,
      ),
    [chartData],
  );
  // A transition: the redraw yields, so a finger that lands here to swipe the
  // tabs is not held up by the chart repainting under it.
  const hover = (on: boolean) => startTransition(() => setPointerInside(on));
  const scrubTo = (point: ScrubPoint | null) => {
    onScrub?.(point);
    if (point) {
      const spread =
        point.low != null && point.high != null
          ? `, average ${formatReading(point.value, series.unit)}, low to high ${formatSpread(point.low, point.high, series.unit)}`
          : `, ${formatReading(point.value, series.unit)}`;
      announce(`${pointTime(point.time, point.bucket)}${spread}`);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (readable.length === 0) return;
    if (event.key === "Escape") {
      setKbTime(null);
      onScrub?.(null);
      return;
    }
    const index = stepReading(
      readable.map((d) => d.time),
      kbTime,
      event.key,
    );
    if (index == null) return;
    event.preventDefault();
    setKbTime(readable[index].time);
    scrubTo(scrubOf(readable[index]));
  };
  const kbPoint = readable.find((d) => d.time === kbTime) ?? null;
  const chartName = `${
    series.measurement_type === "water_level"
      ? "Water level"
      : typeLabel(series.measurement_type)
  } chart${
    timeRange ? `, ${periodLabel(timeRange, customRange).toLowerCase()}` : ""
  }`;

  const dragging = useDragSelect(container, {
    plotLeft,
    plotWidth: Math.max((size?.width ?? 0) - plotLeft - margin.right, 1),
    window: (domain ?? plotExtent) as [number, number],
    onSelect: onSelectRange,
  });

  const tickStyle = { fontSize: 11, fill: tokens.outline };
  const zoomed = domain != null;
  // A custom range borrows the preset axis nearest its span, but only once
  // it covers days: a few hours read better with plain clock ticks.
  const plotSpan = plotExtent[1] - plotExtent[0];
  const tickPeriod = customRange
    ? plotSpan >= 2 * 24 * 3600 * 1000
      ? periodForSpan(plotSpan)
      : null
    : (timeRange ?? null);
  const railPeriod = rail && !zoomed && tickPeriod != null;
  const xTicks = railPeriod
    ? axisTicks(tickPeriod, plotExtent)
    : byDay
      ? dayTicks((domain ?? plotExtent) as [number, number])
      : undefined;
  const formatTickLabel = (ts: number) => {
    if (railPeriod) return tickLabel(tickPeriod, ts);
    const d = new Date(ts);
    if (!byDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  // The latest dot is the newest reading, which a range that ended earlier
  // does not reach.
  const live = to == null;
  const latestRail = rail && live ? lastPoint : null;
  const staleLatest =
    live &&
    lastPoint != null &&
    isStale(
      range.latest_reading?.measured_at,
      Date.now(),
      gauge.fetch_interval_secs,
    );

  let status: JSX.Element | null = null;
  if (isError) {
    status = <ChartError error={error} onRetry={() => refetch()} />;
  } else if (summary == null) {
    status = <ChartSkeleton />;
  } else if (chartData.length === 0) {
    status = (
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
  const ready = status == null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        ref={setContainer}
        data-plot-top={headroom}
        // The plot is one focusable control: arrows pick a reading, the same
        // readout as hovering, spoken through the live region.
        {...(ready
          ? {
              role: "group",
              "aria-roledescription": "chart",
              "aria-label": `${chartName}. Use the arrow keys to read values.`,
              tabIndex: 0,
            }
          : {})}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (kbTime == null) return;
          setKbTime(null);
          onScrub?.(null);
        }}
        onPointerLeave={() => hover(false)}
        onPointerDown={() => hover(true)}
        onPointerMove={() => hover(true)}
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          position: "relative",
          // A mouse drag selects a span, not text.
          userSelect: "none",
          // Keep one-finger vertical page scrolling; claim pinches for the
          // zoom hook instead of the browser.
          touchAction: "pan-y",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {status}
        {ready && (
          <>
            {dragging && (
              <div
                data-testid="drag-selection"
                style={{
                  position: "absolute",
                  top: headroom,
                  bottom: rail ? RAIL_AXIS : 0,
                  left: dragging.x0,
                  width: dragging.x1 - dragging.x0,
                  background: `${tokens.primary}${alphas.hover}`,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            )}
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
                <FitIcon sx={{ fontSize: 20 }} />
              </IconButton>
            )}
            {size && (
              <AreaChart
                width={size.width}
                height={size.height}
                accessibilityLayer={false}
                data={chartData}
                margin={margin}
                onMouseMove={
                  onScrub
                    ? (st) => {
                        const i = Number(st.activeIndex);
                        const d = Number.isInteger(i)
                          ? chartData[i]
                          : undefined;
                        setKbTime(null);
                        scrubTo(
                          d && d.value !== null
                            ? scrubOf({ ...d, value: d.value })
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
                    <stop
                      offset="0%"
                      stopColor={tokens.primary}
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="100%"
                      stopColor={tokens.primary}
                      stopOpacity={0}
                    />
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
                            edge={edge}
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
                  active={pointerInside ? undefined : false}
                  cursor={!rail}
                  content={({ active, payload, label }) => {
                    if (rail) return null;
                    const value = payload?.find(
                      (p) => p.dataKey === "value",
                    )?.value;
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
                          {formatReading(Number(value), series.unit)}
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
                {bucketSeconds > 0 && (
                  <Area
                    type="monotone"
                    className="chart-band"
                    dataKey="band"
                    stroke="none"
                    fill={`${tokens.chartSeries}${alphas.strong}`}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
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
                {kbPoint && !rail && (
                  <ReferenceDot
                    x={kbPoint.time}
                    y={kbPoint.value}
                    ifOverflow="hidden"
                    r={DOT_RADIUS}
                    fill={tokens.chartSeries}
                    stroke={tokens.surface}
                    strokeWidth={2}
                  />
                )}
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
                edge={edge}
                top={headroom}
                domain={(domain ?? plotExtent) as [number, number]}
                yDomain={yWindow}
                thresholds={showThresholds ? displayRange : undefined}
                unit={series.unit}
                latest={latestRail}
                stale={staleLatest}
                marker={marker}
                hovering={pointerInside}
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
                    {` · ${sentenceCase(humanize(selectedFeature.type))}`}
                  </Box>
                </Typography>
              </Box>
            )}
          </>
        )}
      </div>
      {ready && dataStart != null && (
        <Typography
          data-testid="readings-start"
          sx={{
            ...labelSx,
            flexShrink: 0,
            pl: `${edge}px`,
            pt: 0.5,
            color: tokens.onSurfaceVariant,
          }}
        >
          {`Readings start ${formatDay(new Date(dataStart).toISOString())}.`}
        </Typography>
      )}
    </Box>
  );
}
