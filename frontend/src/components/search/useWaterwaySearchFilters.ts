import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Region } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRegionOutline } from "@/lib/hooks/useRegions";

export type SearchMode = "name" | "area" | "region";

export interface WaterwaySearchFilters {
  mode: SearchMode;
  setMode: (mode: SearchMode) => void;
  name: string;
  setName: (name: string) => void;
  country: string;
  setCountry: (country: string) => void;
  minDiff: number | "";
  setMinDiff: (diff: number | "") => void;
  maxDiff: number | "";
  setMaxDiff: (diff: number | "") => void;
  /** Region searched in, resolved from the URL's region id. */
  region: Region | null;
  setRegion: (region: Region | null) => void;
  /** Debounced name, empty until it has at least 2 characters. */
  searchName: string;
  /** Query filters for useWaterways, or null when nothing should be fetched. */
  filters: Record<string, unknown> | null;
}

/** Search filter state (mode, name, country, region, difficulty), folded
 * into the useWaterways filter object. Mode and region are read straight
 * from the URL because the map picks them too; the typed filters are held
 * here, debounced, and synced back to the URL. */
export function useWaterwaySearchFilters(
  areaCircle: AreaCircle | null | undefined,
): WaterwaySearchFilters {
  const navigate = useNavigate({ from: "/" });
  const urlSearch = useSearch({ strict: false }) as {
    q?: string;
    country?: string;
    min_diff?: number;
    max_diff?: number;
    mode?: "area" | "region";
    region?: number;
  };

  // Mode and region live in the URL rather than in state: clicking a region
  // on the map picks one too, and both routes have to end up in the same
  // place. The rest of the filters are typed here and only synced outwards.
  const mode: SearchMode =
    urlSearch.mode === "area" || urlSearch.mode === "region"
      ? urlSearch.mode
      : "name";
  const regionId = urlSearch.region;
  const setMode = useCallback(
    (next: SearchMode) =>
      navigate({
        search: (prev) => ({
          ...prev,
          mode: next === "name" ? undefined : next,
          region: next === "region" ? prev.region : undefined,
          ...(next === "area"
            ? {}
            : { lat: undefined, lon: undefined, radius: undefined }),
        }),
        replace: true,
      }),
    [navigate],
  );
  const setRegion = useCallback(
    (picked: Region | null) =>
      navigate({
        search: (prev) => ({
          ...prev,
          mode: "region",
          region: picked?.id ?? undefined,
        }),
        replace: true,
      }),
    [navigate],
  );

  const [name, setName] = useState(urlSearch.q ?? "");
  const [country, setCountry] = useState(urlSearch.country ?? "");
  const [minDiff, setMinDiff] = useState<number | "">(urlSearch.min_diff ?? "");
  const [maxDiff, setMaxDiff] = useState<number | "">(urlSearch.max_diff ?? "");
  // The URL carries the id only; the outline query is what names it, and the
  // map needs it anyway - one request serves the picker and the boundary.
  const { data: regionOutline } = useRegionOutline(regionId);
  const region: Region | null = regionOutline
    ? {
        id: regionOutline.id,
        name: regionOutline.name,
        kind: regionOutline.kind,
        country: regionOutline.country,
        bbox: regionOutline.bbox,
      }
    : null;

  const debouncedName = useDebouncedValue(name);
  const debouncedCountry = useDebouncedValue(country.toUpperCase());
  // A single character matches half the database and fires the full
  // details/water-status fan-out for results nobody wants; wait for 2 chars.
  const searchName = debouncedName.trim().length >= 2 ? debouncedName : "";

  const filters = useMemo(() => {
    if (mode === "region") {
      // No region picked yet - nothing to search in.
      if (regionId == null) return null;
      return {
        region_id: regionId,
        min_difficulty: minDiff !== "" ? minDiff : undefined,
        max_difficulty: maxDiff !== "" ? maxDiff : undefined,
        per_page: 100,
      };
    }
    if (mode === "area") {
      // No circle drawn yet - don't fetch.
      if (!areaCircle) return null;
      return {
        lat: areaCircle.lat,
        lon: areaCircle.lon,
        radius_km: areaCircle.radiusKm,
        min_difficulty: minDiff !== "" ? minDiff : undefined,
        max_difficulty: maxDiff !== "" ? maxDiff : undefined,
        per_page: 100,
      };
    }
    // No criteria - don't fetch all.
    if (!searchName && !debouncedCountry && minDiff === "" && maxDiff === "") {
      return null;
    }
    return {
      name: searchName || undefined,
      country: debouncedCountry || undefined,
      min_difficulty: minDiff !== "" ? minDiff : undefined,
      max_difficulty: maxDiff !== "" ? maxDiff : undefined,
    };
  }, [
    mode,
    areaCircle,
    regionId,
    searchName,
    debouncedCountry,
    minDiff,
    maxDiff,
  ]);

  // Sync filter state to URL
  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        q: debouncedName || undefined,
        country: debouncedCountry || undefined,
        min_diff: minDiff !== "" ? minDiff : undefined,
        max_diff: maxDiff !== "" ? maxDiff : undefined,
      }),
      replace: true,
    });
  }, [navigate, debouncedName, debouncedCountry, minDiff, maxDiff]);

  return {
    mode,
    setMode,
    name,
    setName,
    country,
    setCountry,
    minDiff,
    setMinDiff,
    maxDiff,
    setMaxDiff,
    region,
    setRegion,
    searchName,
    filters,
  };
}
