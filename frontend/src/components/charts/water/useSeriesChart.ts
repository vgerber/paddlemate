import type { KeyboardEvent } from "react";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { periodLabel } from "@/components/charts/PeriodMenu";
import { useTokens } from "@/lib/hooks/ui/useTokens";
import { useReadingSummary } from "@/lib/hooks/useGauges";
import { formatReading, formatSpread } from "@/lib/text/format";
import { durations } from "@/lib/theme/motion";
import { isStale } from "@/lib/water/staleness";
import { announce, cancelAnnounce } from "./announce";
import { pointTime, typeLabel } from "./chartTime";
import { axisTicks, insetExtent, tickLabel } from "./railGeometry";
import type { SeriesChartProps } from "./SeriesChart";
import { stepReading } from "./series";
import {
  DAY_LABELS_MS,
  dayTicks,
  lastReading,
  type ScrubPoint,
  scrubOf,
  tickPeriodOf,
  visibleDescentSpans,
  yDomainOf,
} from "./seriesChartMath";
import {
  type ChartRow,
  pointsForWidth,
  readingsStart,
  toChartRows,
} from "./summary";
import { useChartZoom } from "./useChartZoom";
import { useDragSelect } from "./useDragSelect";

/** Single source of truth for the plot geometry - the zoom hook derives the
 * plot area's pixel bounds from these same numbers. */
export const CHART_MARGIN = { top: 6, right: 12, bottom: 4, left: 0 };

/** The rail's plot runs edge to edge: no margins but the headroom. */
const RAIL_MARGIN = { top: 6, right: 0, bottom: 0, left: 0 };

/** Everything SeriesChart draws: the summary query, the rows and axes derived
 * from it, the zoom and drag-select state, and the keyboard and pointer
 * handlers. The component only lays it out. */
export function useSeriesChart({
  range,
  selectedRange,
  from,
  descentSpans,
  headroom = CHART_MARGIN.top,
  rail = false,
  timeRange,
  customRange = null,
  onSelectRange,
  onScrub,
}: SeriesChartProps) {
  const ink = useTokens();
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

  const visibleSpans = useMemo(
    () => visibleDescentSpans(descentSpans, extent),
    [descentSpans, extent],
  );

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
  const lastPoint = useMemo(() => lastReading(chartData), [chartData]);

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

  // A new series or period draws in once; the window covers the line and
  // the area that follows it.
  const drawKey = `${series.id}|${timeRange}|${to ?? ""}`;
  const [redrawing, setRedrawing] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawKey is the trigger
  useEffect(() => {
    setRedrawing(true);
    const id = window.setTimeout(
      () => setRedrawing(false),
      durations.slow + durations.base + durations.fast,
    );
    return () => window.clearTimeout(id);
  }, [drawKey]);

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
  const byDay = winTo - winFrom >= DAY_LABELS_MS;

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

  const zoomed = domain != null;
  const tickPeriod = tickPeriodOf(
    timeRange,
    customRange,
    plotExtent[1] - plotExtent[0],
  );
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

  const onMouseMove = onScrub
    ? (st: { activeIndex?: unknown }) => {
        const i = Number(st.activeIndex);
        const d = Number.isInteger(i) ? chartData[i] : undefined;
        setKbTime(null);
        scrubTo(
          d && d.value !== null ? scrubOf({ ...d, value: d.value }) : null,
        );
      }
    : undefined;

  const onBlur = () => {
    if (kbTime == null) return;
    setKbTime(null);
    onScrub?.(null);
  };

  return {
    ink,
    series,
    to,
    setContainer,
    size,
    summary,
    isError,
    error,
    refetch,
    bucketSeconds,
    chartData,
    dataStart,
    visibleSpans,
    displayRange,
    hasSelectedRange,
    yAxisWidth,
    margin,
    lastPoint,
    pointerInside,
    hover,
    onKeyDown,
    onBlur,
    onMouseMove,
    kbPoint,
    chartName,
    dragging,
    plotExtent,
    domain,
    reset,
    drawKey,
    redrawing,
    yWindow,
    yDomain,
    xTicks,
    formatTickLabel,
    latestRail,
    staleLatest,
  };
}
