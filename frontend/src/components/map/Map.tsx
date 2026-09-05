import { useMemo, useRef, useState } from "react";
import MapGL, {
  AttributionControl,
  Layer,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  CountryBorder,
  Feature,
  RegionOutline,
  SectionWithFeatures,
} from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { circleGeoJSON } from "@/lib/geo";
import { theme } from "@/lib/theme";
import CountryBorderLayer from "./CountryBorderLayer";
import DraftLayers, { FeatureDraftLayer } from "./DraftLayers";
import FeatureGeoJSONLayers from "./FeatureGeoJSONLayers";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import MapNumberMarker from "./MapNumberMarker";
import { addMapImages } from "./mapIcons";
import { buildSectionsGeoJSON } from "./mapLayers";
import { LIBERTY_STYLE, SATELLITE_STYLE } from "./mapStyles";
import NoteMarkers, { type NotePin } from "./NoteMarkers";
import PickModeButtons from "./PickModeButtons";
import RegionBrowseLayer from "./RegionBrowseLayer";
import RegionChoicePopup from "./RegionChoicePopup";
import RegionOutlineLayer from "./RegionOutlineLayer";
import SectionLayers from "./SectionLayers";
import { useMapCameraEffects } from "./useMapCameraEffects";
import { useMapClickHandler } from "./useMapClickHandler";
import { useMapSources } from "./useMapSources";

export type { AreaCircle } from "@/lib/geo";
export type { GaugePin } from "./GaugeMarkers";
export type { NotePin } from "./NoteMarkers";

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

/** Clicking the map to choose places: the section put-in/take-out pair and
 * multi-section selection. Present only while a form is picking. */
export interface MapPicking {
  putIn?: { lat: number; lon: number } | null;
  takeOut?: { lat: number; lon: number } | null;
  onPickPutIn?: (lat: number, lon: number) => void;
  onPickTakeOut?: (lat: number, lon: number) => void;
  selectedSectionIds?: Set<number>;
  onSectionToggle?: (id: number) => void;
}

/** Geometry being drafted on the map: feature vertices under construction
 * and the preview/highlight lines of a section in progress. */
export interface MapDrawing {
  featureVertices?: { lng: number; lat: number }[];
  featureGeomType?: "Point" | "LineString" | "Polygon";
  /** Route map clicks to `onMapClick` instead of section selection. */
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
  sectionPreviewCoords?: [number, number][];
  /** River course to highlight subtly (e.g. the OSM riverbed a section will snap to). */
  riverHighlightCoords?: [number, number][] | null;
}

/** Controls and labelling around the map surface, not the data on it. */
export interface MapChrome {
  waterwayNames?: Record<number, string>;
  labelMode?: "section" | "river";
  onLabelModeChange?: (mode: "section" | "river") => void;
  /** Extra px to add to the bottom offset of map controls (satellite/label toggle) so they clear any bottom strip. */
  controlsBottomOffset?: number;
  /** Anchor the map controls to the top instead of the bottom (e.g. when the bottom is covered by a panel). */
  controlsAnchor?: "top" | "bottom";
  /** For maps embedded in scrollable pages: page scroll passes over the map;
   * zooming needs Ctrl/Cmd+scroll (or two fingers on touch). */
  cooperativeGestures?: boolean;
  /** Corner for the attribution. The bottom of a phone screen belongs to the
   * label toggle, the results strip and the filter button, all of which sat
   * on top of it - move it to a free corner there. */
  attributionPosition?: "top-left" | "bottom-right";
}

interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
  sectionLevels?: Record<number, string>;
  /** Pending proposals to show as ghost markers on the map. */
  proposedFeatures?: Feature[];
  gaugePins?: GaugePin[];
  /** Small dot markers (the note composer's draft pin). */
  pointPins?: PointPin[];
  /** Pinned notes, as speech-bubble badges with a text popup. */
  notePins?: NotePin[];
  selectedNoteId?: number | null;
  onNoteSelect?: (id: number | null) => void;
  onNoteOpenThread?: (id: number) => void;
  selectedGaugePinId?: number | null;
  onGaugeClick?: (pin: GaugePin) => void;
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  /** Boundary of the region being searched in, drawn as the search area. */
  regionOutline?: RegionOutline | null;
  /** Regions in the viewport to pick from, drawn behind everything else. */
  regionChoices?: RegionOutline[] | null;
  /** Country borders in the viewport, drawn over everything else. */
  countryBorders?: CountryBorder[] | null;
  onRegionSelect?: (regionId: number) => void;
  /** [lng, lat] to fly to and highlight; set by clicking a feature in the panel. */
  focusedPoint?: [number, number] | null;
  /** [[minLon, minLat], [maxLon, maxLat]] box to fit (e.g. a river's gauges). */
  focusBounds?: [[number, number], [number, number]] | null;
  /** Extra bottom padding (px) for focus moves when an overlay covers the
   * lower part of the canvas (mobile suggest panel). */
  focusPaddingBottom?: number;
  /** Reports the current viewport bounds (on load and after each move). */
  onBoundsChange?: (bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }) => void;
  picking?: MapPicking;
  drawing?: MapDrawing;
  chrome?: MapChrome;
}

const NO_PICKING: MapPicking = {};
const NO_DRAWING: MapDrawing = {};
const NO_CHROME: MapChrome = {};

