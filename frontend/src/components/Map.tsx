import { useEffect, useRef } from "react";
import MapGL, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, SectionWithFeatures } from "@/lib/api";

const FEATURE_COLORS: Record<string, string> = {
  whitewater: "#ffb4ab",
  hole: "#ff6b6b",
  siphon: "#ff4444",
  waterfall: "#8bd1e8",
  freestyle_spot: "#c2cf47",
  put_in: "#b0ceb8",
  take_out: "#b0ceb8",
  portage: "#ffd54f",
  weir: "#ffd54f",
  dam: "#ffaa00",
  obstacle: "#ff8c00",
  bridge: "#bfc8ca",
};

interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
}

export default function WaterwayMap({
  sections,
  features,
  selectedSectionId,
  onSectionClick,
  placingFeature,
  onMapClick,
}: WaterwayMapProps) {
  const mapRef = useRef<MapRef>(null);

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

  const sectionsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (sections ?? []).map((s) => ({
      type: "Feature" as const,
      id: s.id,
      properties: { id: s.id, name: s.name },
      geometry: s.location,
    })),
  };

  const sectionLabelsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (sections ?? []).flatMap((s) => {
      const geom = s.location as unknown as GeoJSON.LineString;
      if (geom?.type !== "LineString" || !geom.coordinates.length) return [];
      const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      const ww = s.features?.find((f) => f.feature_type === "whitewater");
      const diff = (ww?.metadata as Record<string, unknown> | undefined)
        ?.difficulty as string | undefined;
      const label = diff ? `${s.name} \u2022 ${diff}` : s.name;
      return [
        {
          type: "Feature" as const,
          id: s.id,
          properties: { label },
          geometry: { type: "Point" as const, coordinates: mid },
        },
      ];
    }),
  };

  const sectionEndpointsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (sections ?? []).flatMap((s) => {
      const geom = s.location as unknown as GeoJSON.LineString;
      if (geom?.type !== "LineString" || !geom.coordinates.length) return [];
      const first = geom.coordinates[0];
      const last = geom.coordinates[geom.coordinates.length - 1];
      return [
        {
          type: "Feature" as const,
          id: s.id * 2,
          properties: { kind: "put_in", section_id: s.id, name: s.name },
          geometry: { type: "Point" as const, coordinates: first },
        },
        {
          type: "Feature" as const,
          id: s.id * 2 + 1,
          properties: { kind: "take_out", section_id: s.id, name: s.name },
          geometry: { type: "Point" as const, coordinates: last },
        },
      ];
    }),
  };

  const pointFeatures = (features ?? []).filter(
    (f) => f.location.type === "Point",
  );
  const lineFeatures = (features ?? []).filter(
    (f) => f.location.type === "LineString",
  );

  const pointsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: pointFeatures.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        label: f.names[0]?.name ?? f.feature_type.replace(/_/g, " "),
        color: FEATURE_COLORS[f.feature_type] ?? "#8bd1e8",
      },
      geometry: f.location as GeoJSON.Point,
    })),
  };

  const linesGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lineFeatures.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        color: FEATURE_COLORS[f.feature_type] ?? "#8bd1e8",
      },
      geometry: f.location as GeoJSON.LineString,
    })),
  };

  const handleClick = (e: MapLayerMouseEvent) => {
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

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        cursor: placingFeature ? "crosshair" : undefined,
      }}
    >
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 13, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        onClick={handleClick}
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

        <Source id="section-labels" type="geojson" data={sectionLabelsGeoJSON}>
          <Layer
            id="sections-label"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 12,
              "text-font": ["Noto Sans Regular"],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            }}
            paint={{
              "text-color": "#000",
              "text-halo-color": "#fff",
              "text-halo-width": 3,
            }}
          />
        </Source>

        <Source
          id="section-endpoints"
          type="geojson"
          data={sectionEndpointsGeoJSON}
        >
          <Layer
            id="section-put-in"
            type="circle"
            filter={["==", ["get", "kind"], "put_in"]}
            paint={{
              "circle-radius": 5,
              "circle-color": "#4caf50",
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#121416",
            }}
          />
          <Layer
            id="section-take-out"
            type="circle"
            filter={["==", ["get", "kind"], "take_out"]}
            paint={{
              "circle-radius": 5,
              "circle-color": "#f44336",
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#121416",
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
      </MapGL>
    </div>
  );
}
