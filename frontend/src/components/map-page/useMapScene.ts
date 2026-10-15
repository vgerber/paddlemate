import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MapScene } from "@/components/canvas/scene";
import { setFeatureNumbers } from "@/components/map/featureNumbers";
import type { NotePin, PointPin } from "@/components/map/Map";
import { featureNumbers } from "@/components/waterway/section-details/rows";
import {
  proposalToPseudoFeature,
  spansWholeSection,
} from "@/components/waterway/section-details/utils";
import { categoryColor, categoryLabel } from "@/lib/comments";
import { timeAgo } from "@/lib/format";
import { lineCoords, pointCoords } from "@/lib/geo";
import { useWaterwayComments } from "@/lib/hooks/useComments";
import { theme } from "@/lib/theme";
import { buildMapScene, type MapSceneInput, pickSceneState } from "./mapScene";
import type { MapPageState } from "./useMapPageState";

function shallowEqual(a: MapSceneInput, b: MapSceneInput): boolean {
  const keys = Object.keys(a) as (keyof MapSceneInput)[];
  return keys.every((k) => Object.is(a[k], b[k]));
}

/** The map scene for the page state: the note, region and feature data the
 * map needs, and the scene built from them. The scene keeps its identity
 * until something it draws changes, so the map is not redrawn by unrelated
 * renders. */
