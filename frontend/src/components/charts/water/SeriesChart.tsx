import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { JSX } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceDot,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import type { WaterRangeWithStatus } from "@/lib/api";
import { FitIcon } from "@/lib/icons";
import {
  formatDay,
  formatReading,
  humanize,
  sentenceCase,
} from "@/lib/text/format";
import { withAlpha } from "@/lib/theme/alpha";
import { labelSx, theme } from "@/lib/theme/theme";
import { pointTime } from "./chartTime";
import RailOverlay, {
  RAIL_AXIS,
  RailTick,
  type RailTickProps,
} from "./RailOverlay";
import { AXIS_EDGE } from "./railGeometry";
import { redrawSx } from "./redrawSx";
import { formatTick, type ScrubPoint } from "./seriesChartMath";
import { DOT_RADIUS, thresholdBands, thresholdLines } from "./thresholdLayers";
import type { CustomRange, DescentSpan, TimeRange } from "./types";
import { CHART_MARGIN, useSeriesChart } from "./useSeriesChart";

export type { ScrubPoint };

const { tokens } = theme;

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

export default function SeriesChart(props: SeriesChartProps) {
  const {
    showThresholds = true,
    headroom = CHART_MARGIN.top,
    rail = false,
    edge = AXIS_EDGE,
    marker = null,
    selectedFeature,
  } = props;
  const c = useSeriesChart(props);
  const {
    ink,
    size,
    setContainer,
    domain,
    plotExtent,
    series,
    margin,
    yAxisWidth,
    redrawing,
    drawKey,
    onKeyDown,
    onBlur,
    hover,
    dragging,
    reset,
    chartData,
    onMouseMove,
    visibleSpans,
    xTicks,
    formatTickLabel,
    yDomain,
    pointerInside,
    bucketSeconds,
    displayRange,
    kbPoint,
    lastPoint,
    yWindow,
    latestRail,
    staleLatest,
    hasSelectedRange,
    dataStart,
    chartName,
  } = c;
  const tickStyle = { fontSize: 11, fill: ink.outline };

  let status: JSX.Element | null = null;
  if (c.isError) {
    status = <ChartError error={c.error} onRetry={() => c.refetch()} />;
  } else if (c.summary == null) {
    status = <ChartSkeleton />;
  } else if (c.chartData.length === 0) {
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
    <Box
      data-redraw={redrawing || undefined}
      sx={[
        { height: "100%", display: "flex", flexDirection: "column" },
        redrawSx(),
      ]}
    >
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
        onBlur={onBlur}
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
                  background: withAlpha(tokens.primary, "hover"),
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
                key={drawKey}
                width={size.width}
                height={size.height}
                accessibilityLayer={false}
                data={chartData}
                margin={margin}
                onMouseMove={onMouseMove}
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
                      stopColor={ink.primary}
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="100%"
                      stopColor={ink.primary}
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
                    fill={ink.success}
                    fillOpacity={0.15}
                    stroke={ink.success}
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
                    fill={withAlpha(ink.chartSeries, "strong")}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={ink.chartSeries}
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill={`url(#fill-${series.id})`}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {showThresholds && thresholdBands(displayRange, ink)}
                {showThresholds && thresholdLines(displayRange, rail, ink)}
                {kbPoint && !rail && (
                  <ReferenceDot
                    x={kbPoint.time}
                    y={kbPoint.value}
                    ifOverflow="hidden"
                    r={DOT_RADIUS}
                    fill={ink.chartSeries}
                    stroke={ink.surface}
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
                        fill={ink.surface}
                        stroke={ink.chartSeries}
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
