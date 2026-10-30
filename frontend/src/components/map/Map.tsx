import "./maplibre.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  AttributionControl,
  type MapRef,
  NavigationControl,
  useMap,
} from "react-map-gl/maplibre";
import { useTokens } from "@/lib/hooks/ui/useTokens";
import { type Bbox } from "@/lib/map/geo";
import { AreaCircleLayers, PickerSelectionLayers } from "./AreaAndPickerLayers";
import CountryBorderLayer from "./CountryBorderLayer";
import DraftLayers, { FeatureDraftLayer } from "./DraftLayers";
import FeatureGeoJSONLayers from "./FeatureGeoJSONLayers";
import GaugeMarkers from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import {
  FEATURE_HIT_LAYERS,
  REGION_FILL_LAYER,
  SECTION_HIT_LAYERS,
} from "./layerIds";
import MapCompass from "./MapCompass";
import MapNumberMarker from "./MapNumberMarker";
import { AreaCentreDot, FocusedDot, PointPins } from "./MapPins";
import { addMapImages, answerMissingIcons } from "./mapIcons";
import {
  areaCircleCollection,
  mapCursor,
  pickedSectionsCollection,
  ringTargetFor,
  selectedSectionCollection,
} from "./mapSelection";
import { LIBERTY_STYLE, SATELLITE_STYLE } from "./mapStyles";
import type {
  MapArea,
  MapCamera,
  MapChrome,
  MapDrawing,
  MapGauges,
  MapNotes,
  MapPicking,
  MapRegions,
  WaterwayMapProps,
} from "./mapTypes";
import NoteMarkers from "./NoteMarkers";
import PickModeButtons from "./PickModeButtons";
import RangeRingLayers from "./RangeRingLayers";
import RegionChoicePopup from "./RegionChoicePopup";
import RegionHiddenNote from "./RegionHiddenNote";
import RegionHoverTag, { hoverUnder, type RegionHover } from "./RegionHoverTag";
import RegionLayers from "./RegionLayers";
import SectionLayers from "./SectionLayers";
import TargetRing from "./TargetRing";
import { useAreaKeyboardCentre } from "./useAreaKeyboardCentre";
import { useControlInset } from "./useControlInset";
import { useMapCameraEffects } from "./useMapCameraEffects";
import { useMapClickHandler } from "./useMapClickHandler";
import { useFirstLoadFade, useMapMotion } from "./useMapMotion";
import { useMapSources } from "./useMapSources";
import { useCalmBaseMap, useMutedBaseMap } from "./useMutedBaseMap";

export type { AreaCircle } from "@/lib/map/geo";
export type { GaugePin } from "./GaugeMarkers";
export type {
  MapArea,
  MapCamera,
  MapChrome,
  MapDrawing,
  MapGauges,
  MapNotes,
  MapPadding,
  MapPicking,
  MapRegions,
  MapSectionStates,
  MapSubject,
  PointPin,
  WaterwayMapProps,
} from "./mapTypes";
export type { NotePin } from "./NoteMarkers";
export type { RangeRing } from "./RangeRingLayers";

/** Mounts as the map's first child, before its style adds any layer. */
function MissingIconGuard() {
  const { current: map } = useMap();
  useEffect(() => (map ? answerMissingIcons(map.getMap()) : undefined), [map]);
  return null;
}

/** Hands the MapLibre instance to browser tests, so they can read the paint
 * and data the map really draws. Development builds only. */
function exposeMapForTests(map: MapRef | null) {
  if (import.meta.env.DEV && map) {
    Object.assign(window, { __paddlemateMap: map.getMap() });
  }
}