export function useMapScene(state: MapPageState) {
  const {
    selectedWaterwayId,
    selectedSectionId,
    suggestMode,
    isMobile,
    detailTab,
    sectionDetailTab,
    sections,
    notePin,
    regionChoices,
    regionLevel,
    isAreaMode,
    areaCircle,
    previewRadius,
    showProposedFeatures,
    featureProposals,
    setSelectedNoteId,
    setSectionDetailTab,
    setSelectedSectionId,
    setDetailTab,
    setNotePin,
    setNotePinPlacing,
    exitMapView,
  } = state;

  // A notes tab is in view: the river overview or one section's thread.
  const notesActive =
    selectedWaterwayId != null &&
    (selectedSectionId == null
      ? detailTab === "notes"
      : sectionDetailTab === "notes");

  // Note markers are on the map whenever a river is open, not only on the
  // notes tab - a pinned hazard is map content, and clicking one is how the
  // notes tab opens. The river overview feeds them (cache shared with the
  // thread); in section view only other sections' notes are dropped.
  const showNoteMarkers = selectedWaterwayId != null && suggestMode == null;
  const riverNotes = useWaterwayComments(
    showNoteMarkers ? (selectedWaterwayId ?? null) : null,
    true,
  );
  const noteData = riverNotes.data;

  /** Open the thread a note lives in, with the note selected. */
  const openNoteInThread = useCallback(
    (id: number) => {
      setSelectedNoteId(id);
      const note = noteData?.find((comment) => comment.id === id);
      if (
        selectedSectionId != null &&
        note?.entity_type === "water_section" &&
        note.entity_id === selectedSectionId
      ) {
        setSectionDetailTab("notes");
      } else if (selectedSectionId != null) {
        // The note belongs to the river or another section - the overview is
        // where it can actually be read and highlighted.
        setSelectedSectionId(undefined);
        setDetailTab("notes");
      } else {
        setDetailTab("notes");
      }
      // On mobile the panel is hidden while browsing the map; bring it back.
      exitMapView();
    },
    [
      noteData,
      selectedSectionId,
      setSelectedNoteId,
      setSectionDetailTab,
      setSelectedSectionId,
      setDetailTab,
      exitMapView,
    ],
  );

  /** Marker click. Mobile only opens the popup - the full-height panel
   * would cover the map and the popup with it; the popup's own "Open in
   * notes" does the navigating. Desktop shows panel and map side by side,
   * so it can do both at once. */
  const onNoteSelect = useCallback(
    (id: number | null) => {
      if (isMobile || id == null) {
        setSelectedNoteId(id);
        return;
      }
      openNoteInThread(id);
    },
    [isMobile, setSelectedNoteId, openNoteInThread],
  );

  const notePins = useMemo<NotePin[]>(
    () =>
      showNoteMarkers
        ? (noteData ?? [])
            .filter(
              (comment) =>
                selectedSectionId == null ||
                comment.entity_type === "waterway" ||
                comment.entity_id === selectedSectionId,
            )
            .flatMap((comment) => {
              const coords = comment.location
                ? pointCoords(comment.location)
                : null;
              if (!coords) return [];
              return [
                {
                  id: comment.id,
                  lon: coords[0],
                  lat: coords[1],
                  color:
                    categoryColor(comment.category) ??
                    theme.tokens.onSurfaceVariant,
                  categoryLabel: categoryLabel(comment.category),
                  body: comment.body,
                  author: comment.author_name ?? undefined,
                  age: timeAgo(comment.created_at),
                },
              ];
            })
        : [],
    [showNoteMarkers, noteData, selectedSectionId],
  );

  const draftPin = useMemo<PointPin[]>(
    () =>
      notesActive && notePin
        ? [
            {
              id: "note-draft",
              lon: notePin[0],
              lat: notePin[1],
              color: theme.tokens.tertiary,
              title: "New note location",
              emphasis: true,
            },
          ]
        : [],
    [notesActive, notePin],
  );

  // Leaving the notes tab abandons any half-placed pin.
  useEffect(() => {
    if (!notesActive) {
      setNotePinPlacing(false);
      setNotePin(null);
      setSelectedNoteId(null);
    }
  }, [notesActive, setNotePinPlacing, setNotePin, setSelectedNoteId]);

  // Stable identity - feeds the map's area fitBounds effect, which must not
  // refire on unrelated re-renders (see useMapPageState.areaCircle).
  const visibleAreaCircle = useMemo(
    () =>
      selectedWaterwayId == null && isAreaMode
        ? previewRadius != null && areaCircle != null
          ? { ...areaCircle, radiusKm: previewRadius }
          : areaCircle
        : null,
    [selectedWaterwayId, isAreaMode, previewRadius, areaCircle],
  );

  // The level chips narrow what the map draws.
  const drawnRegions = useMemo(
    () =>
      regionLevel
        ? regionChoices.filter((r) => r.kind === regionLevel)
        : regionChoices,
    [regionChoices, regionLevel],
  );

  // Line features spanning (nearly) the whole section (e.g. the whitewater
  // zone) would just redraw the section line - keep them in the timeline
  // but off the map.
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const mapFeatures = useMemo(() => {
    if (!selectedSection) return undefined;
    const line = lineCoords(selectedSection.location);
    if (!line) return selectedSection.features;
    return selectedSection.features.filter((f) => !spansWholeSection(f, line));
  }, [selectedSection]);

  // The pins carry the numbers of the rows in the section's feature list.
  useEffect(() => {
    setFeatureNumbers(selectedSection ? featureNumbers(selectedSection) : null);
    return () => setFeatureNumbers(null);
  }, [selectedSection]);

  // Stable identity - inline mapping in JSX would rebuild the array every
  // render and defeat the map's GeoJSON memoization.
  const proposedFeatures = useMemo(
    () =>
      showProposedFeatures
        ? featureProposals
            .map(proposalToPseudoFeature)
            .filter((f) => f !== null)
        : undefined,
    [showProposedFeatures, featureProposals],
  );

  const input: MapSceneInput = {
    ...pickSceneState(state),
    visibleAreaCircle,
    drawnRegions,
    mapFeatures,
    proposedFeatures,
    notePins,
    draftPin,
    onNoteSelect,
    onOpenThread: isMobile ? openNoteInThread : undefined,
  };

  const cache = useRef<{ input: MapSceneInput; scene: MapScene } | null>(null);
  if (!cache.current || !shallowEqual(cache.current.input, input)) {
    cache.current = { input, scene: buildMapScene(input) };
  }

  return cache.current.scene;
}
