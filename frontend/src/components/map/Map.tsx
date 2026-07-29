import { useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { circleGeoJSON } from "@/lib/geo";
import { useLanguage } from "@/lib/languagePreference";
import { theme } from "@/lib/theme";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import {
  buildLineFeatureEndpointsGeoJSON,
  buildLineFeatureLabelsGeoJSON,
  buildLineFeaturesGeoJSON,
  buildPointFeaturesGeoJSON,
  buildProposedLineFeaturesGeoJSON,
  buildProposedPointFeaturesGeoJSON,
  buildPutInTakeOutConnectorsGeoJSON,
  buildSectionEndpointsGeoJSON,
  buildSectionLabelsGeoJSON,
  buildSectionsGeoJSON,
} from "./mapLayers";
import { useMapCameraEffects } from "./useMapCameraEffects";

export type { AreaCircle } from "@/lib/geo";
export type { GaugePin } from "./GaugeMarkers";

const { tokens } = theme;

const LEVEL_COLORS: Record<string, string> = tokens.levelColors;

const makePutInSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="${tokens.background}" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" fill="white"/></g></svg>`;
const makeTakeOutSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="${tokens.background}" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" fill="white"/></g></svg>`;

function addMapImages(map: ReturnType<MapRef["getMap"]> | undefined) {
  if (!map) return;
  for (const [level, color] of Object.entries(LEVEL_COLORS)) {
    for (const [id, svg] of [
      [`put-in-icon-${level}`, makePutInSvg(color)],
      [`take-out-icon-${level}`, makeTakeOutSvg(color)],
    ] as [string, string][]) {
      const img = new Image(28, 28);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      img.onload = () => {
        if (!map.hasImage(id)) map.addImage(id, img);
      };
    }
  }
}

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    "esri-satellite": {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "esri-satellite-layer",
      type: "raster" as const,
      source: "esri-satellite",
    },
  ],
};

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
  const [pickMode, setPickMode] = useState<"put-in" | "take-out" | null>(null);
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

  // Memoized per input identity: a new `data` object makes react-map-gl call
  // setData, so rebuilding these every render re-ingests all geometry into
  // MapLibre on each of the many re-renders during a search burst.
  const sectionsGeoJSON = useMemo(
    () => buildSectionsGeoJSON(sections ?? []),
    [sections],
  );
  const language = useLanguage();
  const sectionLabelsGeoJSON = useMemo(
    () =>
      buildSectionLabelsGeoJSON(
        sections ?? [],
        labelMode,
        waterwayNames,
        language,
      ),
    [sections, labelMode, waterwayNames, language],
  );
  const sectionEndpointsGeoJSON = useMemo(
    () => buildSectionEndpointsGeoJSON(sections ?? [], sectionLevels),
    [sections, sectionLevels],
  );
  const connectorsGeoJSON = useMemo(
    () => buildPutInTakeOutConnectorsGeoJSON(sections ?? []),
    [sections],
  );
  const pointsGeoJSON = useMemo(
    () => buildPointFeaturesGeoJSON(features ?? []),
    [features],
  );
  const linesGeoJSON = useMemo(
    () => buildLineFeaturesGeoJSON(features ?? []),
    [features],
  );
  const proposedPointsGeoJSON = useMemo(
    () => buildProposedPointFeaturesGeoJSON(proposedFeatures ?? []),
    [proposedFeatures],
  );
  const lineEndpointsGeoJSON = useMemo(
    () => buildLineFeatureEndpointsGeoJSON(features ?? []),
    [features],
  );
  const proposedLineEndpointsGeoJSON = useMemo(
    () => buildLineFeatureEndpointsGeoJSON(proposedFeatures ?? []),
    [proposedFeatures],
  );
  const lineLabelsGeoJSON = useMemo(
    () => buildLineFeatureLabelsGeoJSON(features ?? []),
    [features],
  );
  const proposedLineLabelsGeoJSON = useMemo(
    () => buildLineFeatureLabelsGeoJSON(proposedFeatures ?? []),
    [proposedFeatures],
  );
  const proposedLinesGeoJSON = useMemo(
    () => buildProposedLineFeaturesGeoJSON(proposedFeatures ?? []),
    [proposedFeatures],
  );

  const handleClick = (e: MapLayerMouseEvent) => {
    if (pickMode) {
      const { lng, lat } = e.lngLat;
      if (pickMode === "put-in") onPickPutIn?.(lat, lng);
      else onPickTakeOut?.(lat, lng);
      setPickMode(null);
      return;
    }
    if (onAreaCircleChange) {
      onAreaCircleChange({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        radiusKm: areaCircle?.radiusKm ?? 20,
      });
      return;
    }
    const sectionFeature = e.features?.find(
      (f) =>
        f.layer.id === "sections-line" ||
        f.layer.id === "sections-line-casing" ||
        f.layer.id === "sections-line-hitbox",
    );
    if (placingFeature && onMapClick) {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
      return;
    }
    if (sectionFeature?.id !== undefined) {
      if (onSectionToggle) {
        onSectionToggle(Number(sectionFeature.id));
      } else if (onSectionClick) {
        onSectionClick(Number(sectionFeature.id));
      }
    }
  };

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
        onChange={onLabelModeChange}
        satellite={satellite}
        onSatelliteChange={setSatellite}
        featureNames={showFeatureNames}
        onFeatureNamesChange={setShowFeatureNames}
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

        {/* Connector lines: put-in/take-out features → nearest section line point */}
        <Source
          id="access-point-connectors"
          type="geojson"
          data={connectorsGeoJSON}
        >
          <Layer
            id="access-point-connectors-line"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 1.5,
              "line-opacity": 0.7,
              "line-dasharray": [3, 2],
            }}
          />
        </Source>

        {/* Declare endpoints first so sections layers can reference it via beforeId */}
        <Source
          id="section-endpoints"
          type="geojson"
          data={sectionEndpointsGeoJSON}
        >
          <Layer
            id="section-endpoints-dot"
            type="circle"
            filter={
              selectedSectionId != null
                ? ["!=", ["get", "section_id"], selectedSectionId]
                : ["==", ["get", "section_id"], -1]
            }
            layout={{
              visibility: selectedSectionId != null ? "visible" : "none",
            }}
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7,
                3,
                10,
                5,
              ],
              "circle-color": [
                "match",
                ["get", "level"],
                "low",
                tokens.levelColors.low,
                "medium",
                tokens.levelColors.medium,
                "high",
                tokens.levelColors.high,
                tokens.levelColors.empty,
              ],
              "circle-opacity": 1,
              "circle-stroke-width": 1,
              "circle-stroke-color": tokens.background,
              "circle-stroke-opacity": 1,
            }}
          />
          <Layer
            id="section-endpoints-icon"
            type="symbol"
            filter={
              selectedSectionId != null
                ? ["==", ["get", "section_id"], selectedSectionId]
                : ["!=", ["get", "section_id"], -1]
            }
            layout={{
              "icon-image": [
                "concat",
                [
                  "match",
                  ["get", "kind"],
                  "put_in",
                  "put-in-icon-",
                  "take-out-icon-",
                ],
                ["coalesce", ["get", "level"], "empty"],
              ],
              "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 10, 1],
              "icon-allow-overlap": true,
              "icon-padding": 4,
            }}
          />
        </Source>

        <Source id="sections" type="geojson" data={sectionsGeoJSON}>
          <Layer
            id="sections-line-hitbox"
            beforeId="section-endpoints-icon"
            type="line"
            paint={{
              "line-color": tokens.background,
              "line-width": 20,
              "line-opacity": 0,
            }}
          />
          <Layer
            id="sections-line-casing"
            beforeId="section-endpoints-icon"
            type="line"
            paint={{
              "line-color": tokens.mapSectionLineCasing,
              "line-width": 6,
              "line-opacity": 0.85,
            }}
          />
          <Layer
            id="sections-line"
            beforeId="section-endpoints-icon"
            type="line"
            paint={{
              "line-color": tokens.mapSectionLine,
              "line-width": 4,
              "line-opacity": 1,
            }}
          />
          <Layer
            id="sections-line-selected"
            beforeId="section-endpoints-icon"
            type="line"
            filter={["==", ["id"], selectedSectionId ?? -1]}
            paint={{
              "line-color": tokens.mapSelectedLine,
              "line-width": 6,
              "line-opacity": 1,
            }}
          />
        </Source>

        <Source id="section-labels" type="geojson" data={sectionLabelsGeoJSON}>
          <Layer
            id="sections-label"
            type="symbol"
            minzoom={7}
            layout={{
              "text-field": ["get", "label"],
              "text-size": 13,
              "text-font": ["Noto Sans Regular"],
              "text-padding": 6,
            }}
            paint={{
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 2,
            }}
          />
        </Source>

        <Source id="feature-lines" type="geojson" data={linesGeoJSON}>
          <Layer
            id="feature-lines-casing"
            type="line"
            paint={{
              "line-color": tokens.background,
              "line-width": 3.5,
              "line-opacity": 0.8,
              "line-offset": ["*", ["get", "stack"], 5],
            }}
          />
          <Layer
            id="feature-lines-layer"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 2,
              "line-dasharray": [2, 2],
              "line-offset": ["*", ["get", "stack"], 5],
            }}
          />
        </Source>

        <Source
          id="feature-line-labels"
          type="geojson"
          data={lineLabelsGeoJSON}
        >
          <Layer
            id="feature-lines-label"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-font": ["Noto Sans Regular"],
              "text-anchor": "top",
              "text-offset": [0, 0.6],
              visibility: showFeatureNames ? "visible" : "none",
            }}
            paint={{
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        <Source
          id="feature-line-endpoints"
          type="geojson"
          data={lineEndpointsGeoJSON}
        >
          <Layer
            id="feature-line-endpoints-circle"
            type="circle"
            paint={{
              "circle-radius": 3.5,
              "circle-color": ["get", "color"],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": tokens.background,
            }}
          />
        </Source>

        <Source id="feature-points" type="geojson" data={pointsGeoJSON}>
          <Layer
            id="feature-points-circle"
            type="circle"
            paint={{
              "circle-radius": 7,
              "circle-color": ["get", "color"],
              "circle-stroke-width": 2,
              "circle-stroke-color": tokens.background,
            }}
          />
          <Layer
            id="feature-points-label"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-font": ["Noto Sans Regular"],
              "text-anchor": "top",
              "text-offset": [0, 0.9],
              visibility: showFeatureNames ? "visible" : "none",
            }}
            paint={{
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {/* River course highlight - subtle guide under the section preview.
            Always mounted (empty when unused) so the layer order stays
            deterministic: highlight < preview < proposed features. */}
        <Source
          id="river-highlight"
          type="geojson"
          data={{
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates:
                riverHighlightCoords && riverHighlightCoords.length >= 2
                  ? riverHighlightCoords
                  : [],
            },
            properties: {},
          }}
        >
          <Layer
            id="river-highlight-line"
            type="line"
            paint={{
              "line-color": tokens.tertiary,
              "line-width": 3,
              "line-opacity": 0.45,
              "line-dasharray": [2, 2],
            }}
          />
        </Source>

        {/* Preview line - snapped/OSM coords when available (also used to
            highlight a checked river), dashed straight put-in→take-out until
            the OSM snap resolves. Always mounted, see above. */}
        <Source
          id="section-preview"
          type="geojson"
          data={{
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates:
                sectionPreviewCoords ??
                (putIn && takeOut
                  ? [
                      [putIn.lon, putIn.lat],
                      [takeOut.lon, takeOut.lat],
                    ]
                  : []),
            },
            properties: {},
          }}
        >
          <Layer
            id="section-preview-casing"
            type="line"
            paint={{
              "line-color": tokens.surfaceLowest,
              "line-width": 7,
              "line-opacity": sectionPreviewCoords ? 0.85 : 0,
            }}
          />
          <Layer
            id="section-preview-line"
            type="line"
            paint={{
              "line-color": tokens.tertiary,
              "line-width": sectionPreviewCoords ? 5 : 2,
              ...(sectionPreviewCoords ? {} : { "line-dasharray": [4, 3] }),
            }}
          />
        </Source>

        {/* Proposed (pending) features - like the confirmed markers but with
            a white ring/casing (confirmed use a dark one), which also keeps
            them visible on satellite imagery */}
        <Source
          id="proposed-feature-lines"
          type="geojson"
          data={proposedLinesGeoJSON}
        >
          <Layer
            id="proposed-feature-lines-casing"
            type="line"
            paint={{
              "line-color": tokens.white,
              "line-width": 6.5,
              "line-opacity": 0.9,
              "line-offset": ["*", ["get", "stack"], 7],
            }}
          />
          <Layer
            id="proposed-feature-lines-rim"
            type="line"
            paint={{
              "line-color": tokens.background,
              "line-width": 4,
              "line-opacity": 0.85,
              "line-offset": ["*", ["get", "stack"], 7],
            }}
          />
          <Layer
            id="proposed-feature-lines-layer"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 2.5,
              "line-dasharray": [3, 2],
              "line-offset": ["*", ["get", "stack"], 7],
            }}
          />
        </Source>

        <Source
          id="proposed-feature-line-labels"
          type="geojson"
          data={proposedLineLabelsGeoJSON}
        >
          <Layer
            id="proposed-feature-lines-label"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-font": ["Noto Sans Regular"],
              "text-anchor": "top",
              "text-offset": [0, 0.6],
              visibility: showFeatureNames ? "visible" : "none",
            }}
            paint={{
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        <Source
          id="proposed-feature-line-endpoints"
          type="geojson"
          data={proposedLineEndpointsGeoJSON}
        >
          <Layer
            id="proposed-feature-line-endpoints-circle"
            type="circle"
            paint={{
              "circle-radius": 3.5,
              "circle-color": ["get", "color"],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": tokens.white,
            }}
          />
        </Source>
        <Source
          id="proposed-feature-points"
          type="geojson"
          data={proposedPointsGeoJSON}
        >
          <Layer
            id="proposed-feature-points-circle"
            type="circle"
            paint={{
              "circle-radius": 7,
              "circle-color": ["get", "color"],
              "circle-stroke-width": 2.5,
              "circle-stroke-color": tokens.white,
            }}
          />
          <Layer
            id="proposed-feature-points-label"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-font": ["Noto Sans Regular"],
              "text-anchor": "top",
              "text-offset": [0, 0.9],
              visibility: showFeatureNames ? "visible" : "none",
            }}
            paint={{
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

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
            data={buildSectionsGeoJSON(
              (sections ?? []).filter((s) => selectedSectionIds.has(s.id)),
            )}
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

        {putIn && (
          <Marker latitude={putIn.lat} longitude={putIn.lon} anchor="center">
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: tokens.tertiary,
                color: tokens.onTertiary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                border: "2px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                pointerEvents: "none",
              }}
            >
              1
            </div>
          </Marker>
        )}
        {takeOut && (
          <Marker
            latitude={takeOut.lat}
            longitude={takeOut.lon}
            anchor="center"
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: tokens.tertiary,
                color: tokens.onTertiary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                border: "2px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                pointerEvents: "none",
              }}
            >
              2
            </div>
          </Marker>
        )}

        {featureVertices && featureVertices.length >= 2 && (
          <Source
            id="feature-draft"
            type="geojson"
            data={
              featureGeomType === "Polygon" && featureVertices.length >= 3
                ? {
                    type: "Feature" as const,
                    geometry: {
                      type: "Polygon" as const,
                      coordinates: [
                        [
                          ...featureVertices.map((v) => [v.lng, v.lat]),
                          [featureVertices[0].lng, featureVertices[0].lat],
                        ],
                      ],
                    },
                    properties: {},
                  }
                : {
                    type: "Feature" as const,
                    geometry: {
                      type: "LineString" as const,
                      coordinates: featureVertices.map((v) => [v.lng, v.lat]),
                    },
                    properties: {},
                  }
            }
          >
            {featureGeomType === "Polygon" && featureVertices.length >= 3 && (
              <Layer
                id="feature-draft-fill"
                type="fill"
                paint={{
                  "fill-color": tokens.tertiary,
                  "fill-opacity": 0.2,
                }}
              />
            )}
            <Layer
              id="feature-draft-line"
              type="line"
              paint={{
                "line-color": tokens.tertiary,
                "line-width": 2,
                "line-dasharray": [3, 2],
              }}
            />
          </Source>
        )}
        {featureVertices?.map((v, i) => (
          <Marker
            key={`fv-${v.lat},${v.lng}`}
            latitude={v.lat}
            longitude={v.lng}
            anchor="center"
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: tokens.tertiary,
                color: tokens.onTertiary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                border: "2px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                pointerEvents: "none",
              }}
            >
              {i + 1}
            </div>
          </Marker>
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
                boxShadow:
                  "0 0 0 3px rgba(139,209,232,0.35), 0 0 10px rgba(139,209,232,0.5)",
                pointerEvents: "none",
              }}
            />
          </Marker>
        )}
      </MapGL>

      {(onPickPutIn || onPickTakeOut) && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            display: "flex",
            gap: 6,
          }}
        >
          {onPickPutIn && (
            <button
              type="button"
              onClick={() =>
                setPickMode((p) => (p === "put-in" ? null : "put-in"))
              }
              style={{
                background:
                  pickMode === "put-in" ? tokens.putIn : "rgba(18,20,22,0.88)",
                color: "white",
                border: `1px solid ${pickMode === "put-in" ? "rgba(0,114,178,0.9)" : "rgba(139,209,232,0.35)"}`,
                borderRadius: 0,
                padding: "4px 10px",
                fontSize: 11,
                fontFamily: '"Space Grotesk", monospace',
                letterSpacing: "0.06em",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ① PUT-IN
            </button>
          )}
          {onPickTakeOut && (
            <button
              type="button"
              onClick={() =>
                setPickMode((p) => (p === "take-out" ? null : "take-out"))
              }
              style={{
                background:
                  pickMode === "take-out"
                    ? tokens.takeOut
                    : "rgba(18,20,22,0.88)",
                color: "white",
                border: `1px solid ${pickMode === "take-out" ? "rgba(213,94,0,0.9)" : "rgba(139,209,232,0.35)"}`,
                borderRadius: 0,
                padding: "4px 10px",
                fontSize: 11,
                fontFamily: '"Space Grotesk", monospace',
                letterSpacing: "0.06em",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ② TAKE-OUT
            </button>
          )}
        </div>
      )}
    </div>
  );
}