const NO_CAMERA: MapCamera = {};
const NO_NOTES: MapNotes = {};
const NO_GAUGES: MapGauges = {};
const NO_AREA: MapArea = {};
const NO_REGIONS: MapRegions = {};
const NO_PICKING: MapPicking = {};
const NO_DRAWING: MapDrawing = {};
const NO_CHROME: MapChrome = {};
const NO_ENDPOINTS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export default function WaterwayMap({
  sections,
  features,
  selectedFeatureId,
  onFeatureClick,
  selectedSectionId,
  onSectionClick,
  sectionLevels,
  proposedFeatures,
  pointPins,
  rings,
  notes = NO_NOTES,
  gauges = NO_GAUGES,
  area = NO_AREA,
  regions = NO_REGIONS,
  camera = NO_CAMERA,
  picking = NO_PICKING,
  drawing = NO_DRAWING,
  chrome = NO_CHROME,
}: WaterwayMapProps) {
  const { putIn, takeOut, onPickPutIn, onPickTakeOut, selectedSectionIds } =
    picking;
  const {
    pins: notePins,
    selectedId: selectedNoteId,
    onSelect: onNoteSelect,
    onOpenThread: onNoteOpenThread,
  } = notes;
  const {
    pins: gaugePins,
    selectedId: selectedGaugePinId,
    onClick: onGaugeClick,
  } = gauges;
  const {
    circle: areaCircle,
    locked: areaLocked,
    onChange: onAreaCircleChange,
  } = area;
  const {
    choices: regionChoices,
    picked: regionOutline,
    borders: countryBorders,
    hiddenKinds: hiddenRegionKinds,
    onSelect: onRegionSelect,
    previewId: regionPreviewId,
    onPreview: onRegionPreview,
  } = regions;
  const {
    focusedPoint,
    focusBounds,
    focusPaddingBottom,
    onBoundsChange,
    padding,
    subject,
  } = camera;
  const {
    featureVertices,
    featureGeomType,
    placingFeature,
    onMapClick,
    sectionPreviewCoords,
    sectionStates,
    riverHighlightCoords,
  } = drawing;
  const {
    waterwayNames,
    labelMode = "section",
    onLabelModeChange,
    attributionPosition = "bottom-right",
    cooperativeGestures,
    inset,
    covered,
  } = chrome;
  const minimal = chrome.minimal ?? !!cooperativeGestures;
  const mapRef = useRef<MapRef>(null);
  const tokens = useTokens();
  const [mapLoaded, setMapLoaded] = useState(false);
  // The base style's layers exist long before `load` (which waits for tiles);
  // the calm restyle runs from then, so the light default never paints.
  const [styleReady, setStyleReady] = useState(false);
  // New identity per scheme, which draws the marker icons again.
  const addImages = useCallback(
    (m: Parameters<typeof addMapImages>[0]) => addMapImages(m, tokens),
    [tokens],
  );
  const [satellite, setSatellite] = useState(false);
  const [showFeatureNames, setShowFeatureNames] = useState(true);
  const [viewBounds, setViewBounds] = useState<Bbox | null>(null);
  const [litRegionId, setLitRegionId] = useState<number | null>(null);
  const [hover, setHover] = useState<RegionHover | null>(null);
  const overRegion = hover != null;
  // A section line or feature under the pointer, which a click opens.
  const [overHit, setOverHit] = useState(false);
  useControlInset(mapRef, mapLoaded, inset);
  // The calm restyle goes first: it sets road opacity, which muting lowers.
  useCalmBaseMap(
    mapRef,
    mapLoaded || styleReady,
    !satellite,
    satellite ? "satellite" : "liberty",
  );
  useMutedBaseMap(
    mapRef,
    mapLoaded || styleReady,
    regionChoices != null,
    satellite ? "satellite" : "liberty",
  );
  const { handleMapLoad } = useMapCameraEffects({
    mapRef,
    mapLoaded,
    setMapLoaded,
    addMapImages: addImages,
    sections,
    areaCircle,
    areaLocked,
    selectedSectionId,
    focusedPoint,
    regionFocused: regionOutline != null,
    focusBounds,
    focusPaddingBottom,
    padding,
    subject,
  });

  const {
    sectionsGeoJSON,
    sectionLabelsGeoJSON,
    sectionEndpointsGeoJSON,
    connectorsGeoJSON,
    pointsGeoJSON,
    linesGeoJSON,
    lineEndpointsGeoJSON,
    lineLabelsGeoJSON,
    proposedPointsGeoJSON,
    proposedLinesGeoJSON,
    proposedLineEndpointsGeoJSON,
    proposedLineLabelsGeoJSON,
    regionChoicesGeoJSON,
    regionLabelsGeoJSON,
    regionLitGeoJSON,
    pickedRegionGeoJSON,
    countryBordersGeoJSON,
  } = useMapSources({
    sections,
    features,
    proposedFeatures,
    labelMode,
    waterwayNames,
    sectionLevels,
    regionChoices,
    pickedRegion: regionOutline,
    countryBorders,
    viewBounds,
    litRegionId: litRegionId ?? regionPreviewId ?? hover?.id ?? null,
  });

  const { pickMode, togglePickMode, handleClick, regionMenu, closeRegionMenu } =
    useMapClickHandler({
      onPickPutIn,
      onPickTakeOut,
      areaCircle,
      onAreaCircleChange,
      placingFeature,
      onMapClick,
      onFeatureClick,
      onSectionToggle: picking.onSectionToggle,
      onSectionClick,
      onRegionSelect,
      onRegionPreview,
      regionPreviewId,
    });

  // Leaving the region tab ends the question the popup asked.
  const regionsDrawn = regionChoices != null;
  useEffect(() => {
    if (regionsDrawn) return;
    closeRegionMenu();
    setLitRegionId(null);
  }, [regionsDrawn, closeRegionMenu]);

  const selectedFeature = useMemo(
    () => selectedSectionCollection(sectionsGeoJSON, selectedSectionId),
    [sectionsGeoJSON, selectedSectionId],
  );
  const ringTarget = useMemo(
    () =>
      ringTargetFor(gaugePins, selectedGaugePinId, features, selectedFeatureId),
    [gaugePins, selectedGaugePinId, features, selectedFeatureId],
  );
  const drawColors = useMemo(
    () => ({
      casing: tokens.mapSectionLineCasing,
      line: tokens.mapSelectedLine,
    }),
    [tokens],
  );
  const motion = useMapMotion({
    map: mapLoaded ? (mapRef.current?.getMap() ?? null) : null,
    selectedSectionId,
    hasSelectedFeature: selectedFeature.features.length > 0,
    covered,
    colors: drawColors,
  });
  const fade = useFirstLoadFade(mapLoaded || styleReady);

  // Selected-sections overlay for picker mode, memoized like the rest.
  const pickerSelectionGeoJSON = useMemo(
    () => pickedSectionsCollection(sections, selectedSectionIds),
    [sections, selectedSectionIds],
  );

  const reportBounds = () => {
    const b = mapRef.current?.getBounds();
    if (!b) return;
    setViewBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    onBoundsChange?.({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
  };

  useAreaKeyboardCentre(mapRef, mapLoaded, areaCircle, onAreaCircleChange);

  const circleData = useMemo(
    () => areaCircleCollection(areaCircle),
    [areaCircle],
  );

  return (
    <div
      data-testid="map-root"
      // Keeps its own short fade under reduced motion (see the global rule).
      data-reduced-fade=""
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        ...fade,
        cursor: mapCursor({
          area: onAreaCircleChange != null,
          feature: !!placingFeature,
          pick: !!pickMode,
        }),
      }}
    >
      {!minimal && (
        <LabelModeToggle
          labelMode={labelMode}
          // Without river names the river mode would silently fall back to
          // section names - hide the switch instead of showing a dead control.
          onChange={waterwayNames ? onLabelModeChange : undefined}
          satellite={satellite}
          onSatelliteChange={setSatellite}
          featureNames={showFeatureNames}
          onFeatureNamesChange={
            features?.length || proposedFeatures?.length
              ? setShowFeatureNames
              : undefined
          }
          inset={inset}
        />
      )}
      {hiddenRegionKinds && <RegionHiddenNote kinds={hiddenRegionKinds} />}
      <MapGL
        ref={mapRef}
        // Rendered as a child instead, so it can be compact and placed in a
        // corner nothing else is using.
        attributionControl={false}
        cooperativeGestures={cooperativeGestures}
        initialViewState={{ longitude: 13, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={satellite ? SATELLITE_STYLE : LIBERTY_STYLE}
        onClick={handleClick}
        // A region, section line or feature is clickable wherever it is
        // drawn; say so with the cursor.
        cursor={
          !pickMode &&
          !onAreaCircleChange &&
          (overHit || (overRegion && onRegionSelect))
            ? "pointer"
            : undefined
        }
        onMouseMove={(e) => {
          setHover(hoverUnder(e));
          setOverHit(
            (e.features ?? []).some((f) => f.layer.id !== REGION_FILL_LAYER),
          );
        }}
        onMouseLeave={() => {
          setHover(null);
          setOverHit(false);
        }}
        onStyleData={(e) => {
          if (e.target.getStyle()?.layers?.length) setStyleReady(true);
        }}
        onLoad={() => {
          exposeMapForTests(mapRef.current);
          handleMapLoad();
          reportBounds();
        }}
        onMoveEnd={reportBounds}
        interactiveLayerIds={[
          ...(onFeatureClick ? FEATURE_HIT_LAYERS : []),
          ...SECTION_HIT_LAYERS,
          REGION_FILL_LAYER,
        ]}
      >
        <MissingIconGuard />
        <NavigationControl position="top-right" showCompass={false} />
        {!minimal && <MapCompass inset={inset} />}
        <AttributionControl compact position={attributionPosition} />

        <RegionLayers
          choices={regionChoicesGeoJSON}
          labels={regionLabelsGeoJSON}
          lit={regionLitGeoJSON}
          picked={pickedRegionGeoJSON}
          dimmed={regionOutline != null}
        />

        {hover && onRegionSelect && !pickMode && !regionMenu && (
          <RegionHoverTag hover={hover} />
        )}

        {regionMenu && onRegionSelect && (
          <RegionChoicePopup
            at={regionMenu.at}
            choices={regionMenu.options}
            pickedId={regionOutline?.id ?? regionMenu.pickedId}
            onPick={(regionId) => {
              onRegionSelect(regionId);
              closeRegionMenu();
              setLitRegionId(null);
            }}
            onLight={setLitRegionId}
            onClose={() => {
              closeRegionMenu();
              setLitRegionId(null);
            }}
          />
        )}

        <SectionLayers
          sections={sectionsGeoJSON}
          labels={sectionLabelsGeoJSON}
          endpoints={minimal ? NO_ENDPOINTS : sectionEndpointsGeoJSON}
          connectors={connectorsGeoJSON}
          selectedSectionId={selectedSectionId}
          highlighted={sectionStates?.highlighted}
          ghost={sectionStates?.ghost}
          selectedFeature={selectedFeature}
          motion={motion}
        />

        <FeatureGeoJSONLayers
          lines={linesGeoJSON}
          lineLabels={lineLabelsGeoJSON}
          lineEndpoints={lineEndpointsGeoJSON}
          points={pointsGeoJSON}
          showNames={showFeatureNames}
          selectedId={selectedFeatureId}
        />

        <DraftLayers
          riverHighlightCoords={riverHighlightCoords}
          sectionPreviewCoords={sectionPreviewCoords}
          putIn={putIn}
          takeOut={takeOut}
        />

        <FeatureGeoJSONLayers
          proposed
          lines={proposedLinesGeoJSON}
          lineLabels={proposedLineLabelsGeoJSON}
          lineEndpoints={proposedLineEndpointsGeoJSON}
          points={proposedPointsGeoJSON}
          showNames={showFeatureNames}
        />

        {/* Last of the map layers: a border stays legible over the rivers
            and regions it separates, not under them. */}
        <CountryBorderLayer borders={countryBordersGeoJSON} />

        {rings && rings.length > 0 && <RangeRingLayers rings={rings} />}

        {pointPins && <PointPins pins={pointPins} />}

        {notePins && notePins.length > 0 && (
          <NoteMarkers
            pins={notePins}
            selectedId={selectedNoteId ?? null}
            onSelect={(id) => onNoteSelect?.(id)}
            onOpenThread={onNoteOpenThread}
          />
        )}

        <GaugeMarkers
          pins={gaugePins ?? []}
          selectedId={selectedGaugePinId}
          onClick={onGaugeClick}
        />

        <TargetRing target={ringTarget} />

        <AreaCircleLayers data={circleData} locked={areaLocked} />

        {selectedSectionIds && selectedSectionIds.size > 0 && (
          <PickerSelectionLayers data={pickerSelectionGeoJSON} />
        )}

        {putIn && (
          <MapNumberMarker
            lat={putIn.lat}
            lon={putIn.lon}
            num={1}
            color={tokens.primary}
          />
        )}
        {takeOut && (
          <MapNumberMarker
            lat={takeOut.lat}
            lon={takeOut.lon}
            num={2}
            color={tokens.primary}
          />
        )}

        {featureVertices && (
          <FeatureDraftLayer
            vertices={featureVertices}
            geomType={featureGeomType}
          />
        )}
        {featureVertices?.map(([lng, lat], i) => (
          <MapNumberMarker
            key={`fv-${lat},${lng}`}
            lat={lat}
            lon={lng}
            num={i + 1}
          />
        ))}

        {areaCircle && (
          <AreaCentreDot lon={areaCircle.lon} lat={areaCircle.lat} />
        )}

        {focusedPoint && <FocusedDot point={focusedPoint} />}
      </MapGL>

      {(onPickPutIn || onPickTakeOut) && (
        <PickModeButtons
          pickMode={pickMode}
          onToggle={togglePickMode}
          showPutIn={!!onPickPutIn}
          showTakeOut={!!onPickTakeOut}
          inset={inset}
        />
      )}
    </div>
  );
}
