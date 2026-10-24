import type { ExpressionSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useTokens } from "@/lib/useTokens";
import { useFeatureNumbers } from "./featureNumbers";

const EMPTY: ReadonlyMap<number, number> = new Map();

/** A numbered pin is the design's 26px disc with its white ring. */
const PIN_R = 11;
const HAS_NUM: ExpressionSpecification = ["has", "num"];

interface FeatureGeoJSONLayersProps {
  lines: GeoJSON.FeatureCollection;
  lineLabels: GeoJSON.FeatureCollection;
  lineEndpoints: GeoJSON.FeatureCollection;
  points: GeoJSON.FeatureCollection;
  showNames: boolean;
  /** The open feature; a line is drawn heavier along its course. */
  selectedId?: number | null;
  /** Proposed (pending) features render like confirmed markers but with a
   * wider casing and a dashed line. */
  proposed?: boolean;
}

/** The collection with each feature's number (matching its row in the card)
 * in its properties. */
function withNumbers(
  fc: GeoJSON.FeatureCollection,
  numbers: ReadonlyMap<number, number>,
): GeoJSON.FeatureCollection {
  if (numbers.size === 0) return fc;
  return {
    ...fc,
    features: fc.features.map((f) => {
      const num = numbers.get(Number(f.properties?.id));
      return num == null ? f : { ...f, properties: { ...f.properties, num } };
    }),
  };
}

/** The four-source stack for feature markers (lines, line labels, line
 * endpoints, points) - one implementation for confirmed and proposed.
 * Confirmed features carry the number of their row in the card; proposals
 * have none. */
export default function FeatureGeoJSONLayers({
  lines,
  lineLabels,
  lineEndpoints,
  points,
  showNames,
  selectedId = null,
  proposed = false,
}: FeatureGeoJSONLayersProps) {
  const tokens = useTokens();
  const open = useFeatureNumbers();
  const numbers = proposed ? EMPTY : open;
  const numberedPoints = useMemo(
    () => withNumbers(points, numbers),
    [points, numbers],
  );
  const numberedLabels = useMemo(
    () => withNumbers(lineLabels, numbers),
    [lineLabels, numbers],
  );

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
    numberedOffset: [number, number],
  ) => ({
    "text-field": ["get", "label"] as ["get", string],
    "text-size": 12,
    "text-font": ["Noto Sans Bold"],
    "text-anchor": anchor,
    "text-offset": [
      "case",
      HAS_NUM,
      ["literal", numberedOffset],
      ["literal", offset],
    ] as ExpressionSpecification,
    "text-justify": "left" as const,
    visibility: (showNames ? "visible" : "none") as "visible" | "none",
  });
  const labelPaint = {
    "text-color": tokens.mapLabelText,
    "text-halo-color": tokens.mapLabelHalo,
    "text-halo-width": 2,
  };
  const numberLayout = {
    "text-field": ["to-string", ["get", "num"]] as ExpressionSpecification,
    "text-size": 12,
    "text-font": ["Noto Sans Bold"],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  };
  const numberPaint = { "text-color": tokens.onPrimary };

  return (
    <>
      <Source id={`${p}-lines`} type="geojson" data={lines}>
        <Layer
          id={`${p}-lines-casing`}
          type="line"
          paint={{
            // Light keeps the white casing (mapSectionLineCasing is white).
            "line-color": tokens.mapSectionLineCasing,
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
        {selectedId != null && (
          <Layer
            id={`${p}-lines-selected`}
            type="line"
            filter={["==", ["get", "id"], selectedId]}
            paint={{
              "line-color": tokens.primary,
              "line-width": 6,
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
        {!proposed && (
          <Layer
            id="feature-lines-hitbox"
            type="line"
            paint={{
              "line-color": tokens.primary,
              "line-opacity": 0,
              "line-width": 22,
              "line-offset": lineOffset,
            }}
          />
        )}
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

      <Source id={`${p}-line-labels`} type="geojson" data={numberedLabels}>
        <Layer
          id={`${p}-lines-pin`}
          type="circle"
          filter={HAS_NUM}
          paint={{
            "circle-radius": PIN_R,
            "circle-color": tokens.primary,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": ringColor,
          }}
        />
        <Layer
          id={`${p}-lines-pin-number`}
          type="symbol"
          filter={HAS_NUM}
          layout={numberLayout}
          paint={numberPaint}
        />
        <Layer
          id={`${p}-lines-label`}
          type="symbol"
          layout={labelLayout("center", [0, 0.6], [0, 1.8])}
          paint={labelPaint}
        />
      </Source>

      <Source id={`${p}-points`} type="geojson" data={numberedPoints}>
        <Layer
          id={`${p}-points-circle`}
          type="circle"
          paint={{
            "circle-radius": ["case", HAS_NUM, PIN_R, 3.5],
            "circle-color": ["case", HAS_NUM, tokens.primary, ["get", "color"]],
            "circle-stroke-width": 2.5,
            "circle-stroke-color": ringColor,
          }}
        />
        {!proposed && (
          <Layer
            id="feature-points-hitbox"
            type="circle"
            paint={{
              "circle-radius": 18,
              "circle-color": tokens.primary,
              "circle-opacity": 0,
            }}
          />
        )}
        <Layer
          id={`${p}-points-number`}
          type="symbol"
          filter={HAS_NUM}
          layout={numberLayout}
          paint={numberPaint}
        />
        <Layer
          id={`${p}-points-label`}
          type="symbol"
          layout={labelLayout("left", [0.9, 0], [1.5, 0])}
          paint={labelPaint}
        />
      </Source>
    </>
  );
}
