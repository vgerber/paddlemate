import { useCallback, useEffect, useRef } from "react";
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { circleGeoJSON } from "@/lib/geo";
import {
  buildLineFeaturesGeoJSON,
  buildPointFeaturesGeoJSON,
  buildSectionEndpointsGeoJSON,
  buildSectionLabelsGeoJSON,
  buildSectionsGeoJSON,
} from "./mapLayers";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";

export type { GaugePin } from "./GaugeMarkers";
export type { AreaCircle } from "@/lib/geo";

interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
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
}

export default function WaterwayMap({
  sections,
  features,
  selectedSectionId,
  onSectionClick,
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
}: WaterwayMapProps) {
  const mapRef = useRef<MapRef>(null);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const icons: [string, string][] = [
      ["put-in-icon", "/icons/put-in.svg"],
      ["take-out-icon", "/icons/take-out.svg"],
    ];
    for (const [id, url] of icons) {
      fetch(url)
        .then((r) => r.text())
        .then((svg) => {
          const img = new Image(28, 28);
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          img.onload = () => {
            if (!map.hasImage(id)) map.addImage(id, img);
          };
        });
    }
  }, []);

  // Fit bounds to all sections
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sections?.length) return;
    const coords: number[][] = [];
    for (const s of sections) {
      const geom = s.location as unknown as GeoJSON.LineString;
      if (geom?.type === "LineString") coords.push(...geom.coordinates);
    }
    if (!coords.length) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, duration: 800 },
    );
  }, [sections]);

  // Fit bounds to selected section
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedSectionId || !sections?.length) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    const geom = section?.location as unknown as GeoJSON.LineString | undefined;
    if (geom?.type !== "LineString" || !geom.coordinates.length) return;
    const lngs = geom.coordinates.map((c) => c[0]);
    const lats = geom.coordinates.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, duration: 600 },
    );
  }, [selectedSectionId, sections]);

  const sectionsGeoJSON = buildSectionsGeoJSON(sections ?? []);
  const sectionLabelsGeoJSON = buildSectionLabelsGeoJSON(
    sections ?? [],
    labelMode,
    waterwayNames,
  );
  const sectionEndpointsGeoJSON = buildSectionEndpointsGeoJSON(sections ?? []);
  const pointsGeoJSON = buildPointFeaturesGeoJSON(features ?? []);
  const linesGeoJSON = buildLineFeaturesGeoJSON(features ?? []);

  const handleClick = (e: MapLayerMouseEvent) => {
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
        f.layer.id === "sections-line" || f.layer.id === "sections-line-casing",
    );
    if (sectionFeature?.id !== undefined && onSectionClick) {
      onSectionClick(Number(sectionFeature.id));
      return;
    }
    if (placingFeature && onMapClick) {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
    }
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
            : undefined,
      }}
    >
      {onLabelModeChange && (
        <LabelModeToggle labelMode={labelMode} onChange={onLabelModeChange} />
      )}
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 13, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        onClick={handleClick}
        onLoad={handleMapLoad}
        interactiveLayerIds={["sections-line", "sections-line-casing"]}
      >
        <NavigationControl position="top-right" />

        <Source id="sections" type="geojson" data={sectionsGeoJSON}>
          <Layer
            id="sections-line-casing"
            type="line"
            paint={{
              "line-color": "#121416",
              "line-width": 5,
              "line-opacity": 0.6,
            }}
          />
          <Layer
            id="sections-line"
            type="line"
            paint={{
              "line-color": "#8bd1e8",
              "line-width": 3,
              "line-opacity": 0.9,
            }}
          />
          <Layer
            id="sections-line-selected"
            type="line"
            filter={["==", ["id"], selectedSectionId ?? -1]}
            paint={{
              "line-color": "#ff9800",
              "line-width": 6,
              "line-opacity": 1,
            }}
          />
        </Source>

        <Source
          id="section-endpoints"
          type="geojson"
          data={sectionEndpointsGeoJSON}
        >
          <Layer
            id="section-endpoints-icon"
            type="symbol"
            minzoom={9}
            layout={{
              "icon-image": [
                "match",
                ["get", "kind"],
                "put_in",
                "put-in-icon",
                "take-out-icon",
              ],
              "icon-size": 1,
              "icon-padding": 4,
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
              "text-color": "#ffffff",
              "text-halo-color": "rgb(21, 37, 52)",
              "text-halo-width": 2,
            }}
          />
        </Source>

        <Source id="feature-lines" type="geojson" data={linesGeoJSON}>
          <Layer
            id="feature-lines-layer"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 2,
              "line-dasharray": [2, 2],
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
              "circle-stroke-color": "#121416",
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
            paint={{ "fill-color": "#1976d2", "fill-opacity": 0.08 }}
          />
          <Layer
            id="area-circle-line"
            type="line"
            paint={{
              "line-color": "#1976d2",
              "line-width": 2,
              ...(areaLocked ? {} : { "line-dasharray": [4, 3] }),
            }}
          />
        </Source>

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
                background: "#1976d2",
                border: "2px solid #fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />
          </Marker>
        )}
      </MapGL>
    </div>
  );
}
