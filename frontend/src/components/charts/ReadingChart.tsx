import Box from "@mui/material/Box";
import { type ReactNode, useMemo, useState } from "react";
import ChartDock from "@/components/canvas/ChartDock";
import { useLayout } from "@/components/canvas/canvasStore";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import PeriodMenu from "@/components/charts/PeriodMenu";
import ReadingBlock, {
  type ReadingView,
} from "@/components/charts/ReadingBlock";
import { pointTime, typeLabel } from "@/components/charts/water/chartTime";
import type { ScrubPoint } from "@/components/charts/water/SeriesChart";
import {
  activeMeasurementType,
  levelAt,
  measurementTypesOf,
  readingPerType,
} from "@/components/charts/water/series";
import type { TimeRange } from "@/components/charts/water/types";
import WaterChart from "@/components/charts/water/WaterChart";
import type { WaterRangeWithStatus } from "@/lib/api";
import { dockHeight } from "@/lib/canvasLayout";
import { formatTime } from "@/lib/format";
import { isStale } from "@/lib/staleness";
import { theme } from "@/lib/theme";
import type { WaterLevel } from "@/lib/waterLevel";

const { tokens } = theme;

const LEVEL_WORD: Partial<Record<WaterLevel, string>> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** The plot of the inline card, in px (the rail's follows its height). */
const INLINE_PLOT = 128;
const SOURCE_LINE = 18;
/** Side padding of the reading block: the rail's text line and the inline
 * card's. */
const RAIL_INSET = 24;
const INLINE_INSET = 16;
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

/** The reading view for the charted range: when the newest reading (or the
 * scrubbed one) was taken and its level, or "No recent reading" when it is
 * too old to say. */
function useReadingView(
  charted: WaterRangeWithStatus | undefined,
  scrub: ScrubPoint | null,
): ReadingView | null {
  if (!charted) return null;
  const levelWord = (level: WaterLevel) => {
    const word = LEVEL_WORD[level];
    return word ? { word, color: tokens.levels[level].marker } : undefined;
  };
  if (scrub) {
    return {
      time: pointTime(scrub.time),
      level: levelWord(levelAt(scrub.value, charted)),
      stale: false,
      scrubbing: true,
    };
  }
  const latest = charted.latest_reading;
  const stale = isStale(
    latest?.measured_at,
    Date.now(),
    charted.gauge.fetch_interval_secs,
  );
  if (stale || !latest) {
    return {
      time: latest ? readingTime(latest.measured_at, false) : "",
      stale: true,
      scrubbing: false,
    };
  }
  return {
    time: readingTime(latest.measured_at, false),
    level: levelWord(charted.level),
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
      onLatest={() => setScrub(null)}
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
      inset={rail ? RAIL_INSET : INLINE_INSET}
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
      marker={scrub}
      showThresholds={thresholdsAvailable}
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
      <Box
        data-testid="chart-plot"
        sx={{ height: INLINE_PLOT, position: "relative" }}
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
