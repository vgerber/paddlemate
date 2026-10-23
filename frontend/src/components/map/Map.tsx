import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  AttributionControl,
  Layer,
  type MapRef,
  NavigationControl,
  Source,
  useMap,
} from "react-map-gl/maplibre";
import type {
  CountryBorder,
  Feature,
  RegionOutline,
  SectionWithFeatures,
} from "@/lib/api";
import {
  type AreaCircle,
  type Bbox,
  type Bounds,
  circleGeoJSON,
  type LngLat,
  type ViewBounds,
} from "@/lib/geo";
import { theme } from "@/lib/theme";
import AccessibleMarker from "./AccessibleMarker";
import CountryBorderLayer from "./CountryBorderLayer";
import DraftLayers, { FeatureDraftLayer } from "./DraftLayers";
import FeatureGeoJSONLayers from "./FeatureGeoJSONLayers";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import {
  FEATURE_HIT_LAYERS,
  REGION_FILL_LAYER,
  SECTION_HIT_LAYERS,
} from "./layerIds";
import MapCompass from "./MapCompass";
import MapNumberMarker from "./MapNumberMarker";
import MarkerHit from "./MarkerHit";
import { addMapImages, answerMissingIcons } from "./mapIcons";
import { buildSectionsGeoJSON } from "./mapLayers";
import { LIBERTY_STYLE, SATELLITE_STYLE } from "./mapStyles";
import NoteMarkers, { type NotePin } from "./NoteMarkers";
import PickModeButtons from "./PickModeButtons";
import RangeRingLayers, { type RangeRing } from "./RangeRingLayers";
import RegionChoicePopup from "./RegionChoicePopup";
import RegionHiddenNote from "./RegionHiddenNote";
import RegionHoverTag, { hoverUnder, type RegionHover } from "./RegionHoverTag";
import RegionLayers from "./RegionLayers";
import SectionLayers from "./SectionLayers";
import { useControlInset } from "./useControlInset";
import { useMapCameraEffects } from "./useMapCameraEffects";
import { useMapClickHandler } from "./useMapClickHandler";
import { useMapSources } from "./useMapSources";
import { useCalmBaseMap, useMutedBaseMap } from "./useMutedBaseMap";

export type { AreaCircle } from "@/lib/geo";
export type { GaugePin } from "./GaugeMarkers";
export type { NotePin } from "./NoteMarkers";
export type { RangeRing } from "./RangeRingLayers";

export interface PointPin {
  id: string;
  lon: number;
  lat: number;
  color: string;
  title?: string;
  /** Larger with a halo - the pin currently being placed. */
  emphasis?: boolean;
}

const { tokens } = theme;

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

/** Clicking the map to choose places: the section put-in/take-out pair and
 * multi-section selection. Present only while a form is picking. */
export interface MapPicking {
  putIn?: { lat: number; lon: number } | null;
  takeOut?: { lat: number; lon: number } | null;
  onPickPutIn?: (point: LngLat) => void;
  onPickTakeOut?: (point: LngLat) => void;
  selectedSectionIds?: Set<number>;
  onSectionToggle?: (id: number) => void;
}

/** Geometry being drafted on the map: feature vertices under construction
 * and the preview/highlight lines of a section in progress. */
export interface MapDrawing {
  featureVertices?: LngLat[];
  featureGeomType?: "Point" | "LineString" | "Polygon";
  /** Route map clicks to `onMapClick` instead of section selection. */
  placingFeature?: boolean;
  onMapClick?: (point: LngLat) => void;
  sectionPreviewCoords?: [number, number][];
  /** Sections drawn in a state other than the plain river line. */
  sectionStates?: MapSectionStates;
  /** River course to highlight subtly (e.g. the OSM riverbed a section will snap to). */
  riverHighlightCoords?: [number, number][] | null;
}

/** Section ids drawn as the subject of a screen (teal) and as context only
 * (dim, not clickable, no access-point marks). Every other section keeps the
 * plain river line. Pass memoised arrays. */
export interface MapSectionStates {
  highlighted?: number[];
  ghost?: number[];
}

