import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const emptyLine = (coordinates: [number, number][]) => ({
  type: "Feature" as const,
  geometry: { type: "LineString" as const, coordinates },
  properties: {},
});

/** River-course highlight and section-preview line for the suggest-section
 * flow. Both sources stay mounted (empty when unused) so the layer order
 * remains deterministic: highlight < preview < proposed features. */
export default function DraftLayers({
  riverHighlightCoords,
  sectionPreviewCoords,
  putIn,
  takeOut,
}: {
  riverHighlightCoords?: [number, number][] | null;
  sectionPreviewCoords?: [number, number][];
  putIn?: { lat: number; lon: number } | null;
  takeOut?: { lat: number; lon: number } | null;
}) {
  return (
    <>
      <Source
        id="river-highlight"
        type="geojson"
        data={emptyLine(
          riverHighlightCoords && riverHighlightCoords.length >= 2
            ? riverHighlightCoords
            : [],
        )}
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
          highlight a checked river), dashed straight put-in to take-out
          until the OSM snap resolves. */}
      <Source
        id="section-preview"
        type="geojson"
        data={emptyLine(
          sectionPreviewCoords ??
            (putIn && takeOut
              ? [
                  [putIn.lon, putIn.lat],
                  [takeOut.lon, takeOut.lat],
                ]
              : []),
        )}
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
    </>
  );
}

/** Dashed outline (and fill for polygons) of the feature geometry being
 * drawn. Mounted separately from DraftLayers because it must stack above
 * the proposed-feature and picker-selection layers. */
export function FeatureDraftLayer({
  vertices,
  geomType,
}: {
  vertices: { lng: number; lat: number }[];
  geomType?: "Point" | "LineString" | "Polygon";
}) {
  if (vertices.length < 2) return null;
  const isPolygon = geomType === "Polygon" && vertices.length >= 3;
  const data = isPolygon
    ? {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              ...vertices.map((v) => [v.lng, v.lat]),
              [vertices[0].lng, vertices[0].lat],
            ],
          ],
        },
        properties: {},
      }
    : emptyLine(vertices.map((v) => [v.lng, v.lat] as [number, number]));

  return (
    <Source id="feature-draft" type="geojson" data={data}>
      {isPolygon && (
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
  );
}
