import { useMemo } from "react";
import ChartCard from "@/components/charts/ChartCard";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import { useChartPanelState } from "@/components/charts/chartState";
import ReadingChart, {
  type ChartPlacement,
} from "@/components/charts/ReadingChart";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import { useIsSwipeGhost } from "@/components/SwipeGhost";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";

interface SectionChartPanelProps {
  waterwayId: number;
  sectionId: number;
  /** Feature highlighted in the section's feature timeline - its water
   * ranges are brought to the front in the chart. */
  selectedFeatureId?: number | null;
  /** Name and type of that feature, shown as a chart caption. */
  selectedFeature?: { name: string; type: string } | null;
  /** Feature owning the section's default thresholds (whitewater). */
  preferredFeatureId?: number | null;
  /** Where the chart sits; the phone keeps its own card. */
  placement: ChartPlacement;
}

export default function SectionChartPanel({
  waterwayId,
  sectionId,
  selectedFeatureId,
  selectedFeature,
  preferredFeatureId,
  placement,
}: SectionChartPanelProps) {
  const {
    data: waterStatus,
    isLoading,
    isError,
    error,
    refetch,
  } = useWaterStatus(waterwayId, sectionId);
  const ghost = useIsSwipeGhost();
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();

  const ranges = useMemo(
    () => waterStatus?.ranges ?? [],
    [waterStatus?.ranges],
  );
  const footer = <GaugeAttributions sources={ranges.map((r) => r.source)} />;
  if (placement !== "phone") {
    return (
      <ReadingChart
        placement={placement}
        ranges={ranges}
        status={{ isLoading, isError, error, refetch }}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
        preferredFeatureId={preferredFeatureId}
        selectedFeatureId={selectedFeatureId}
        selectedFeature={selectedFeature}
        thresholdsAvailable
        footer={footer}
      />
    );
  }
  return (
    <>
      <ChartCard
        ranges={ranges}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
        preferredFeatureId={preferredFeatureId}
        short={isLoading || isError}
        footer={footer}
      >
        {(headroom) =>
          isError ? (
            <ChartError error={error} onRetry={() => refetch()} />
          ) : isLoading || ghost ? (
            <ChartSkeleton />
          ) : (
            <WaterChart
              ranges={ranges}
              selectedFeatureId={selectedFeatureId}
              selectedFeature={selectedFeature}
              preferredFeatureId={preferredFeatureId}
              timeRange={timeRange}
              measurementType={measurementType}
              headroom={headroom}
            />
          )
        }
      </ChartCard>
    </>
  );
}
