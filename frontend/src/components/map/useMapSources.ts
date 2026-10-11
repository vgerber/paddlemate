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
  buildRegionLabelsGeoJSON,
  buildRegionLitGeoJSON,
  buildSectionEndpointsGeoJSON,
  buildSectionLabelsGeoJSON,
  buildSectionsGeoJSON,
} from "./mapLayers";
import { type Bbox, visibleRegions } from "./regionGeometry";

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
  /** The map view, west/south/east/north, for thinning the regions. */
  viewBounds?: Bbox | null;
  /** The region lit while its row in the choice card has focus. */
  litRegionId?: number | null;
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
  viewBounds = null,
  litRegionId = null,
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

  const shownRegions = useMemo(
    () => visibleRegions(regionChoices ?? [], viewBounds, pickedRegion?.id),
    [regionChoices, viewBounds, pickedRegion?.id],
  );
  const regionChoicesGeoJSON = useMemo(
    () => buildRegionChoicesGeoJSON(shownRegions, pickedRegion?.id),
    [shownRegions, pickedRegion?.id],
  );
  const regionLabelsGeoJSON = useMemo(
    () => buildRegionLabelsGeoJSON(shownRegions, pickedRegion),
    [shownRegions, pickedRegion],
  );
  const regionLitGeoJSON = useMemo(
    () => buildRegionLitGeoJSON(regionChoices, pickedRegion, litRegionId),
    [regionChoices, pickedRegion, litRegionId],
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
    regionLabelsGeoJSON,
    regionLitGeoJSON,
    pickedRegionGeoJSON,
    countryBordersGeoJSON,
  };
}
