import { useQuery } from "@tanstack/react-query";
import { gaugeReadingsApi, gaugesApi, waterwaysApi } from "@/lib/api";

export const gaugeKeys = {
  all: ["gauges"] as const,
  readings: (gaugeId: number, seriesId: number, from?: string) =>
    [...gaugeKeys.all, gaugeId, "series", seriesId, "readings", from] as const,
  search: (q: string | undefined, lat?: number, lon?: number) =>
    [...gaugeKeys.all, "search", q, lat, lon] as const,
  catalogSearch: (
    q: string | undefined,
    lat?: number,
    lon?: number,
    radiusKm?: number,
  ) => [...gaugeKeys.all, "catalog", q, lat, lon, radiusKm] as const,
  waterway: (waterwayId: number) =>
    [...gaugeKeys.all, "waterway", waterwayId] as const,
  map: () => [...gaugeKeys.all, "map"] as const,
};

/** Every gauge as a coverage-map point (used / fetched / available). One shot;
 * points change slowly, so cache generously. */
export function useGaugeMap() {
  return useQuery({
    queryKey: gaugeKeys.map(),
    queryFn: () => gaugesApi.map(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Gauges already linked to any section of a waterway - recommended first
 * when picking a gauge while adding another section. */
export function useWaterwayGauges(waterwayId: number | null) {
  return useQuery({
    queryKey: gaugeKeys.waterway(waterwayId ?? 0),
    queryFn: () => waterwaysApi.gauges(waterwayId as number),
    enabled: waterwayId != null,
    staleTime: 60_000,
  });
}

export function useGaugeReadings(
  gaugeId: number | null,
  seriesId: number | null,
  from?: string,
  limit?: number,
) {
  return useQuery({
    queryKey: gaugeKeys.readings(gaugeId ?? 0, seriesId ?? 0, from),
    queryFn: () =>
      gaugeReadingsApi.list(gaugeId as number, seriesId as number, from, limit),
    enabled: gaugeId !== null && seriesId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

/** Search the full gauge collection (all providers), nearby-first. */
export function useGaugeSearch(
  q: string,
  nearPoint?: { lat: number; lon: number },
  limit = 15,
) {
  return useQuery({
    queryKey: gaugeKeys.search(q || undefined, nearPoint?.lat, nearPoint?.lon),
    queryFn: () =>
      gaugesApi.search({
        q: q || undefined,
        lat: nearPoint?.lat,
        lon: nearPoint?.lon,
        limit,
      }),
    staleTime: 60_000,
  });
}

/** Search all available gauges - existing ones plus catalog stations across
 * every provider - by name and/or proximity. Enabled only when there is a
 * query or a point, so an idle picker does not fetch. */
export function useCatalogGaugeSearch(
  q: string,
  nearPoint?: { lat: number; lon: number },
  radiusKm = 50,
  limit = 20,
) {
  return useQuery({
    queryKey: gaugeKeys.catalogSearch(
      q || undefined,
      nearPoint?.lat,
      nearPoint?.lon,
      radiusKm,
    ),
    queryFn: () =>
      gaugesApi.catalogSearch({
        q: q || undefined,
        lat: nearPoint?.lat,
        lon: nearPoint?.lon,
        radius_km: nearPoint ? radiusKm : undefined,
        limit,
      }),
    enabled: Boolean(q) || Boolean(nearPoint),
    staleTime: 60_000,
  });
}
