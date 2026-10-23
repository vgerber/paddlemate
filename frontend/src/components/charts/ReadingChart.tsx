import Box from "@mui/material/Box";
import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import ChartDock from "@/components/canvas/ChartDock";
import { useLayout } from "@/components/canvas/canvasStore";
import { phoneCardSx } from "@/components/canvas/flatRow";
import {
  ChartBody,
  type ChartLoad,
  ChartSkeleton,
} from "@/components/charts/ChartStatus";
import PeriodMenu from "@/components/charts/PeriodMenu";
import ReadingBlock, {
  type ReadingView,
} from "@/components/charts/ReadingBlock";
import { typeLabel } from "@/components/charts/water/chartTime";
import { AXIS_EDGE } from "@/components/charts/water/railGeometry";
import type { ScrubPoint } from "@/components/charts/water/SeriesChart";
import {
  activeMeasurementType,
  measurementTypesOf,
  readingPerType,
} from "@/components/charts/water/series";
import type { TimeRange } from "@/components/charts/water/types";
import { useIsSwipeGhost } from "@/components/SwipeGhost";
import type { WaterRangeWithStatus } from "@/lib/api";
import { dockHeight } from "@/lib/canvasLayout";
import { readingTime, timeAgo } from "@/lib/format";
import { isStale } from "@/lib/staleness";
import { theme } from "@/lib/theme";
import {
  currentLevel,
  levelMarkerColor,
  levelWord,
  type WaterLevel,
} from "@/lib/waterLevel";

// Recharts is heavy and only charts need it, so it loads with the first chart.
const WaterChart = lazy(() => import("@/components/charts/water/WaterChart"));

const { tokens } = theme;

/** The plot of the inline card, in px (the rail's follows its height). The
 * phone's grows by the free room the pane measured (--chart-extra). */
const INLINE_PLOT = 128;
const PHONE_PLOT = "calc(clamp(96px, 19vh, 112px) + var(--chart-extra, 0px))";
/** The credit line is 18px of type; its box is 44 tall, reaching into the
 * space around it, so the links keep their 44px hit area unclipped. */
const SOURCE_LINE = 18;
const SOURCE_HIT = tokens.touch.min;
/** Side padding of the reading block: the rail's text line and the inline
 * card's. */
const RAIL_INSET = 24;
const INLINE_INSET = 16;
/** Padding above and below the rail's plot: with the source line they leave
 * the plot the rail's height minus 2 * RAIL_PAD + SOURCE_LINE. */
const RAIL_PAD = 18;
/** The reading number on the rail: a share of the dock's height, in bounds. */
const RAIL_NUMBER = { min: 56, max: 80, share: 0.32 };
const INLINE_NUMBER = 36;
/** Room above the plot for text laid over it, in px. */
const RAIL_HEADROOM = 6;
const INLINE_HEADROOM = 10;

/** Where a chart sits: the phone's own card, the rail from 1280, or the
 * first block of the detail card in between. */
export type ChartPlacement = "phone" | "rail" | "inline";

export interface ReadingChartProps {
  /** "rail": reading block in the detail card's foot, plot in the rail.
   * "inline": both as the detail card's first block. "phone": the same
   * card with the phone's head, its plot growing into free height. */
  placement: ChartPlacement;
  ranges: WaterRangeWithStatus[];
  /** Loading and failure of the data; absent when the ranges are in hand. */
  status?: ChartLoad;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  measurementType: string | null;
  onMeasurementTypeChange: (type: string) => void;
  preferredFeatureId?: number | null;
  selectedFeatureId?: number | null;
  selectedFeature?: { name: string; type: string } | null;
  /** The chart may draw threshold lines (not for a picked gauge). */
  thresholdsAvailable?: boolean;
  /** Closes a picked gauge's chart. */
  onDismiss?: () => void;
  /** The credit line under the plot. */
  footer?: ReactNode;
}

/** The reading view for the charted range: the newest reading, when it was
 * taken and how long ago, and its level, or "No recent reading" when it is
 * too old to say. A hovered point shows in the plot, not here. */
function readingView(
  charted: WaterRangeWithStatus | undefined,
): ReadingView | null {
  if (!charted) return null;
  const unit = charted.series.unit;
  const levelView = (level: WaterLevel | null) => {
    if (!level || level === "empty") return undefined;
    return { word: levelWord(level), color: levelMarkerColor(level) };
  };
  const latest = charted.latest_reading;
  const stale = isStale(
    latest?.measured_at,
    Date.now(),
    charted.gauge.fetch_interval_secs,
  );
  if (stale || !latest) {
    return {
      time: latest ? readingTime(latest.measured_at) : "",
      age: latest ? timeAgo(latest.measured_at) : "",
      value: latest?.value ?? null,
      unit,
      stale: true,
    };
  }
  return {
    time: readingTime(latest.measured_at),
    age: timeAgo(latest.measured_at),
    value: latest.value,
    unit,
    level: levelView(currentLevel([charted])),
    stale: false,
  };
}

