import ChartCard from "@/components/charts/ChartCard";
import { ChartSkeleton } from "@/components/charts/ChartStatus";
import { useChartPanelState } from "@/components/charts/chartState";
import ReadingChart, {
  type ChartPlacement,
} from "@/components/charts/ReadingChart";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import { useIsSwipeGhost } from "@/components/SwipeGhost";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
  ranges: WaterRangeWithStatus[];
  onClose: () => void;
  /** Where the chart sits; the phone keeps its own card. */
  placement: ChartPlacement;
}

/** The chart card of one picked gauge; its options can close it. */
export default function GaugeChartPanel({
  ranges,
  onClose,
  placement,
}: GaugeChartPanelProps) {
  const ghost = useIsSwipeGhost();
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();

  const footer = <GaugeAttributions sources={ranges.map((r) => r.source)} />;
  if (placement !== "phone") {
    return (
      <ReadingChart
        placement={placement}
        ranges={ranges}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
        onDismiss={onClose}
        footer={footer}
      />
    );
  }
  return (
    <ChartCard
      ranges={ranges}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      measurementType={measurementType}
      onMeasurementTypeChange={setMeasurementType}
      onDismiss={onClose}
      footer={footer}
    >
      {(headroom) =>
        ghost ? (
          <ChartSkeleton />
        ) : (
          <WaterChart
            ranges={ranges}
            showThresholds={false}
            timeRange={timeRange}
            measurementType={measurementType}
            headroom={headroom}
          />
        )
      }
    </ChartCard>
  );
}