/** Controls and labelling around the map surface, not the data on it. */
export interface MapChrome {
  waterwayNames?: Record<number, string>;
  labelMode?: "section" | "river";
  onLabelModeChange?: (mode: "section" | "river") => void;
  /** For maps embedded in scrollable pages: page scroll passes over the map;
   * zooming needs Ctrl/Cmd+scroll (or two fingers on touch). */
  cooperativeGestures?: boolean;
  /** Corner for the attribution. The bottom of a phone screen belongs to the
   * label toggle, the results strip and the filter button, all of which sat
   * on top of it - move it to a free corner there. */
  attributionPosition?: "top-left" | "bottom-right";
  /** Only the water, the section line, the markers and the zoom keys: no
   * layer switcher, compass or access-point arrows. Defaults on for maps
   * embedded in a scrolling page or a wizard (`cooperativeGestures`). */
  minimal?: boolean;
  /** Keeps the zoom, compass, layer toggle and attribution inside these
   * edges (px in from each side of the map) instead of the map's own
   * corners: the free area of a canvas screen, so no card covers them. */
  inset?: MapPadding;
}

/** What the camera frames: refit when `key` changes, and again (unless it is
 * already inside) when the padding changes. While a subject is set the camera
 * no longer fits all sections or the selected section by itself. */
