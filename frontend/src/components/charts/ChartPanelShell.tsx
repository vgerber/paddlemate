import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useChartTimeRange } from "@/components/charts/water/chartTime";
import type { TimeRange } from "@/components/charts/water/types";
import type { WaterRangeWithStatus } from "@/lib/api";

export type MeasurementType = "water_level" | "discharge" | "temperature";

/** Distinct measurement types present in the given ranges. */
export function useMeasurementTypes(
  ranges: WaterRangeWithStatus[],
): MeasurementType[] {
  return useMemo(() => {
    const types = new Set(ranges.map((r) => r.series.measurement_type));
    return Array.from(types) as MeasurementType[];
  }, [ranges]);
}

/** Shared chart state (persisted time range + measurement type). */
export function useChartPanelState() {
  const [timeRange, setTimeRange] = useChartTimeRange();
  const [measurementType, setMeasurementType] = useState<string | null>(null);
  return { timeRange, setTimeRange, measurementType, setMeasurementType };
}

interface ChartPanelShellProps {
  /** Left part of the header row (title or action buttons). */
  header: ReactNode;
  children: ReactNode;
  /** Rendered below the chart (e.g. gauge attribution). */
  footer?: ReactNode;
}

/** The fixed-height panel frame both chart panels share: bordered box,
 * header row, divider, chart area. */
export default function ChartPanelShell({
  header,
  children,
  footer,
}: ChartPanelShellProps) {
  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        // Mobile keeps the compact band; desktop lets the chart grow
        // with the viewport instead of staying phone-sized.
        height: { xs: 260, md: "clamp(260px, 30vh, 420px)" },
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        p: 1.5,
        pb: 0.5,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-start" },
          flexWrap: "wrap",
          mb: 1,
          flexShrink: 0,
          gap: 1,
        }}
      >
        {header}
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
      {footer}
    </Box>
  );
}

export type { TimeRange };
