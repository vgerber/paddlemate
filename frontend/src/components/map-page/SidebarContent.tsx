import { useNavigate } from "@tanstack/react-router";
import WaterwaySearchPanel from "@/components/search/WaterwaySearchPanel";
import SuggestFeaturePanel from "@/components/waterway/SuggestFeaturePanel";
import SuggestWaterwayPanel from "@/components/waterway/SuggestWaterwayPanel";
import WaterwayBrowsePanel from "@/components/waterway/WaterwayBrowsePanel";
import type { MapPageState } from "./useMapPageState";

interface SidebarContentProps {
  state: MapPageState;
  /** Mobile only: close the overlay when area mode is activated */
  onMapModeActivate?: () => void;
  /** Mobile only: close the overlay */
  onClose?: () => void;
  /** Mobile only: toggles between map view and detail view */
  onMobileMapToggle?: () => void;
  /** Mobile only: true when map view is active (icon shown as highlighted) */
  mobileMapActive?: boolean;
}

/**
 * Routes between WaterwaySearchPanel, WaterwayBrowsePanel, SuggestWaterwayPanel,
 * and SuggestFeaturePanel based on current state. Shared by DesktopSidebar and
 * MobileOverlay. (Suggesting a section navigates to its own page.)
 */
export default function SidebarContent({
  state,
  onMapModeActivate,
  onClose,
  onMobileMapToggle,
  mobileMapActive,
}: SidebarContentProps) {
  const navigate = useNavigate();
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
    areSearchSectionsPending,
    waterwayNames,
    favorites,
    favoritedIds,
    toggleFavorite,
    setPreviewRadius,
    setIsSearchPanelLoading,
    detailTab,
    setDetailTab,
    sectionDetailTab,
    setSectionDetailTab,
    selectedGaugeId,
    gaugeRanges,
    selectedSectionGaugeRanges,
    suggestMode,
    setSuggestMode,
    closeSuggest,
    featureVertices,
    setFeatureVertices,
    featureGeomType,
    setFeatureGeomType,
    featurePickingActive,
    setFeaturePickingActive,
    editFeature,
    startEditFeature,
    setFocusedPoint,
    selectedFeatureId,
    setSelectedFeatureId,
    showProposedFeatures,
    toggleShowProposedFeatures,
    featureProposals,
    suggestWaterwayName,
    setSuggestWaterwayName,
    setFocusBounds,
    setSuggestGaugePins,
  } = state;

  if (suggestMode === "waterway") {
    return (
      <SuggestWaterwayPanel
        initialName={suggestWaterwayName}
        onFocusBounds={setFocusBounds}
        onGaugePinsChange={setSuggestGaugePins}
        onClose={closeSuggest}
      />
    );
  }

  if (selectedWaterwayId == null) {
    return (
      <WaterwaySearchPanel
        onSelect={setSelectedWaterwayId}
        onProposeRiver={(name) => {
          setSuggestWaterwayName(name);
          setSuggestMode("waterway");
        }}
        onWaterwaysChange={setSearchWaterwayIds}
        areaCircle={areaCircle}
        onAreaCircleChange={handleAreaCircleChange}
        areaLocked={areaLocked}
        onAreaLockedChange={setAreaLocked}
        filteredSections={filteredSearchSections}
        sectionsPending={areSearchSectionsPending}
        selectedSectionId={selectedSectionId}
        onSectionClick={handleSectionClick}
        waterwayNames={waterwayNames}
        favorites={favorites}
        favoritedIds={favoritedIds}
        onToggleFavorite={toggleFavorite}
        onRadiusPreview={setPreviewRadius}
        onLoadingChange={setIsSearchPanelLoading}
        onMapModeActivate={onMapModeActivate}
        onClose={onClose}
      />
    );
  }

  if (suggestMode === "feature" && selectedSectionId != null) {
    return (
      <SuggestFeaturePanel
        waterwayId={selectedWaterwayId}
        sectionId={selectedSectionId}
        editFeature={editFeature}
        gaugeRanges={
          selectedSectionGaugeRanges?.length
            ? selectedSectionGaugeRanges
            : gaugeRanges
        }
        onClose={closeSuggest}
        geometry={{
          vertices: featureVertices,
          geomType: featureGeomType,
          pickingActive: featurePickingActive,
          onRequestPick: () => setFeaturePickingActive(true),
          onStopPick: () => setFeaturePickingActive(false),
          onRemoveVertex: (i) =>
            setFeatureVertices((prev) => prev.filter((_, idx) => idx !== i)),
          onGeomTypeChange: (t) => {
            setFeatureGeomType(t);
            setFeatureVertices([]);
            setFeaturePickingActive(false);
          },
          onClearVertices: () => {
            setFeatureVertices([]);
            setFeaturePickingActive(false);
          },
        }}
      />
    );
  }

  return (
    <WaterwayBrowsePanel
      noteMapPin={{
        placing: state.notePinPlacing,
        pin: state.notePin,
        onTogglePlacing: () => state.setNotePinPlacing(!state.notePinPlacing),
        onClearPin: () => {
          state.setNotePin(null);
          state.setNotePinPlacing(false);
        },
        onFocus: (lngLat) => state.setFocusedPoint(lngLat),
        selectedNoteId: state.selectedNoteId,
        onSelectNote: state.setSelectedNoteId,
      }}
      waterwayId={selectedWaterwayId}
      selectedSectionId={selectedSectionId}
      favoritedIds={favoritedIds}
      onToggleFavorite={toggleFavorite}
      selectedGaugeId={selectedGaugeId}
      gaugeRanges={gaugeRanges}
      tab={detailTab}
      onTabChange={setDetailTab}
      sectionDetailTab={sectionDetailTab}
      onSectionDetailTabChange={setSectionDetailTab}
      onBack={() => setSelectedWaterwayId(undefined)}
      onSectionClick={handleSectionClick}
      onSectionDeselect={() => setSelectedSectionId(undefined)}
      onGaugeSelect={handleGaugeSelect}
      onSuggestModeChange={(mode) => {
        // Section suggestion lives on its own page (like /logs/new)
        if (mode === "section") {
          navigate({
            to: "/waterways/suggest-section",
            search: { waterway: selectedWaterwayId },
          });
        } else {
          setSuggestMode(mode);
        }
      }}
      onMobileMapToggle={onMobileMapToggle}
      mobileMapActive={mobileMapActive}
      featureTimeline={{
        onFeatureClick: setFocusedPoint,
        onEditFeature: startEditFeature,
        activeFeatureId: selectedFeatureId,
        onActiveFeatureChange: setSelectedFeatureId,
        showProposed: showProposedFeatures,
        onToggleProposed: toggleShowProposedFeatures,
        proposals: featureProposals,
      }}
    />
  );
}
