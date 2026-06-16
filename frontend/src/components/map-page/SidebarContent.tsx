import WaterwaySearchPanel from "@/components/search/WaterwaySearchPanel";
import SuggestFeaturePanel from "@/components/waterway/SuggestFeaturePanel";
import SuggestSectionPanel from "@/components/waterway/SuggestSectionPanel";
import WaterwayBrowsePanel from "@/components/waterway/WaterwayBrowsePanel";
import type { MapPageState } from "./useMapPageState";

interface SidebarContentProps {
  state: MapPageState;
  /** Mobile only: close the overlay when area mode is activated */
  onAreaModeActivate?: () => void;
  /** Mobile only: close the overlay */
  onClose?: () => void;
  /** Mobile only: toggles between map view and detail view */
  onMobileMapToggle?: () => void;
  /** Mobile only: true when map view is active (icon shown as highlighted) */
  mobileMapActive?: boolean;
}

/**
 * Routes between WaterwaySearchPanel, WaterwayBrowsePanel, SuggestSectionPanel,
 * and SuggestFeaturePanel based on current state. Shared by DesktopSidebar and
 * MobileOverlay.
 */
export default function SidebarContent({
  state,
  onAreaModeActivate,
  onClose,
  onMobileMapToggle,
  mobileMapActive,
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
    selectedSectionGaugeRanges,
    suggestMode,
    setSuggestMode,
    clearSuggestState,
    sectionPutIn,
    sectionTakeOut,
    sectionPickingFor,
    setSectionPickingFor,
    setSectionPreviewCoords,
    featureVertices,
    setFeatureVertices,
    featureGeomType,
    setFeatureGeomType,
    featurePickingActive,
    setFeaturePickingActive,
    setFocusedPoint,
    showProposedFeatures,
    toggleShowProposedFeatures,
    featureProposals,
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
        onClose={onClose}
      />
    );
  }

  if (suggestMode === "section") {
    return (
      <SuggestSectionPanel
        waterwayId={selectedWaterwayId}
        onClose={() => {
          setSuggestMode(null);
          clearSuggestState();
        }}
        putIn={sectionPutIn}
        takeOut={sectionTakeOut}
        pickingFor={sectionPickingFor}
        onStartPickPutIn={() => setSectionPickingFor("put-in")}
        onStartPickTakeOut={() => setSectionPickingFor("take-out")}
        onDraftClear={clearSuggestState}
        onPreviewCoordsChange={setSectionPreviewCoords}
      />
    );
  }

  if (suggestMode === "feature" && selectedSectionId != null) {
    return (
      <SuggestFeaturePanel
        waterwayId={selectedWaterwayId}
        sectionId={selectedSectionId}
        gaugeRanges={
          selectedSectionGaugeRanges?.length
            ? selectedSectionGaugeRanges
            : gaugeRanges
        }
        onClose={() => {
          setSuggestMode(null);
          clearSuggestState();
        }}
        vertices={featureVertices}
        geomType={featureGeomType}
        pickingActive={featurePickingActive}
        onStartPick={() => setFeaturePickingActive(true)}
        onStopPick={() => setFeaturePickingActive(false)}
        onRemoveVertex={(i) =>
          setFeatureVertices((prev) => prev.filter((_, idx) => idx !== i))
        }
        onGeomTypeChange={(t) => {
          setFeatureGeomType(t);
          setFeatureVertices([]);
          setFeaturePickingActive(false);
        }}
        onDraftClear={() => {
          setFeatureVertices([]);
          setFeaturePickingActive(false);
        }}
      />
    );
  }

  return (
    <WaterwayBrowsePanel
      waterwayId={selectedWaterwayId}
      selectedSectionId={selectedSectionId}
      selectedGaugeId={selectedGaugeId}
      gaugeRanges={gaugeRanges}
      tab={detailTab}
      onTabChange={setDetailTab}
      onBack={() => setSelectedWaterwayId(undefined)}
      onSectionClick={handleSectionClick}
      onSectionDeselect={() => setSelectedSectionId(undefined)}
      onGaugeSelect={handleGaugeSelect}
      onSuggestModeChange={setSuggestMode}
      favoritedIds={favoritedIds}
      onToggleFavorite={toggleFavorite}
      onMobileMapToggle={onMobileMapToggle}
      mobileMapActive={mobileMapActive}
      onFeatureClick={(coords) => setFocusedPoint(coords)}
      showProposedFeatures={showProposedFeatures}
      onToggleProposedFeatures={toggleShowProposedFeatures}
      featureProposals={featureProposals}
    />
  );
}
