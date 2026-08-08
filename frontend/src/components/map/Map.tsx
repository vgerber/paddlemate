import { useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { circleGeoJSON } from "@/lib/geo";
import { theme } from "@/lib/theme";
import DraftLayers, { FeatureDraftLayer } from "./DraftLayers";
import FeatureGeoJSONLayers from "./FeatureGeoJSONLayers";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import MapNumberMarker from "./MapNumberMarker";
import { addMapImages } from "./mapIcons";
import { buildSectionsGeoJSON } from "./mapLayers";
import { SATELLITE_STYLE } from "./mapStyles";
import PickModeButtons from "./PickModeButtons";
import SectionLayers from "./SectionLayers";
import { useMapCameraEffects } from "./useMapCameraEffects";
import { useMapClickHandler } from "./useMapClickHandler";
import { useMapSources } from "./useMapSources";

export type { AreaCircle } from "@/lib/geo";
export type { GaugePin } from "./GaugeMarkers";

const { tokens } = theme;

interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
  // Multi-selection picker mode
  selectedSectionIds?: Set<number>;
  onSectionToggle?: (id: number) => void;
  // Put-in / take-out picking
  putIn?: { lat: number; lon: number } | null;
  takeOut?: { lat: number; lon: number } | null;
  featureVertices?: { lng: number; lat: number }[];
  featureGeomType?: "Point" | "LineString" | "Polygon";
  onPickPutIn?: (lat: number, lon: number) => void;
  onPickTakeOut?: (lat: number, lon: number) => void;
  sectionPreviewCoords?: [number, number][];
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
  gaugePins?: GaugePin[];
  selectedGaugePinId?: number | null;
  onGaugeClick?: (pin: GaugePin) => void;
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  waterwayNames?: Record<number, string>;
  labelMode?: "section" | "river";
  onLabelModeChange?: (mode: "section" | "river") => void;
  sectionLevels?: Record<number, string>;
  /** [lng, lat] to fly to and highlight; set by clicking a feature in the panel. */
  focusedPoint?: [number, number] | null;
  /** Extra px to add to the bottom offset of map controls (satellite/label toggle) so they clear any bottom strip. */
  controlsBottomOffset?: number;
  /** Anchor the map controls to the top instead of the bottom (e.g. when the bottom is covered by a panel). */
  controlsAnchor?: "top" | "bottom";
  /** Pending proposals to show as ghost markers on the map. */
  proposedFeatures?: Feature[];
  /** Reports the current viewport bounds (on load and after each move). */
  onBoundsChange?: (bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }) => void;
  /** River course to highlight subtly (e.g. the OSM riverbed a section will snap to). */
  riverHighlightCoords?: [number, number][] | null;
  /** For maps embedded in scrollable pages: page scroll passes over the map;
   * zooming needs Ctrl/Cmd+scroll (or two fingers on touch). */
  cooperativeGestures?: boolean;
}

export default function WaterwayMap({
  sections,
  features,
  selectedSectionId,
  onSectionClick,
  selectedSectionIds,
  onSectionToggle,
  putIn,
  takeOut,
  featureVertices,
  featureGeomType,
  onPickPutIn,
  onPickTakeOut,
  sectionPreviewCoords,
  placingFeature,
  onMapClick,
  gaugePins,
  selectedGaugePinId,
  onGaugeClick,
  areaCircle,
  areaLocked,
  onAreaCircleChange,
  waterwayNames,
  labelMode = "section",
  onLabelModeChange,
  sectionLevels,
  focusedPoint,
  controlsBottomOffset = 0,
  controlsAnchor,
  proposedFeatures,
  onBoundsChange,
  riverHighlightCoords,
  cooperativeGestures,
}: WaterwayMapProps) {
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

  const { pickMode, togglePickMode, handleClick } = useMapClickHandler({
    onPickPutIn,
    onPickTakeOut,
    areaCircle,
    onAreaCircleChange,
    placingFeature,
    onMapClick,
    onSectionToggle,
    onSectionClick,
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
        cooperativeGestures={cooperativeGestures}
        initialViewState={{ longitude: 13, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={
          satellite
            ? SATELLITE_STYLE
            : "https://tiles.openfreemap.org/styles/liberty"
        }
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
        ]}
      >
        <NavigationControl position="top-right" />

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
                boxShadow: `0 0 0 3px ${tokens.primary}59, 0 0 10px ${tokens.primary}80`,
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
