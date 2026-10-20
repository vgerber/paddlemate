import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Bounds, ViewBounds } from "@/lib/geo";
import { useRegionOutline, useRegionsInView } from "@/lib/hooks/useRegions";
import { ALL_REGION_KINDS } from "@/lib/regionKinds";

interface RegionBrowseInput {
  /** The region to frame and outline; only in region mode. */
  regionId: number | undefined;
  /** The viewport to list regions for; only in region mode. */
  mapBounds: ViewBounds | undefined;
  setFocusBounds: (bounds: Bounds) => void;
}

/** Region search: the picked region's outline, and the regions in view that
 * the map draws as clickable. Every level is asked for together, so the map
 * can draw districts and ranges at the zoom where they fit. */
export function useRegionBrowse({
  regionId,
  mapBounds,
  setFocusBounds,
}: RegionBrowseInput) {
  const navigate = useNavigate({ from: "/" });
  // The level chips narrow which regions the map draws.
  const [regionLevel, setRegionLevel] = useState<string | null>(null);

  const { data: regionOutline } = useRegionOutline(regionId);
  const regionBbox = regionOutline?.bbox;
  useEffect(() => {
    if (!regionBbox) return;
    const [west, south, east, north] = regionBbox;
    setFocusBounds([
      [west, south],
      [east, north],
    ]);
  }, [regionBbox, setFocusBounds]);

  const regionsInView = useRegionsInView(
    mapBounds,
    regionLevel ? [regionLevel] : ALL_REGION_KINDS,
  );
  const selectRegion = useCallback(
    (id: number) =>
      navigate({
        search: (prev) => ({ ...prev, mode: "region", region: id }),
        replace: true,
      }),
    [navigate],
  );

  return {
    regionOutline,
    regionChoices: regionsInView.regions,
    countryBorders: regionsInView.countries,
    regionsLoading: regionsInView.loading,
    regionsHiddenKinds: regionsInView.hiddenKinds,
    selectRegion,
    regionLevel,
    setRegionLevel,
  };
}
