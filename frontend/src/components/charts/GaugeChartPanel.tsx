import ChartCard from "@/components/charts/ChartCard";
import { useChartPanelState } from "@/components/charts/chartState";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
  ranges: WaterRangeWithStatus[];
  tall?: boolean;
  onClose: () => void;
  /** "dock" when the canvas chart dock holds the card. */
  variant?: "card" | "dock";
}

/** The chart card of one picked gauge; its options can close it. */
export default function GaugeChartPanel({
  ranges,
  tall,
  onClose,
  variant,
}: GaugeChartPanelProps) {
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();

  return (
    <ChartCard
      ranges={ranges}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      measurementType={measurementType}
      onMeasurementTypeChange={setMeasurementType}
      tall={tall}
      variant={variant}
      onDismiss={onClose}
      footer={<GaugeAttributions sources={ranges.map((r) => r.source)} />}
    >
      {(headroom) => (
        <WaterChart
          ranges={ranges}
          showThresholds={false}
          timeRange={timeRange}
          measurementType={measurementType}
          headroom={headroom}
        />
      )}
    </ChartCard>
  );
}
