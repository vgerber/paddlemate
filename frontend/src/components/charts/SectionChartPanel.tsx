import { useMemo } from "react";
import ChartCard from "@/components/charts/ChartCard";
import { ChartError, ChartSkeleton } from "@/components/charts/ChartStatus";
import { useChartPanelState } from "@/components/charts/chartState";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
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
  /** Lets the chart grow taller (the features list is folded). */
  tall?: boolean;
  /** "dock" when the canvas chart dock holds the card. */
  variant?: "card" | "dock";
}

export default function SectionChartPanel({
  waterwayId,
  sectionId,
  selectedFeatureId,
  selectedFeature,
  preferredFeatureId,
  tall,
  variant,
}: SectionChartPanelProps) {
  const {
    data: waterStatus,
    isLoading,
    isError,
    error,
    refetch,
  } = useWaterStatus(waterwayId, sectionId);
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();

  const ranges = useMemo(
    () => waterStatus?.ranges ?? [],
    [waterStatus?.ranges],
  );
  return (
    <>
      <ChartCard
        ranges={ranges}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
        preferredFeatureId={preferredFeatureId}
        tall={tall}
        short={isLoading || isError}
        variant={variant}
        footer={<GaugeAttributions sources={ranges.map((r) => r.source)} />}
      >
        {(headroom) =>
          isError ? (
            <ChartError error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
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
