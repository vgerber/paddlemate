import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, Section } from "@/lib/api";

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
  sections?: Section[];
  features?: Feature[];
  placingFeature?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
}

export default function WaterwayMap({
  sections,
  features,
  placingFeature,
  onMapClick,
}: WaterwayMapProps) {
  const sectionsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (sections ?? []).map((s) => ({
      type: "Feature" as const,
      id: s.id,
      properties: { id: s.id, name: s.name },
      geometry: s.location,
    })),
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

  const handleClick = (e: MapMouseEvent) => {
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
      <Map
        initialViewState={{ longitude: 2.3522, latitude: 46.8566, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        onClick={handleClick}
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
      </Map>
    </div>
  );
}
