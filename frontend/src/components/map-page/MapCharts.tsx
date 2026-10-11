import { useDockMode } from "@/components/canvas/CanvasContext";
import ChartDock from "@/components/canvas/ChartDock";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import { defaultRangeFeature } from "@/components/waterway/section-details/utils";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { localizedName } from "@/lib/localization";
import type { MapPageState } from "./useMapPageState";

/** The chart of the map page: the selected gauge's when one is picked, else
 * the selected section's, else nothing. On a wide screen from 1280 it docks
 * along the bottom of the canvas; otherwise it sits where it is rendered. */
export default function MapCharts({ state }: { state: MapPageState }) {
  const dockMode = useDockMode();
  const variant = !state.isMobile && dockMode === "dock" ? "dock" : "card";
  const chart = <MapChart state={state} variant={variant} />;
  const { selectedWaterwayId, selectedSectionId, selectedGaugeRanges } = state;
  const status = useWaterStatus(
    selectedWaterwayId ?? null,
    selectedSectionId ?? null,
  );
  // A section without a gauge has nothing to chart: no card, no dock.
  const noGauge =
    state.selectedGaugeId == null &&
    selectedGaugeRanges.length === 0 &&
    status.isSuccess &&
    status.data.ranges.length === 0;
  if (!hasChart(state) || noGauge) return null;
  return state.isMobile ? chart : <ChartDock>{chart}</ChartDock>;
}

/** Whether the page has a chart to show; the dock is only kept for one. */
export function hasChart(state: MapPageState): boolean {
  const {
    selectedWaterwayId,
    selectedSectionId,
    detailTab,
    sectionDetailTab,
    selectedGaugeId,
    selectedGaugeRanges,
  } = state;
  // The logs, notes and sources tabs replace the chart with their list -
  // give them the space.
  if (selectedSectionId != null && sectionDetailTab !== "features") {
    return false;
  }
  if (selectedSectionId == null && detailTab === "notes") return false;
  if (selectedGaugeId != null && selectedGaugeRanges.length > 0) return true;
  return selectedSectionId != null && selectedWaterwayId != null;
}

function MapChart({
  state,
  variant,
}: {
  state: MapPageState;
  variant: "card" | "dock";
}) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    sectionDetailTab,
    sections,
    selectedGaugeId,
    setSelectedGaugeId,
    selectedGaugeRanges,
    selectedFeatureId,
    featuresFolded,
  } = state;
  // Folding the features list hands its height to the chart.
  const tall =
    featuresFolded &&
    selectedSectionId != null &&
    sectionDetailTab === "features";

  if (selectedGaugeId != null && selectedGaugeRanges.length > 0) {
    return (
      <GaugeChartPanel
        ranges={selectedGaugeRanges}
        tall={tall}
        variant={variant}
        onClose={() => setSelectedGaugeId(null)}
      />
    );
  }

  if (selectedSectionId == null || selectedWaterwayId == null) return null;

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const selectedFeature =
    selectedFeatureId != null
      ? selectedSection?.features.find((f) => f.id === selectedFeatureId)
      : undefined;

  return (
    <SectionChartPanel
      waterwayId={selectedWaterwayId}
      sectionId={selectedSectionId}
      tall={tall}
      variant={variant}
      selectedFeatureId={selectedFeatureId}
      selectedFeature={
        selectedFeature
          ? {
              name: localizedName(
                selectedFeature.names[0]?.name ?? "",
                selectedFeature.names,
              ),
              type: selectedFeature.feature_type,
            }
          : null
      }
      preferredFeatureId={
        selectedSection ? defaultRangeFeature(selectedSection)?.id : undefined
      }
    />
  );
}
