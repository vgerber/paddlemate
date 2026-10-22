import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bounds, ViewBounds } from "@/lib/geo";
import { useRegionOutline, useRegionsInView } from "@/lib/hooks/useRegions";
import { type BrowseKind, kindForSpan } from "@/lib/regionKinds";

interface RegionBrowseInput {
  /** The region to frame and outline; only in region mode. */
  regionId: number | undefined;
  /** The viewport to list regions for; only in region mode. */
  mapBounds: ViewBounds | undefined;
  setFocusBounds: (bounds: Bounds) => void;
}

/** Whether a region's box meets the view; a stale list kept while a pan
 * loads must not count regions that have left it. */
function meetsView(bbox: readonly number[], view: ViewBounds): boolean {
  return (
    bbox[0] <= view.east &&
    bbox[2] >= view.west &&
    bbox[1] <= view.north &&
    bbox[3] >= view.south
  );
}

/** Region search: the picked region's outline, and the regions in view that
 * the map draws as clickable. One kind is drawn at a time: the one pinned in
 * the segmented control, else the one the zoom suggests. */
export function useRegionBrowse({
  regionId,
  mapBounds,
  setFocusBounds,
}: RegionBrowseInput) {
  const navigate = useNavigate({ from: "/" });
  const [pinnedKind, setPinnedKind] = useState<BrowseKind | null>(null);
  // Phone: the region a first tap lit, waiting for "Pick".
  const [previewId, setPreviewId] = useState<number | null>(null);

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

  const span = mapBounds
    ? Math.max(
        mapBounds.east - mapBounds.west,
        mapBounds.north - mapBounds.south,
      )
    : 0;
  const followedKind = kindForSpan(span);
  const activeKind = pinnedKind ?? followedKind;

  const regionsInView = useRegionsInView(mapBounds, [activeKind]);
  // The list kept while a pan loads may hold the previous kind.
  const regionChoices = useMemo(
    () => regionsInView.regions.filter((r) => r.kind === activeKind),
    [regionsInView.regions, activeKind],
  );
  const regionsListed = useMemo(
    () =>
      (mapBounds
        ? regionChoices.filter((r) => meetsView(r.bbox, mapBounds))
        : regionChoices
      )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [regionChoices, mapBounds],
  );
  const previewRegion = regionChoices.find((r) => r.id === previewId) ?? null;

  const selectRegion = useCallback(
    (id: number) => {
      setPreviewId(null);
      // The pick fits the map to the region, which would move the zoom-led
      // kind away from the one just picked: keep it.
      const kind = regionChoices.find((r) => r.id === id)?.kind;
      if (kind) setPinnedKind(kind as BrowseKind);
      return navigate({
        search: (prev) => ({ ...prev, mode: "region", region: id }),
        replace: true,
      });
    },
    [navigate, regionChoices],
  );

  // Tapping the pinned kind again goes back to following the zoom.
  const toggleRegionKind = useCallback((kind: BrowseKind) => {
    setPreviewId(null);
    setPinnedKind((was) => (was === kind ? null : kind));
  }, []);

  return {
    regionOutline,
    regionChoices,
    regionsListed,
    countryBorders: regionsInView.countries,
    regionsLoading: regionsInView.loading,
    regionsHiddenKinds: regionsInView.hiddenKinds.filter(
      (k) => k === activeKind,
    ),
    selectRegion,
    regionKind: activeKind,
    regionKindPinned: pinnedKind != null,
    toggleRegionKind,
    regionPreviewId: previewId,
    regionPreview: previewRegion,
    setRegionPreviewId: setPreviewId,
  };
}
