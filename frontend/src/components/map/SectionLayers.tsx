import type { ExpressionSpecification } from "maplibre-gl";
import { Layer, Source } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";
import { LEVEL_MARKER_MATCH } from "@/lib/waterLevel";

import {
  SECTION_CASING_LAYER,
  SECTION_HITBOX_LAYER,
  SECTION_LINE_LAYER,
} from "./layerIds";

const { tokens } = theme;

interface SectionLayersProps {
  sections: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
  endpoints: GeoJSON.FeatureCollection;
  connectors: GeoJSON.FeatureCollection;
  selectedSectionId?: number | null;
  /** Drawn in teal over the river line. */
  highlighted?: number[];
  /** Drawn dim and left out of clicks and access-point marks. */
  ghost?: number[];
}

type Filter = ExpressionSpecification;

const inIds = (ids: number[], key: Filter): Filter => [
  "in",
  key,
  ["literal", ids],
];
const byId: Filter = ["id"];
const bySection: Filter = ["get", "section_id"];

/** Section lines with casing/hitbox/selection, put-in/take-out endpoint
 * icons, connector lines and section labels. Access points always render
 * above the lines - see the beforeId note below. */
export default function SectionLayers({
  sections,
  labels,
  endpoints,
  connectors,
  selectedSectionId,
  highlighted,
  ghost,
}: SectionLayersProps) {
  const hasGhost = ghost != null && ghost.length > 0;
  const hasHighlight = highlighted != null && highlighted.length > 0;
  // Plain layers skip the ghosts, so a ghost can neither be clicked nor
  // double-drawn.
  // An unset filter is passed to MapLibre as undefined and fails its
  // validation, so "no ghosts" is an explicit match-all.
  const plain: Filter = hasGhost
    ? ["!", inIds(ghost, byId)]
    : ["boolean", true];
  const plainEndpoints: Filter | undefined = hasGhost
    ? ["!", inIds(ghost, bySection)]
    : undefined;
  const withEndpoints = (f: Filter): Filter =>
    plainEndpoints ? ["all", f, plainEndpoints] : f;
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
          filter={withEndpoints(
            selectedSectionId != null
              ? ["!=", ["get", "section_id"], selectedSectionId]
              : ["==", ["get", "section_id"], -1],
          )}
          layout={{
            visibility: selectedSectionId != null ? "visible" : "none",
          }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 10, 5],
            "circle-color": LEVEL_MARKER_MATCH,
            "circle-opacity": 1,
            "circle-stroke-width": 1,
            "circle-stroke-color": tokens.background,
            "circle-stroke-opacity": 1,
          }}
        />
        <Layer
          id="section-endpoints-icon"
          type="symbol"
          filter={withEndpoints(
            selectedSectionId != null
              ? ["==", ["get", "section_id"], selectedSectionId]
              : ["!=", ["get", "section_id"], -1],
          )}
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
          id={SECTION_HITBOX_LAYER}
          beforeId="section-endpoints-dot"
          filter={plain}
          type="line"
          paint={{
            "line-color": tokens.background,
            "line-width": 20,
            "line-opacity": 0,
          }}
        />
        <Layer
          id={SECTION_CASING_LAYER}
          beforeId="section-endpoints-dot"
          filter={plain}
          type="line"
          paint={{
            "line-color": tokens.mapSectionLineCasing,
            "line-width": 11,
            "line-opacity": 0.6,
          }}
        />
        <Layer
          id={SECTION_LINE_LAYER}
          beforeId="section-endpoints-dot"
          filter={plain}
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": tokens.mapRiver,
            "line-width": 9,
            "line-opacity": 1,
          }}
        />
        {/* Each layer is a direct child: Source hands its id to its children
            and a fragment would take it instead of the layers. */}
        {hasGhost && (
          <Layer
            id="sections-ghost-casing"
            beforeId="section-endpoints-dot"
            type="line"
            filter={inIds(ghost, byId)}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": tokens.mapSectionLineCasing,
              "line-width": 7,
              "line-opacity": 0.6,
            }}
          />
        )}
        {hasGhost && (
          <Layer
            id="sections-ghost-line"
            beforeId="section-endpoints-dot"
            type="line"
            filter={inIds(ghost, byId)}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": tokens.mapSectionGhost,
              "line-width": 4,
              "line-opacity": 1,
            }}
          />
        )}
        {hasHighlight && (
          <Layer
            id="sections-highlight-casing"
            beforeId="section-endpoints-dot"
            type="line"
            filter={inIds(highlighted, byId)}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": tokens.mapSectionLineCasing,
              "line-width": 9,
              "line-opacity": 0.9,
            }}
          />
        )}
        {hasHighlight && (
          <Layer
            id="sections-highlight-line"
            beforeId="section-endpoints-dot"
            type="line"
            filter={inIds(highlighted, byId)}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": tokens.mapSectionHighlight,
              "line-width": 5,
              "line-opacity": 1,
            }}
          />
        )}
        <Layer
          id="sections-line-selected-casing"
          beforeId="section-endpoints-dot"
          type="line"
          filter={["==", ["id"], selectedSectionId ?? -1]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": tokens.mapSectionLineCasing,
            "line-width": 10,
            "line-opacity": 1,
          }}
        />
        <Layer
          id="sections-line-selected"
          beforeId="section-endpoints-dot"
          type="line"
          filter={["==", ["id"], selectedSectionId ?? -1]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": tokens.mapSelectedLine,
            "line-width": 5,
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
            "text-color": tokens.mapLabelText,
            "text-halo-color": tokens.mapLabelHalo,
            "text-halo-width": 2,
          }}
        />
      </Source>
    </>
  );
}
