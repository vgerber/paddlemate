import { useMemo } from "react";
import type {
  CountryBorder,
  Feature,
  RegionOutline,
  SectionWithFeatures,
} from "@/lib/api";
import { useLanguage } from "@/lib/languagePreference";
import {
  buildCountryBordersGeoJSON,
  buildLineFeatureEndpointsGeoJSON,
  buildLineFeatureLabelsGeoJSON,
  buildLineFeaturesGeoJSON,
  buildPickedRegionGeoJSON,
  buildPointFeaturesGeoJSON,
  buildProposedLineFeaturesGeoJSON,
  buildProposedPointFeaturesGeoJSON,
  buildPutInTakeOutConnectorsGeoJSON,
  buildRegionChoicesGeoJSON,
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
  regionChoices?: RegionOutline[] | null;
  pickedRegion?: RegionOutline | null;
  countryBorders?: CountryBorder[] | null;
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
  regionChoices,
  pickedRegion,
  countryBorders,
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

  const regionChoicesGeoJSON = useMemo(
    () => buildRegionChoicesGeoJSON(regionChoices, pickedRegion?.id),
    [regionChoices, pickedRegion?.id],
  );
  const pickedRegionGeoJSON = useMemo(
    () => buildPickedRegionGeoJSON(pickedRegion),
    [pickedRegion],
  );
  const countryBordersGeoJSON = useMemo(
    () => buildCountryBordersGeoJSON(countryBorders),
    [countryBorders],
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
    regionChoicesGeoJSON,
    pickedRegionGeoJSON,
    countryBordersGeoJSON,
  };
}
