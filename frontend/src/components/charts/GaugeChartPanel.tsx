import { useChartPanelState } from "@/components/charts/chartState";
import ReadingChart, {
  type ChartPlacement,
} from "@/components/charts/ReadingChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
  ranges: WaterRangeWithStatus[];
  onClose: () => void;
  /** Where the chart sits. */
  placement: ChartPlacement;
}

/** The chart card of one picked gauge; its options can close it. */
export default function GaugeChartPanel({
  ranges,
  onClose,
  placement,
}: GaugeChartPanelProps) {
  const {
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    measurementType,
    setMeasurementType,
  } = useChartPanelState();

  const footer = <GaugeAttributions sources={ranges.map((r) => r.source)} />;
  return (
    <ReadingChart
      placement={placement}
      ranges={ranges}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      customRange={customRange}
      onCustomRangeChange={setCustomRange}
      measurementType={measurementType}
      onMeasurementTypeChange={setMeasurementType}
      onDismiss={onClose}
      footer={footer}
    />
  );
}
