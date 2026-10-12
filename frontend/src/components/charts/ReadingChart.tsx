import Box from "@mui/material/Box";
import { type ReactNode, useMemo, useState } from "react";
import ChartDock from "@/components/canvas/ChartDock";
import { useLayout } from "@/components/canvas/canvasStore";
import ChartOptions, {
  hasChartOptions,
} from "@/components/charts/ChartOptions";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import ReadingBlock, {
  type ReadingView,
} from "@/components/charts/ReadingBlock";
import { typeLabel } from "@/components/charts/water/chartTime";
import type { ScrubPoint } from "@/components/charts/water/SeriesChart";
import {
  activeMeasurementType,
  measurementTypesOf,
  readingPerType,
} from "@/components/charts/water/series";
import type { TimeRange } from "@/components/charts/water/types";
import WaterChart from "@/components/charts/water/WaterChart";
import type { WaterRangeWithStatus } from "@/lib/api";
import { dockHeight } from "@/lib/canvasLayout";
import { formatTime } from "@/lib/format";
import { useGaugeReadings } from "@/lib/hooks/useGauges";
import { theme } from "@/lib/theme";
import { readingState, TREND_SPAN_H, trendText } from "@/lib/trend";
import type { WaterLevel } from "@/lib/waterLevel";

const { tokens } = theme;
const { canvas } = tokens;

