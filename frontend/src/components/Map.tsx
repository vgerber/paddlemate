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
import type { components } from "@/lib/api/schema";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_COLORS: Record<WaterLevel, string> = {
  empty: "#9eaab0",
  low: "#4caf50",
  medium: "#ff9800",
  high: "#f44336",
};

// Okabe-Ito color-blind safe palette
const FEATURE_COLORS: Record<string, string> = {
  whitewater: "#CC79A7", // reddish purple
  hole: "#D55E00", // vermillion
  siphon: "#D55E00", // vermillion
  waterfall: "#56B4E9", // sky blue
  freestyle_spot: "#F0E442", // yellow
  put_in: "#0072B2", // blue
  take_out: "#D55E00", // vermillion
  portage: "#E69F00", // orange
  weir: "#E69F00", // orange
  dam: "#E69F00", // orange
  obstacle: "#CC79A7", // reddish purple
  bridge: "#bfc8ca", // neutral gray
};

export interface GaugePin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  level: WaterLevel;
}

export interface AreaCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

/** Generate a GeoJSON polygon approximating a circle (n-sided). */
function circleGeoJSON(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64,
): GeoJSON.FeatureCollection {
  const R = 6371;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dlat = (radiusKm / R) * (180 / Math.PI) * Math.cos(angle);
    const dlon =
      ((radiusKm / R) * (180 / Math.PI) * Math.sin(angle)) /
      Math.cos((lat * Math.PI) / 180);
    coords.push([lon + dlon, lat + dlat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    ],
  };
}

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
  /** When set, the map is in circle-draw mode: click sets center, scroll adjusts radius. */
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  onAreaCircleChange?: (circle: AreaCircle | null) => void;
  /** Lookup of waterwayId → waterway name, used when labelMode is "river". */
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
      const coords = geom.coordinates;
      const sum = coords.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1]],
        [0, 0],
      );
      const mid = [sum[0] / coords.length, sum[1] / coords.length];
      const ww = s.features?.find((f) => f.feature_type === "whitewater");
      const diff = (ww?.metadata as Record<string, unknown> | undefined)
        ?.difficulty as string | undefined;
      const riverName = waterwayNames?.[s.waterway_id] ?? s.name;
      const label =
        labelMode === "river"
          ? diff
            ? `${riverName} \u2022 ${diff}`
            : riverName
          : diff
            ? `${s.name} \u2022 ${diff}`
            : s.name;
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
    // Circle draw mode: clicking sets/clears the center
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
      {/* Label mode toggle */}
      {onLabelModeChange && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: 8,
            zIndex: 10,
            display: "flex",
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            fontSize: 12,
          }}
        >
          {(["section", "river"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onLabelModeChange(m)}
              style={{
                padding: "4px 10px",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                background: labelMode === m ? "#1976d2" : "#fff",
                color: labelMode === m ? "#fff" : "#333",
                transition: "background 0.15s",
              }}
            >
              {m === "section" ? "Section" : "River"}
            </button>
          ))}
        </div>
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

        {(gaugePins ?? []).map((pin) => {
          const isSelected = selectedGaugePinId === pin.id;
          return (
            <Marker
              key={pin.id}
              longitude={pin.lon}
              latitude={pin.lat}
              anchor="center"
            >
              <button
                type="button"
                title={pin.name}
                onClick={() => onGaugeClick?.(pin)}
                style={{
                  width: isSelected ? 18 : 14,
                  height: isSelected ? 18 : 14,
                  borderRadius: "50%",
                  background: LEVEL_COLORS[pin.level],
                  border: isSelected ? "3px solid #fff" : "2px solid #121416",
                  boxShadow: isSelected
                    ? "0 0 0 2px #121416, 0 2px 6px rgba(0,0,0,0.6)"
                    : "0 1px 4px rgba(0,0,0,0.5)",
                  cursor: "pointer",
                  transition: "width 0.1s, height 0.1s",
                  padding: 0,
                }}
              />
            </Marker>
          );
        })}

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
