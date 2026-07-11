import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  FeatureWaterRangeBody,
  GaugeWithSeries,
  WaterRangeWithStatus,
} from "@/lib/api";
import { gaugesApi } from "@/lib/api";

interface UseGaugePickerOptions {
  /** Ranges already attached to the section — offered as the first options. */
  gaugeRanges?: WaterRangeWithStatus[];
  /** Reference point for the gauge search — nearby gauges are listed first. */
  nearPoint?: { lat: number; lon: number };
}

export interface GaugePicker {
  /** Section gauges first, then search results (deduplicated). */
  gaugeOptions: GaugeWithSeries[];
  /** Ids of gauges already attached to the section (for option grouping). */
  sectionGaugeIds: Set<number>;
  selectedGauge: GaugeWithSeries | null;
  /** Select a gauge: picks its first series and prefills thresholds. */
  applyGaugeSelection: (gauge: GaugeWithSeries | null) => void;
  seriesId: number | "";
  setSeriesId: (id: number | "") => void;
  selectedSeries: GaugeWithSeries["series"][number] | undefined;
  setGaugeQuery: (query: string) => void;
  rangeLow: string;
  setRangeLow: (value: string) => void;
  rangeMedium: string;
  setRangeMedium: (value: string) => void;
  rangeHigh: string;
  setRangeHigh: (value: string) => void;
  /** Non-null when the entered thresholds are not increasing. */
  thresholdError: string | null;
  /** The water ranges to submit (empty when nothing was entered). */
  buildWaterRanges: () => FeatureWaterRangeBody[];
}

/** Gauge selection for the feature form: search the full gauge collection
 * (nearby-first), offer the section's own gauges up top, and manage the
 * low/medium/high threshold inputs. */
export function useGaugePicker({
  gaugeRanges,
  nearPoint,
}: UseGaugePickerOptions): GaugePicker {
  // Gauges already attached to the section (grouped from its water ranges)
  const sectionGauges = useMemo(() => {
    const byId = new Map<number, GaugeWithSeries>();
    for (const range of gaugeRanges ?? []) {
      const existing = byId.get(range.gauge.id);
      if (existing) {
        if (!existing.series.some((s) => s.id === range.series.id)) {
          existing.series.push(range.series);
        }
      } else {
        byId.set(range.gauge.id, { ...range.gauge, series: [range.series] });
      }
    }
    return [...byId.values()];
  }, [gaugeRanges]);

  const [selectedGauge, setSelectedGauge] = useState<GaugeWithSeries | null>(
    null,
  );
  const [seriesId, setSeriesId] = useState<number | "">("");
  const [rangeLow, setRangeLow] = useState("");
  const [rangeMedium, setRangeMedium] = useState("");
  const [rangeHigh, setRangeHigh] = useState("");

  // Search the full gauge collection (all providers), nearby-first
  const [gaugeQuery, setGaugeQuery] = useState("");
  const [debouncedGaugeQuery, setDebouncedGaugeQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGaugeQuery(gaugeQuery), 400);
    return () => clearTimeout(timer);
  }, [gaugeQuery]);
  const { data: searchedGauges } = useQuery({
    queryKey: [
      "gauge-search",
      debouncedGaugeQuery,
      nearPoint?.lat,
      nearPoint?.lon,
    ],
    queryFn: () =>
      gaugesApi.search({
        q: debouncedGaugeQuery || undefined,
        lat: nearPoint?.lat,
        lon: nearPoint?.lon,
        limit: 15,
      }),
    staleTime: 60_000,
  });

  const sectionGaugeIds = useMemo(
    () => new Set(sectionGauges.map((g) => g.id)),
    [sectionGauges],
  );
  const gaugeOptions = useMemo(
    () => [
      ...sectionGauges,
      ...(searchedGauges ?? []).filter((g) => !sectionGaugeIds.has(g.id)),
    ],
    [sectionGauges, searchedGauges, sectionGaugeIds],
  );

  // Selecting a gauge picks its first series; thresholds prefill from the
  // section's existing range for that series (empty for new gauges)
  function applyGaugeSelection(gauge: GaugeWithSeries | null) {
    setSelectedGauge(gauge);
    const firstSeries = gauge?.series[0]?.id ?? "";
    setSeriesId(firstSeries);
    const existing = (gaugeRanges ?? []).find(
      (r) => r.series.id === firstSeries,
    );
    setRangeLow(existing?.range_low?.toString() ?? "");
    setRangeMedium(existing?.range_medium?.toString() ?? "");
    setRangeHigh(existing?.range_high?.toString() ?? "");
  }

  // Default to the section's first gauge
  // biome-ignore lint/correctness/useExhaustiveDependencies: only seed the default once the section gauges arrive
  useEffect(() => {
    if (selectedGauge == null && sectionGauges.length > 0) {
      applyGaugeSelection(sectionGauges[0]);
    }
  }, [sectionGauges]);

  const selectedSeries =
    seriesId !== ""
      ? selectedGauge?.series.find((s) => s.id === seriesId)
      : undefined;

  const low = rangeLow !== "" ? Number(rangeLow) : null;
  const medium = rangeMedium !== "" ? Number(rangeMedium) : null;
  const high = rangeHigh !== "" ? Number(rangeHigh) : null;

  const ordered = (a: number | null, b: number | null) =>
    a == null || b == null || a < b;
  const thresholdError =
    ordered(low, medium) && ordered(medium, high) && ordered(low, high)
      ? null
      : "Thresholds must be increasing: low < medium < high";

  const buildWaterRanges = (): FeatureWaterRangeBody[] =>
    seriesId !== "" && (low != null || medium != null || high != null)
      ? [
          {
            series_id: seriesId as number,
            range_low: low,
            range_medium: medium,
            range_high: high,
          },
        ]
      : [];

  return {
    gaugeOptions,
    sectionGaugeIds,
    selectedGauge,
    applyGaugeSelection,
    seriesId,
    setSeriesId,
    selectedSeries,
    setGaugeQuery,
    rangeLow,
    setRangeLow,
    rangeMedium,
    setRangeMedium,
    rangeHigh,
    setRangeHigh,
    thresholdError,
    buildWaterRanges,
  };
}
