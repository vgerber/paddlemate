import { useMemo } from "react";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import { useLanguage } from "@/lib/languagePreference";
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

interface UseMapSourcesInput {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  proposedFeatures?: Feature[];
  labelMode: "section" | "river";
  waterwayNames?: Record<number, string>;
  sectionLevels?: Record<number, string>;
}

/**
 * All GeoJSON source data for the map, memoized per input identity: a new
 * `data` object makes react-map-gl call setData, so rebuilding these every
 * render would re-ingest all geometry into MapLibre on each of the many
 * re-renders during a search burst.
 */
export function useMapSources({
  sections,
  features,
  proposedFeatures,
  labelMode,
  waterwayNames,
  sectionLevels,
}: UseMapSourcesInput) {
  const language = useLanguage();

  const sectionsGeoJSON = useMemo(
    () => buildSectionsGeoJSON(sections ?? []),
    [sections],
  );
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
    () => buildPointFeaturesGeoJSON(features ?? [], language),
    [features, language],
  );
  const linesGeoJSON = useMemo(
    () => buildLineFeaturesGeoJSON(features ?? [], language),
    [features, language],
  );
  const lineEndpointsGeoJSON = useMemo(
    () => buildLineFeatureEndpointsGeoJSON(features ?? []),
    [features],
  );
  const lineLabelsGeoJSON = useMemo(
    () => buildLineFeatureLabelsGeoJSON(features ?? [], language),
    [features, language],
  );
  const proposedPointsGeoJSON = useMemo(
    () => buildProposedPointFeaturesGeoJSON(proposedFeatures ?? [], language),
    [proposedFeatures, language],
  );
  const proposedLinesGeoJSON = useMemo(
    () => buildProposedLineFeaturesGeoJSON(proposedFeatures ?? [], language),
    [proposedFeatures, language],
  );
  const proposedLineEndpointsGeoJSON = useMemo(
    () => buildLineFeatureEndpointsGeoJSON(proposedFeatures ?? []),
    [proposedFeatures],
  );
  const proposedLineLabelsGeoJSON = useMemo(
    () => buildLineFeatureLabelsGeoJSON(proposedFeatures ?? [], language),
    [proposedFeatures, language],
  );

  return {
    sectionsGeoJSON,
    sectionLabelsGeoJSON,
    sectionEndpointsGeoJSON,
    connectorsGeoJSON,
    pointsGeoJSON,
    linesGeoJSON,
    lineEndpointsGeoJSON,
    lineLabelsGeoJSON,
    proposedPointsGeoJSON,
    proposedLinesGeoJSON,
    proposedLineEndpointsGeoJSON,
    proposedLineLabelsGeoJSON,
  };
}
