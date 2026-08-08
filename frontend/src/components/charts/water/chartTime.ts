import { useCallback, useState } from "react";
import type { TimeRange } from "./types";

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
];

const LS_KEY = "chart-time-range";

function readStoredTimeRange(): TimeRange {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (TIME_RANGE_OPTIONS.some((o) => o.value === v)) return v as TimeRange;
  } catch {
    // Private mode / blocked storage: fall through to the default.
  }
  return "7d";
}

/** Shared time-range state that persists the last selection in localStorage. */
export function useChartTimeRange(): [TimeRange, (r: TimeRange) => void] {
  const [timeRange, setTimeRangeRaw] = useState<TimeRange>(readStoredTimeRange);
  const setTimeRange = useCallback((r: TimeRange) => {
    try {
      localStorage.setItem(LS_KEY, r);
    } catch {
      // Private mode / blocked storage: state still updates for the session.
    }
    setTimeRangeRaw(r);
  }, []);
  return [timeRange, setTimeRange];
}

export function fromForRange(range: TimeRange): string {
  const d = new Date();
  switch (range) {
    case "24h":
      d.setDate(d.getDate() - 1);
      break;
    case "7d":
      d.setDate(d.getDate() - 7);
      break;
    case "1m":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3m":
      d.setMonth(d.getMonth() - 3);
      break;
    case "6m":
      d.setMonth(d.getMonth() - 6);
      break;
    case "1y":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  // Truncate to the minute so the query key is stable within the same minute
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function typeLabel(t: string): string {
  return t === "water_level" ? "Level" : t === "discharge" ? "Flow" : t;
}