export default function WaterwayMap({
  sections,
  features,
  selectedSectionId,
  onSectionClick,
  sectionLevels,
  proposedFeatures,
  gaugePins,
  pointPins,
  notePins,
  selectedNoteId,
  onNoteSelect,
  onNoteOpenThread,
  selectedGaugePinId,
  onGaugeClick,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  regionOutline,
  regionChoices,
  countryBorders,
  onRegionSelect,
  focusedPoint,
  focusBounds,
  focusPaddingBottom,
  onBoundsChange,
  picking = NO_PICKING,
  drawing = NO_DRAWING,
  chrome = NO_CHROME,
}: WaterwayMapProps) {
  const { putIn, takeOut, onPickPutIn, onPickTakeOut, selectedSectionIds } =
    picking;
  const {
    featureVertices,
    featureGeomType,
    placingFeature,
    onMapClick,
    sectionPreviewCoords,
    riverHighlightCoords,
  } = drawing;
  const {
    waterwayNames,
    labelMode = "section",
    onLabelModeChange,
    controlsBottomOffset = 0,
    controlsAnchor,
    attributionPosition = "bottom-right",
    cooperativeGestures,
  } = chrome;
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [showFeatureNames, setShowFeatureNames] = useState(true);
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
  } = useMapSources({
    sections,
    features,
    proposedFeatures,
    labelMode,
    waterwayNames,
    sectionLevels,
  });

  const { pickMode, togglePickMode, handleClick, regionMenu, closeRegionMenu } =
    useMapClickHandler({
      onPickPutIn,
      onPickTakeOut,
      areaCircle,
      onAreaCircleChange,
      placingFeature,
      onMapClick,
      onSectionToggle: picking.onSectionToggle,
      onSectionClick,
      onRegionSelect,
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
        bottomOffset={controlsBottomOffset}
        anchor={controlsAnchor}
      />
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
        onLoad={() => {
          handleMapLoad();
          reportBounds();
        }}
        onMoveEnd={reportBounds}
        interactiveLayerIds={[
          "sections-line",
          "sections-line-casing",
          "sections-line-hitbox",
          "region-browse-fill",
        ]}
      >
        <NavigationControl position="top-right" />
        <AttributionControl compact position={attributionPosition} />

        <RegionBrowseLayer
          outlines={regionChoices}
          selectedId={regionOutline?.id}
        />

        <RegionOutlineLayer outline={regionOutline} />

        {regionMenu && onRegionSelect && (
          <RegionChoicePopup
            at={regionMenu.at}
            choices={regionMenu.options}
            onPick={(regionId) => {
              onRegionSelect(regionId);
              closeRegionMenu();
            }}
            onClose={closeRegionMenu}
          />
        )}

        <SectionLayers
          sections={sectionsGeoJSON}
          labels={sectionLabelsGeoJSON}
          endpoints={sectionEndpointsGeoJSON}
          connectors={connectorsGeoJSON}
          selectedSectionId={selectedSectionId}
        />

        <FeatureGeoJSONLayers
          lines={linesGeoJSON}
          lineLabels={lineLabelsGeoJSON}
          lineEndpoints={lineEndpointsGeoJSON}
          points={pointsGeoJSON}
          showNames={showFeatureNames}
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
        <CountryBorderLayer borders={countryBorders} />

        {(pointPins ?? []).map((pin) => (
          <Marker
            key={pin.id}
            longitude={pin.lon}
            latitude={pin.lat}
            anchor="center"
          >
            <div
              title={pin.title}
              style={{
                width: pin.emphasis ? 14 : 10,
                height: pin.emphasis ? 14 : 10,
                borderRadius: "50%",
                background: pin.color,
                border: `2px solid ${theme.tokens.surfaceLowest}`,
                boxShadow: pin.emphasis
                  ? `0 0 0 3px ${pin.color}55`
                  : "0 1px 2px rgba(0,0,0,0.5)",
              }}
            />
          </Marker>
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

        {/* Selected sections overlay for picker mode */}
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
              paint={{ "line-color": tokens.tertiary, "line-width": 5 }}
            />
          </Source>
        )}

        {putIn && <MapNumberMarker lat={putIn.lat} lon={putIn.lon} num={1} />}
        {takeOut && (
          <MapNumberMarker lat={takeOut.lat} lon={takeOut.lon} num={2} />
        )}

        {featureVertices && (
          <FeatureDraftLayer
            vertices={featureVertices}
            geomType={featureGeomType}
          />
        )}
        {featureVertices?.map((v, i) => (
          <MapNumberMarker
            key={`fv-${v.lat},${v.lng}`}
            lat={v.lat}
            lon={v.lng}
            num={i + 1}
          />
        ))}

        {areaCircle && (
          <Marker
            longitude={areaCircle.lon}
            latitude={areaCircle.lat}
            anchor="center"
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: tokens.mapAreaCircle,
                border: `2px solid ${tokens.white}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />
          </Marker>
        )}

        {focusedPoint && (
          <Marker
            longitude={focusedPoint[0]}
            latitude={focusedPoint[1]}
            anchor="center"
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: tokens.primary,
                border: "2px solid rgba(255,255,255,0.9)",
                boxShadow: `0 0 0 3px ${tokens.primary}55, 0 0 10px ${tokens.primary}99`,
                pointerEvents: "none",
              }}
            />
          </Marker>
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
