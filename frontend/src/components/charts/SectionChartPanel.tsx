import { useMemo } from "react";
import { useChartPanelState } from "@/components/charts/chartState";
import ReadingChart, {
  type ChartPlacement,
} from "@/components/charts/ReadingChart";
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
  /** Where the chart sits. */
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
  const {
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    measurementType,
    setMeasurementType,
  } = useChartPanelState();

  const ranges = useMemo(
    () => waterStatus?.ranges ?? [],
    [waterStatus?.ranges],
  );
  const footer = <GaugeAttributions sources={ranges.map((r) => r.source)} />;
  return (
    <ReadingChart
      placement={placement}
      ranges={ranges}
      status={{ isLoading, isError, error, refetch }}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      customRange={customRange}
      onCustomRangeChange={setCustomRange}
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