/** The chart of a section or gauge, as a reading block and a plot. */
export default function ReadingChart(props: ReadingChartProps) {
  const {
    placement,
    ranges,
    status,
    timeRange,
    onTimeRangeChange,
    measurementType,
    onMeasurementTypeChange,
    preferredFeatureId,
    selectedFeatureId,
    selectedFeature,
    thresholdsAvailable = false,
    onDismiss,
    footer,
  } = props;
  const rail = placement === "rail";
  const phone = placement === "phone";
  const [gaugeChoice, setGaugeChoice] = useState<number | null>(null);
  const [scrub, setScrub] = useState<ScrubPoint | null>(null);
  const ghost = useIsSwipeGhost();
  const windowHeight = useLayout((s) => s.viewport.h);

  const gauges = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of ranges) seen.set(r.gauge.id, r.gauge.name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [ranges]);
  const gaugeId = gauges.some((g) => g.id === gaugeChoice)
    ? gaugeChoice
    : (gauges[0]?.id ?? null);
  const own = useMemo(
    () => ranges.filter((r) => r.gauge.id === gaugeId),
    [ranges, gaugeId],
  );

  const type = activeMeasurementType(own, measurementType);
  const charted = readingPerType(own, preferredFeatureId).find(
    (r) => r.type === type,
  )?.range;
  const view = readingView(charted);
  const railHeight = dockHeight(windowHeight);
  const types = measurementTypesOf(own).map((t) => ({
    type: t,
    label: typeLabel(t),
  }));
  const changeRange = (range: TimeRange) => {
    setScrub(null);
    onTimeRangeChange(range);
  };

  const block = (
    <ReadingBlock
      gauges={gauges}
      gaugeId={gaugeId}
      onGauge={(id) => {
        setScrub(null);
        setGaugeChoice(id);
      }}
      view={view}
      measurement={{
        types,
        type,
        onType: (t) => {
          setScrub(null);
          onMeasurementTypeChange(t);
        },
      }}
      onDismiss={onDismiss}
      period={rail ? { value: timeRange, onChange: changeRange } : undefined}
      phone={phone}
      inset={rail ? RAIL_INSET : INLINE_INSET}
      numberSize={
        rail
          ? Math.round(
              Math.min(
                RAIL_NUMBER.max,
                Math.max(RAIL_NUMBER.min, railHeight * RAIL_NUMBER.share),
              ),
            )
          : INLINE_NUMBER
      }
    />
  );

  const plotBody = (
    <ChartBody load={status} pending={ghost}>
      <Suspense fallback={<ChartSkeleton />}>
        <WaterChart
          ranges={own}
          rail
          onScrub={setScrub}
          marker={scrub}
          showThresholds={thresholdsAvailable}
          timeRange={timeRange}
          measurementType={measurementType}
          selectedFeatureId={selectedFeatureId}
          selectedFeature={selectedFeature}
          preferredFeatureId={preferredFeatureId}
          headroom={rail ? RAIL_HEADROOM : INLINE_HEADROOM}
          edge={phone ? tokens.phone.inner : AXIS_EDGE}
        />
      </Suspense>
    </ChartBody>
  );
  const source = (
    <Box
      sx={{
        height: SOURCE_HIT,
        my: `${(SOURCE_LINE - SOURCE_HIT) / 2}px`,
        mx: -1.5,
        px: 1.5,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        // Only the links catch the pointer, not the box around them.
        pointerEvents: "none",
        "& a": { pointerEvents: "auto" },
      }}
    >
      {footer}
    </Box>
  );

  if (rail) {
    return (
      <>
        <Box
          data-testid="chart-card"
          sx={{
            height: railHeight,
            flexShrink: 0,
            bgcolor: tokens.surface,
            borderTop: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          {block}
        </Box>
        <ChartDock>
          <Box
            sx={{
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              py: `${RAIL_PAD}px`,
              overflow: "hidden",
            }}
          >
            <Box
              data-testid="chart-plot"
              sx={{ flex: 1, minHeight: 0, position: "relative" }}
            >
              {plotBody}
            </Box>
            <Box sx={{ pl: 2 }}>{source}</Box>
          </Box>
        </ChartDock>
      </>
    );
  }

  return (
    <Box
      data-testid="chart-card"
      sx={{
        ...phoneCardSx,
        mx: `${tokens.phone.edge}px`,
        mt: 1.5,
        // The panel's gutter to the card below.
        mb: phone ? `${tokens.canvas.panel.gutter}px` : 0,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <Box sx={{ pt: phone ? 0 : 0.5 }}>{block}</Box>
      <Box
        data-testid="chart-plot"
        sx={{ height: phone ? PHONE_PLOT : INLINE_PLOT, position: "relative" }}
      >
        {plotBody}
      </Box>
      <Box
        sx={{
          px: `${INLINE_INSET}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          minHeight: tokens.touch.min,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{source}</Box>
        <PeriodMenu value={timeRange} onChange={changeRange} />
      </Box>
    </Box>
  );
}
