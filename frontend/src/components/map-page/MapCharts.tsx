import GaugeChartPanel from "@/components/charts/GaugeChartPanel";
import SectionChartPanel from "@/components/charts/SectionChartPanel";
import { defaultRangeFeature } from "@/components/waterway/section-details/utils";
import { localizedName } from "@/lib/localization";
import type { MapPageState } from "./useMapPageState";

/** Chart area below the map / overlay: the selected gauge's chart when one
 * is picked, else the selected section's chart, else nothing. */
export default function MapCharts({ state }: { state: MapPageState }) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    sectionDetailTab,
    sections,
    selectedGaugeId,
    setSelectedGaugeId,
    selectedGaugeRanges,
    selectedFeatureId,
  } = state;

  // The logs tab replaces the chart with the log list - give it the space.
  if (selectedSectionId != null && sectionDetailTab === "logs") return null;

  if (selectedGaugeId != null && selectedGaugeRanges.length > 0) {
    return (
      <GaugeChartPanel
        ranges={selectedGaugeRanges}
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
      sectionName={
        selectedSection
          ? localizedName(selectedSection.name, selectedSection.names)
          : undefined
      }
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
