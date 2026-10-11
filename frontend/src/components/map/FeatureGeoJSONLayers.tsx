import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface FeatureGeoJSONLayersProps {
  lines: GeoJSON.FeatureCollection;
  lineLabels: GeoJSON.FeatureCollection;
  lineEndpoints: GeoJSON.FeatureCollection;
  points: GeoJSON.FeatureCollection;
  showNames: boolean;
  /** Proposed (pending) features render like confirmed markers but with a
   * wider casing and a dashed line. */
  proposed?: boolean;
}

/** The four-source stack for feature markers (lines, line labels, line
 * endpoints, points) - one implementation for confirmed and proposed. */
export default function FeatureGeoJSONLayers({
  lines,
  lineLabels,
  lineEndpoints,
  points,
  showNames,
  proposed = false,
}: FeatureGeoJSONLayersProps) {
  const p = proposed ? "proposed-feature" : "feature";
  const ringColor = tokens.white;
  const lineOffset: ["*", ["get", "stack"], number] = [
    "*",
    ["get", "stack"],
    proposed ? 7 : 5,
  ];
  const labelLayout = (
    anchor: "left" | "center",
    offset: [number, number],
  ) => ({
    "text-field": ["get", "label"] as ["get", string],
    "text-size": 12,
    "text-font": ["Noto Sans Bold"],
    "text-anchor": anchor,
    "text-offset": offset,
    "text-justify": "left" as const,
    visibility: (showNames ? "visible" : "none") as "visible" | "none",
  });
  const labelPaint = {
    "text-color": tokens.mapLabelText,
    "text-halo-color": tokens.mapLabelHalo,
    "text-halo-width": 2,
  };

  return (
    <>
      <Source id={`${p}-lines`} type="geojson" data={lines}>
        <Layer
          id={`${p}-lines-casing`}
          type="line"
          paint={{
            "line-color": ringColor,
            "line-width": proposed ? 6.5 : 3.5,
            "line-opacity": proposed ? 0.9 : 0.8,
            "line-offset": lineOffset,
          }}
        />
        {proposed && (
          <Layer
            id={`${p}-lines-rim`}
            type="line"
            paint={{
              "line-color": tokens.background,
              "line-width": 4,
              "line-opacity": 0.85,
              "line-offset": lineOffset,
            }}
          />
        )}
        <Layer
          id={`${p}-lines-layer`}
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": proposed ? 2.5 : 2,
            "line-dasharray": proposed ? [3, 2] : [2, 2],
            "line-offset": lineOffset,
          }}
        />
      </Source>

      <Source id={`${p}-line-labels`} type="geojson" data={lineLabels}>
        <Layer
          id={`${p}-lines-label`}
          type="symbol"
          layout={labelLayout("center", [0, 0.6])}
          paint={labelPaint}
        />
      </Source>

      <Source id={`${p}-line-endpoints`} type="geojson" data={lineEndpoints}>
        <Layer
          id={`${p}-line-endpoints-circle`}
          type="circle"
          paint={{
            "circle-radius": 3.5,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": ringColor,
          }}
        />
      </Source>

      <Source id={`${p}-points`} type="geojson" data={points}>
        <Layer
          id={`${p}-points-circle`}
          type="circle"
          paint={{
            "circle-radius": 3.5,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2.5,
            "circle-stroke-color": ringColor,
          }}
        />
        <Layer
          id={`${p}-points-label`}
          type="symbol"
          layout={labelLayout("left", [0.9, 0])}
          paint={labelPaint}
        />
      </Source>
    </>
  );
}
