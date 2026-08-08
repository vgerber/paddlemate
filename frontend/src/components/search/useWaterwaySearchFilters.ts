import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { AreaCircle } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export type SearchMode = "name" | "area";

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
  /** Debounced name, empty until it has at least 2 characters. */
  searchName: string;
  /** Query filters for useWaterways, or null when nothing should be fetched. */
  filters: Record<string, unknown> | null;
}

/** Search filter state (mode, name, country, difficulty) seeded from the
 * URL, debounced, folded into the useWaterways filter object and synced
 * back to the URL. */
export function useWaterwaySearchFilters(
  areaCircle: AreaCircle | null | undefined,
): WaterwaySearchFilters {
  const navigate = useNavigate({ from: "/" });
  const urlSearch = useSearch({ strict: false }) as {
    q?: string;
    country?: string;
    min_diff?: number;
    max_diff?: number;
    mode?: "area";
  };

  const [mode, setMode] = useState<SearchMode>(
    urlSearch.mode === "area" ? "area" : "name",
  );
  const [name, setName] = useState(urlSearch.q ?? "");
  const [country, setCountry] = useState(urlSearch.country ?? "");
  const [minDiff, setMinDiff] = useState<number | "">(urlSearch.min_diff ?? "");
  const [maxDiff, setMaxDiff] = useState<number | "">(urlSearch.max_diff ?? "");

  const debouncedName = useDebouncedValue(name);
  const debouncedCountry = useDebouncedValue(country.toUpperCase());
  // A single character matches half the database and fires the full
  // details/water-status fan-out for results nobody wants; wait for 2 chars.
  const searchName = debouncedName.trim().length >= 2 ? debouncedName : "";

  const filters = useMemo(
    () =>
      mode === "area" && areaCircle
        ? {
            lat: areaCircle.lat,
            lon: areaCircle.lon,
            radius_km: areaCircle.radiusKm,
            min_difficulty: minDiff !== "" ? minDiff : undefined,
            max_difficulty: maxDiff !== "" ? maxDiff : undefined,
            per_page: 100,
          }
        : mode === "area"
          ? null // no circle drawn yet - don't fetch
          : searchName || debouncedCountry || minDiff !== "" || maxDiff !== ""
            ? {
                name: searchName || undefined,
                country: debouncedCountry || undefined,
                min_difficulty: minDiff !== "" ? minDiff : undefined,
                max_difficulty: maxDiff !== "" ? maxDiff : undefined,
              }
            : null, // no criteria - don't fetch all
    [mode, areaCircle, searchName, debouncedCountry, minDiff, maxDiff],
  );

  // Sync filter state to URL
  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        q: debouncedName || undefined,
        country: debouncedCountry || undefined,
        min_diff: minDiff !== "" ? minDiff : undefined,
        max_diff: maxDiff !== "" ? maxDiff : undefined,
        mode: mode === "area" ? ("area" as const) : undefined,
        ...(mode === "name"
          ? { lat: undefined, lon: undefined, radius: undefined }
          : {}),
      }),
      replace: true,
    });
  }, [navigate, debouncedName, debouncedCountry, minDiff, maxDiff, mode]);

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
    searchName,
    filters,
  };
}