const LEVEL_WORD: Partial<Record<WaterLevel, string>> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** The plot of the inline card, in px (the rail's follows its height). */
const INLINE_PLOT = 128;
const SOURCE_LINE = 18;
/** Padding above and below the rail's plot: with the axis row and the source
 * line they leave the plot rail height minus 54. */
const RAIL_PAD = 18;

/** Today's readings show their time, older ones their date and time. */
function readingTime(iso: string, withDate: boolean): string {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  if (today && !withDate) return formatTime(iso);
  const day = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${formatTime(iso)}`;
}

/** Where a chart sits: the phone's own card, the rail from 1280, or the
 * first block of the detail card in between. */
export type ChartPlacement = "phone" | "rail" | "inline";

export interface ReadingChartProps {
  /** "rail": reading block in the detail card's foot, plot in the rail.
   * "inline": both as the detail card's first block. */
  placement: Exclude<ChartPlacement, "phone">;
  ranges: WaterRangeWithStatus[];
  /** Loading and failure of the data; absent when the ranges are in hand. */
  status?: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
  };
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

/** The reading view for the charted range: the newest value with its level
 * and trend, or "No recent reading" when it is too old to say. */
function useReadingView(
  charted: WaterRangeWithStatus | undefined,
  scrub: ScrubPoint | null,
): ReadingView | null {
  const gaugeId = charted?.gauge.id ?? null;
  const seriesId = charted?.series.id ?? null;
  // Truncated to the minute so the query key holds still.
  const from = useMemo(() => {
    const d = new Date(Date.now() - (TREND_SPAN_H + 6) * 3_600_000);
    d.setSeconds(0, 0);
    return d.toISOString();
  }, []);
  const { data } = useGaugeReadings(gaugeId, seriesId, from, 500);
  if (!charted) return null;
  const unit = charted.series.unit;
  if (scrub) {
    return {
      value: scrub.value,
      unit,
      time: readingTime(new Date(scrub.time).toISOString(), true),
      stale: false,
      scrubbing: true,
    };
  }
  const latest = charted.latest_reading;
  const points = [...(data ?? []), ...(latest ? [latest] : [])];
  const state = readingState(
    points,
    Date.now(),
    charted.gauge.fetch_interval_secs,
    charted.range_high,
  );
  if (state.stale || !latest) {
    return {
      value: latest?.value ?? null,
      unit,
      time: latest ? readingTime(latest.measured_at, false) : "",
      stale: true,
      scrubbing: false,
    };
  }
  const word = LEVEL_WORD[charted.level];
  return {
    value: latest.value,
    unit,
    time: readingTime(latest.measured_at, false),
    level: word
      ? { word, color: tokens.levels[charted.level].marker }
      : undefined,
    trend: state.trend ? trendText(state.trend, unit) : undefined,
    stale: false,
    scrubbing: false,
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
  const [gaugeChoice, setGaugeChoice] = useState<number | null>(null);
  const [scrub, setScrub] = useState<ScrubPoint | null>(null);
  const [thresholds, setThresholds] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsButton, setOptionsButton] = useState<HTMLButtonElement | null>(
    null,
  );
  const dock = useLayout((s) => s.dock);
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
  const view = useReadingView(charted, scrub);
  const calibrated =
    charted != null &&
    (charted.range_low != null ||
      charted.range_medium != null ||
      charted.range_high != null);

  const optionProps = {
    types: measurementTypesOf(own).map((t) => ({
      type: t,
      label: typeLabel(t),
    })),
    thresholds:
      thresholdsAvailable && calibrated
        ? { on: thresholds, onChange: setThresholds }
        : undefined,
    onDismiss,
  };
  const hasOptions = hasChartOptions(optionProps);
  const railHeight = dockHeight(windowHeight);

  const block = (
    <ReadingBlock
      gauges={gauges}
      gaugeId={gaugeId}
      onGauge={(id) => {
        setScrub(null);
        setGaugeChoice(id);
      }}
      view={view}
      onLatest={() => setScrub(null)}
      timeRange={timeRange}
      onTimeRange={(range) => {
        setScrub(null);
        onTimeRangeChange(range);
      }}
      options={
        hasOptions
          ? {
              open: optionsOpen,
              onToggle: () => setOptionsOpen((o) => !o),
              buttonRef: setOptionsButton,
            }
          : undefined
      }
    />
  );

  const plotBody = status?.isError ? (
    <ChartError error={status.error} onRetry={status.refetch} />
  ) : status?.isLoading ? (
    <ChartSkeleton />
  ) : (
    <WaterChart
      ranges={own}
      rail
      onScrub={setScrub}
      showThresholds={thresholdsAvailable ? thresholds : false}
      timeRange={timeRange}
      measurementType={measurementType}
      selectedFeatureId={selectedFeatureId}
      selectedFeature={selectedFeature}
      preferredFeatureId={preferredFeatureId}
      headroom={rail ? 6 : 10}
    />
  );
  const source = (
    <Box sx={{ height: SOURCE_LINE, minWidth: 0, overflow: "hidden" }}>
      {footer}
    </Box>
  );

  const options = (
    <ChartOptions
      open={optionsOpen && hasOptions}
      onClose={() => setOptionsOpen(false)}
      anchor={
        rail && dock
          ? {
              anchorReference: "anchorPosition",
              anchorPosition: {
                left: dock.left + 8,
                top: windowHeight - canvas.margin - railHeight - 8,
              },
              transformOrigin: { vertical: "bottom", horizontal: "left" },
            }
          : {
              anchorEl: optionsButton,
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
              transformOrigin: { vertical: "top", horizontal: "right" },
            }
      }
      type={type}
      onType={(t) => {
        setScrub(null);
        onMeasurementTypeChange(t);
      }}
      {...optionProps}
    />
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
              pl: 2,
              py: `${RAIL_PAD}px`,
            }}
          >
            <Box
              data-testid="chart-plot"
              sx={{ flex: 1, minHeight: 0, position: "relative" }}
            >
              {plotBody}
            </Box>
            {source}
          </Box>
        </ChartDock>
        {options}
      </>
    );
  }

  return (
    <Box
      data-testid="chart-card"
      sx={{
        mx: 1.5,
        mt: 1.5,
        flexShrink: 0,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        overflow: "hidden",
      }}
    >
      <Box sx={{ pt: 0.5 }}>{block}</Box>
      <Box sx={{ height: INLINE_PLOT, pl: 2, position: "relative" }}>
        {plotBody}
      </Box>
      <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>{source}</Box>
      {options}
    </Box>
  );
}
