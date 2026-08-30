import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface SectionLayersProps {
  sections: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
  endpoints: GeoJSON.FeatureCollection;
  connectors: GeoJSON.FeatureCollection;
  selectedSectionId?: number | null;
}

/** Section lines with casing/hitbox/selection, put-in/take-out endpoint
 * icons, connector lines and section labels. Access points always render
 * above the lines - see the beforeId note below. */
export default function SectionLayers({
  sections,
  labels,
  endpoints,
  connectors,
  selectedSectionId,
}: SectionLayersProps) {
  return (
    <>
      {/* Connector lines: put-in/take-out features to nearest section line point */}
      <Source id="access-point-connectors" type="geojson" data={connectors}>
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

      {/* Declare endpoints first so the section layers can slot underneath
          them via beforeId. Anchoring on the dot (the lowest of the two
          endpoint layers) keeps every access point above the lines: sections
          are chained end to end, so a dot sits exactly where the neighbouring
          section's line runs and would otherwise be painted over. */}
      <Source id="section-endpoints" type="geojson" data={endpoints}>
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 10, 5],
            "circle-color": [
              "match",
              ["get", "level"],
              "low",
              tokens.levels.low.marker,
              "medium",
              tokens.levels.medium.marker,
              "high",
              tokens.levels.high.marker,
              tokens.levels.empty.marker,
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

      <Source id="sections" type="geojson" data={sections}>
        <Layer
          id="sections-line-hitbox"
          beforeId="section-endpoints-dot"
          type="line"
          paint={{
            "line-color": tokens.background,
            "line-width": 20,
            "line-opacity": 0,
          }}
        />
        <Layer
          id="sections-line-casing"
          beforeId="section-endpoints-dot"
          type="line"
          paint={{
            "line-color": tokens.mapSectionLineCasing,
            "line-width": 6,
            "line-opacity": 0.85,
          }}
        />
        <Layer
          id="sections-line"
          beforeId="section-endpoints-dot"
          type="line"
          paint={{
            "line-color": tokens.mapSectionLine,
            "line-width": 4,
            "line-opacity": 1,
          }}
        />
        <Layer
          id="sections-line-selected"
          beforeId="section-endpoints-dot"
          type="line"
          filter={["==", ["id"], selectedSectionId ?? -1]}
          paint={{
            "line-color": tokens.mapSelectedLine,
            "line-width": 6,
            "line-opacity": 1,
          }}
        />
      </Source>

      <Source id="section-labels" type="geojson" data={labels}>
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
    </>
  );
}
