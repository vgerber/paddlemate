import { useDockMode } from "@/components/canvas/CanvasContext";
import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import NoGaugeRow from "@/components/charts/NoGaugeRow";
import type { ChartPlacement } from "@/components/charts/ReadingChart";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import { defaultRangeFeature } from "@/components/waterway/section-details/utils";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { localizedName } from "@/lib/localization";
import type { MapPageState } from "./useMapPageState";

/** Where the chart goes: the phone's card, the rail (its reading block is the
 * detail card's foot) from 1280 wide, else the card's first block. */
export function useChartPlacement(state: MapPageState): ChartPlacement {
  const dockMode = useDockMode();
  if (state.isMobile) return "phone";
  return dockMode === "dock" ? "rail" : "inline";
}

/** The chart of the map page: the selected gauge's when one is picked, else
 * the selected section's, else nothing. `slot` says which spot of the detail
 * card renders it: "pane" leads the tab (phone and under 1280), "foot" is
 * the card's foot beside the rail. */
export default function MapCharts({
  state,
  slot,
}: {
  state: MapPageState;
  slot: "pane" | "foot";
}) {
  const placement = useChartPlacement(state);
  const { isAuthenticated } = useSession();
  const { selectedWaterwayId, selectedSectionId, selectedGaugeRanges } = state;
  const status = useWaterStatus(
    selectedWaterwayId ?? null,
    selectedSectionId ?? null,
  );
  const railed = placement === "rail";
  if (railed !== (slot === "foot")) return null;
  if (!hasChart(state, railed)) return null;
  const picked =
    state.selectedGaugeId != null && selectedGaugeRanges.length > 0;
  // A section without a gauge has nothing to chart.
  const noGauge =
    !picked && status.isSuccess && status.data.ranges.length === 0;
  if (noGauge) {
    return railed ? (
      <NoGaugeRow
        onLink={
          isAuthenticated ? () => state.setSuggestMode("feature") : undefined
        }
      />
    ) : null;
  }
  if (railed && !picked && status.isLoading) return null;
  return <MapChart state={state} placement={placement} />;
}

/** Whether the page has a chart to show. The rail follows every section tab;
 * elsewhere the logs, notes and sources tabs replace the chart with their
 * list. */
export function hasChart(state: MapPageState, railed = false): boolean {
  const {
    selectedWaterwayId,
    selectedSectionId,
    detailTab,
    sectionDetailTab,
    selectedGaugeId,
    selectedGaugeRanges,
  } = state;
  if (!railed && selectedSectionId != null && sectionDetailTab !== "features") {
    return false;
  }
  if (selectedSectionId == null && detailTab === "notes") return false;
  if (selectedGaugeId != null && selectedGaugeRanges.length > 0) return true;
  return selectedSectionId != null && selectedWaterwayId != null;
}

function MapChart({
  state,
  placement,
}: {
  state: MapPageState;
  placement: ChartPlacement;
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
        placement={placement}
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
      placement={placement}
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
