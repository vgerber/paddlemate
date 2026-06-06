import WaterwaySearchPanel from "@/components/search/WaterwaySearchPanel";
import WaterwayDetailPanel from "@/components/waterway/WaterwayDetailPanel";
import type { MapPageState } from "./useMapPageState";

interface SidebarContentProps {
  state: MapPageState;
  /** Mobile only: close the overlay when area mode is activated */
  onAreaModeActivate?: () => void;
}

/**
 * Renders either WaterwaySearchPanel (no selection) or WaterwayDetailPanel
 * (waterway selected). Shared between DesktopSidebar and MobileOverlay.
 */
export default function SidebarContent({
  state,
  onAreaModeActivate,
}: SidebarContentProps) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    setSelectedWaterwayId,
    setSelectedSectionId,
    setSearchWaterwayIds,
    handleAreaCircleChange,
    handleSectionClick,
    handleGaugeSelect,
    areaCircle,
    areaLocked,
    setAreaLocked,
    filteredSearchSections,
    waterwayNames,
    favorites,
    favoritedIds,
    toggleFavorite,
    setPreviewRadius,
    setIsSearchPanelLoading,
    detailTab,
    setDetailTab,
    selectedGaugeId,
    gaugeRanges,
    suggestMode,
    setSuggestMode,
    clearSuggestState,
    sectionPutIn,
    sectionTakeOut,
    sectionPickingFor,
    setSectionPickingFor,
    setSectionPutIn,
    setSectionTakeOut,
    setSectionPreviewCoords,
    featureVertices,
    setFeatureVertices,
    featureGeomType,
    setFeatureGeomType,
    featurePickingActive,
    setFeaturePickingActive,
    setFocusedPoint,
  } = state;

  if (selectedWaterwayId == null) {
    return (
      <WaterwaySearchPanel
        onSelect={setSelectedWaterwayId}
        onWaterwaysChange={setSearchWaterwayIds}
        areaCircle={areaCircle}
        onAreaCircleChange={handleAreaCircleChange}
        areaLocked={areaLocked}
        onAreaLockedChange={setAreaLocked}
        filteredSections={filteredSearchSections}
        selectedSectionId={selectedSectionId}
        onSectionClick={handleSectionClick}
        waterwayNames={waterwayNames}
        favorites={favorites}
        favoritedIds={favoritedIds}
        onToggleFavorite={toggleFavorite}
        onRadiusPreview={setPreviewRadius}
        onLoadingChange={setIsSearchPanelLoading}
        onAreaModeActivate={onAreaModeActivate}
      />
    );
  }

  return (
    <WaterwayDetailPanel
      waterwayId={selectedWaterwayId}
      selectedSectionId={selectedSectionId}
      selectedGaugeId={selectedGaugeId}
      gaugeRanges={gaugeRanges}
      tab={detailTab}
      onTabChange={setDetailTab}
      onBack={() => {
        setSuggestMode(null);
        setSelectedWaterwayId(undefined);
      }}
      onSectionClick={handleSectionClick}
      onSectionDeselect={() => setSelectedSectionId(undefined)}
      suggestMode={suggestMode}
      onSuggestModeChange={(mode) => {
        setSuggestMode(mode);
        if (mode === null) clearSuggestState();
      }}
      onGaugeSelect={handleGaugeSelect}
      favoritedIds={favoritedIds}
      onToggleFavorite={toggleFavorite}
      sectionPutIn={sectionPutIn}
      sectionTakeOut={sectionTakeOut}
      sectionPickingFor={sectionPickingFor}
      onStartPickPutIn={() => setSectionPickingFor("put-in")}
      onStartPickTakeOut={() => setSectionPickingFor("take-out")}
      onSectionDraftClear={() => {
        setSectionPutIn(null);
        setSectionTakeOut(null);
        setSectionPickingFor(null);
      }}
      featureVertices={featureVertices}
      featureGeomType={featureGeomType}
      onPreviewCoordsChange={setSectionPreviewCoords}
      featurePickingActive={featurePickingActive}
      onStartPickFeature={() => setFeaturePickingActive(true)}
      onStopPickFeature={() => setFeaturePickingActive(false)}
      onPopFeatureVertex={() => setFeatureVertices((prev) => prev.slice(0, -1))}
      onRemoveFeatureVertex={(i) =>
        setFeatureVertices((prev) => prev.filter((_, idx) => idx !== i))
      }
      onFeatureGeomTypeChange={(t) => {
        setFeatureGeomType(t);
        setFeatureVertices([]);
        setFeaturePickingActive(false);
      }}
      onFeatureDraftClear={() => {
        setFeatureVertices([]);
        setFeaturePickingActive(false);
      }}
      onFeatureClick={(coords) => setFocusedPoint(coords)}
    />
  );
}
