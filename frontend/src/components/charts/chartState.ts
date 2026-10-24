import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useChartTimeRange } from "@/components/charts/water/chartTime";
import type { CustomRange, TimeRange } from "@/components/charts/water/types";

export type MeasurementType = "water_level" | "discharge" | "temperature";

interface ChartRangeSearch {
  chartFrom?: string;
  chartTo?: string;
}

function isInstant(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

/** The chart range keys of a URL search, kept only as a valid pair with
 * From before To. Any route can carry them (see the root route). */
export function chartRangeSearch(
  search: Record<string, unknown>,
): ChartRangeSearch {
  const { chartFrom, chartTo } = search;
  if (!isInstant(chartFrom) || !isInstant(chartTo)) return {};
  if (Date.parse(chartFrom) >= Date.parse(chartTo)) return {};
  return { chartFrom, chartTo };
}

/** The custom range in the URL, and the way to set or clear it. Replaces the
 * history entry: a drag-zoom is not a page. */
function useChartRange(): [
  CustomRange | null,
  (range: CustomRange | null) => void,
] {
  const { chartFrom, chartTo } = useSearch({ strict: false });
  const navigate = useNavigate();
  const range = chartFrom && chartTo ? { from: chartFrom, to: chartTo } : null;
  const setRange = (next: CustomRange | null) => {
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        chartFrom: next?.from,
        chartTo: next?.to,
      }),
      replace: true,
    });
  };
  return [range, setRange];
}

/** Shared chart state: the persisted period, a custom range in the URL that
 * overrides it, and the charted measurement. */
export function useChartPanelState() {
  const [timeRange, setPreset] = useChartTimeRange();
  const [customRange, setCustomRange] = useChartRange();
  const [measurementType, setMeasurementType] = useState<string | null>(null);
  const setTimeRange = (range: TimeRange) => {
    setPreset(range);
    if (customRange) setCustomRange(null);
  };
  return {
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    measurementType,
    setMeasurementType,
  };
}

export type { TimeRange };
