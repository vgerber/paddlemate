import { useState } from "react";
import { useChartTimeRange } from "@/components/charts/water/chartTime";
import type { TimeRange } from "@/components/charts/water/types";

export type MeasurementType = "water_level" | "discharge" | "temperature";

/** Shared chart state: the persisted period and the charted measurement. */
export function useChartPanelState() {
  const [timeRange, setTimeRange] = useChartTimeRange();
  const [measurementType, setMeasurementType] = useState<string | null>(null);
  return { timeRange, setTimeRange, measurementType, setMeasurementType };
}

export type { TimeRange };