export interface MapSubject {
  key: string;
  /** [[minLon, minLat], [maxLon, maxLat]] */
  bounds: Bounds;
  maxZoom?: number;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Where the map looks, and where it reports it is looking. */
export interface MapCamera {
  /** Fit padding in px; the free map area on a canvas screen. Defaults to the
   * fixed per-move values. Replaces `focusPaddingBottom` when given. */
  padding?: MapPadding;
  subject?: MapSubject | null;
  /** [lng, lat] to fly to and highlight; set by clicking a feature in the panel. */
  focusedPoint?: [number, number] | null;
  /** [[minLon, minLat], [maxLon, maxLat]] box to fit (e.g. a river's gauges). */
  focusBounds?: Bounds | null;
  /** Extra bottom padding (px) for focus moves when an overlay covers the
   * lower part of the canvas (mobile suggest panel). */
  focusPaddingBottom?: number;
  /** Reports the current viewport bounds (on load and after each move). */
  onBoundsChange?: (bounds: ViewBounds) => void;
}

/** Notes pinned to the water, and which one is open. */
export interface MapNotes {
  pins?: NotePin[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  onOpenThread?: (id: number) => void;
}

/** Gauge markers, and which one is selected. */
export interface MapGauges {
  pins?: GaugePin[];
  selectedId?: number | null;
  onClick?: (pin: GaugePin) => void;
}

/** The area-search circle. Omitting onChange makes it read-only. */
export interface MapArea {
  circle?: AreaCircle | null;
  locked?: boolean;
  onChange?: (circle: AreaCircle | null) => void;
}

/** Region browsing: the regions on offer, the one picked, and the country
 * borders drawn over them. */
export interface MapRegions {
  choices?: RegionOutline[] | null;
  picked?: RegionOutline | null;
  borders?: CountryBorder[] | null;
  /** Kinds in view too wide to draw; the map says so and how to see them. */
  hiddenKinds?: string[];
  onSelect?: (regionId: number) => void;
  /** Phone: the region a first tap lit, and how to set it. */
  previewId?: number | null;
  onPreview?: (regionId: number | null) => void;
}

export interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  /** The open feature: drawn heavier along its line. */
  selectedFeatureId?: number | null;
  /** A tap on a confirmed feature; it wins over the section beneath it. */
  onFeatureClick?: (id: number) => void;
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
  sectionLevels?: Record<number, string>;
  /** Pending proposals to show as ghost markers on the map. */
  proposedFeatures?: Feature[];
  /** Small dot markers (the note composer's draft pin). */
  pointPins?: PointPin[];
  /** Named places with the ground they reach (a trip's bases). */
  rings?: RangeRing[];
  camera?: MapCamera;
  notes?: MapNotes;
  gauges?: MapGauges;
  area?: MapArea;
  regions?: MapRegions;
  picking?: MapPicking;
  drawing?: MapDrawing;
  chrome?: MapChrome;
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
  } = chrome;
  const minimal = chrome.minimal ?? !!cooperativeGestures;
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [showFeatureNames, setShowFeatureNames] = useState(true);
  const [viewBounds, setViewBounds] = useState<Bbox | null>(null);
  const [litRegionId, setLitRegionId] = useState<number | null>(null);
  const [hover, setHover] = useState<RegionHover | null>(null);
  const overRegion = hover != null;
  useControlInset(mapRef, mapLoaded, inset);
  // The calm restyle goes first: it sets road opacity, which muting lowers.
  useCalmBaseMap(
    mapRef,
    mapLoaded,
    !satellite,
    satellite ? "satellite" : "liberty",
  );
  useMutedBaseMap(
    mapRef,
    mapLoaded,
    regionChoices != null,
    satellite ? "satellite" : "liberty",
  );
  const { handleMapLoad } = useMapCameraEffects({
    mapRef,
    mapLoaded,
    setMapLoaded,
    addMapImages,
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

  // Selected-sections overlay for picker mode, memoized like the rest.
  const pickerSelectionGeoJSON = useMemo(
    () =>
      buildSectionsGeoJSON(
        (sections ?? []).filter((s) => selectedSectionIds?.has(s.id)),
      ),
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

  const circleData = areaCircle
    ? circleGeoJSON(areaCircle.lat, areaCircle.lon, areaCircle.radiusKm)
    : ({
        type: "FeatureCollection",
        features: [],
      } as GeoJSON.FeatureCollection);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        cursor: onAreaCircleChange
          ? "crosshair"
          : placingFeature
            ? "crosshair"
            : pickMode
              ? "crosshair"
              : undefined,
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
        // A region is clickable wherever it is drawn; say so with the cursor.
        cursor={
          overRegion && onRegionSelect && !pickMode && !onAreaCircleChange
            ? "pointer"
            : undefined
        }
        onMouseMove={(e) => setHover(hoverUnder(e))}
        onMouseLeave={() => setHover(null)}
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

        {(pointPins ?? []).map((pin) => (
          <AccessibleMarker
            key={pin.id}
            longitude={pin.lon}
            latitude={pin.lat}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <MarkerHit title={pin.title}>
              <div
                style={{
                  width: pin.emphasis ? 14 : 10,
                  height: pin.emphasis ? 14 : 10,
                  borderRadius: "50%",
                  background: pin.color,
                  border: `2px solid ${theme.tokens.surfaceLowest}`,
                  boxShadow: pin.emphasis
                    ? `0 0 0 3px ${pin.color}55`
                    : tokens.elevation.marker,
                }}
              />
            </MarkerHit>
          </AccessibleMarker>
        ))}

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

        <Source id="area-circle" type="geojson" data={circleData}>
          <Layer
            id="area-circle-fill"
            type="fill"
            paint={{ "fill-color": tokens.mapAreaCircle, "fill-opacity": 0.08 }}
          />
          <Layer
            id="area-circle-line"
            type="line"
            paint={{
              "line-color": tokens.mapAreaCircle,
              "line-width": 2,
              ...(areaLocked ? {} : { "line-dasharray": [4, 3] }),
            }}
          />
        </Source>

        {selectedSectionIds && selectedSectionIds.size > 0 && (
          <Source
            id="sections-picker-sel"
            type="geojson"
            data={pickerSelectionGeoJSON}
          >
            <Layer
              id="sections-picker-sel-casing"
              type="line"
              paint={{
                "line-color": tokens.mapSectionLineCasing,
                "line-width": 7,
                "line-opacity": 0.85,
              }}
            />
            <Layer
              id="sections-picker-sel-line"
              type="line"
              paint={{ "line-color": tokens.primary, "line-width": 5 }}
            />
          </Source>
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
          <AccessibleMarker
            longitude={areaCircle.lon}
            latitude={areaCircle.lat}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <MarkerHit>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: tokens.mapAreaCircle,
                  border: `2px solid ${tokens.white}`,
                  boxShadow: tokens.elevation.marker,
                }}
              />
            </MarkerHit>
          </AccessibleMarker>
        )}

        {focusedPoint && (
          <AccessibleMarker
            longitude={focusedPoint[0]}
            latitude={focusedPoint[1]}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <MarkerHit>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: tokens.primary,
                  border: `2px solid ${tokens.surface}`,
                  boxShadow: `0 0 0 3px ${tokens.primary}55, 0 0 10px ${tokens.primary}99`,
                }}
              />
            </MarkerHit>
          </AccessibleMarker>
        )}
      </MapGL>

      {(onPickPutIn || onPickTakeOut) && (
        <PickModeButtons
          pickMode={pickMode}
          onToggle={togglePickMode}
          showPutIn={!!onPickPutIn}
          showTakeOut={!!onPickTakeOut}
        />
      )}
    </div>
  );
}
