import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { summaryStaleTime } from "@/components/charts/water/summary";
import { gaugeReadingsApi, gaugesApi, waterwaysApi } from "@/lib/api";

export const gaugeKeys = {
  all: ["gauges"] as const,
  summary: (
    gaugeId: number,
    seriesId: number,
    from: string,
    to: string | undefined,
    points: number,
  ) =>
    [
      ...gaugeKeys.all,
      gaugeId,
      "series",
      seriesId,
      "summary",
      from,
      to,
      points,
    ] as const,
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
  catalogRivers: (q: string) =>
    [...gaugeKeys.all, "catalog-rivers", q] as const,
  catalogRiverGauges: (river: string) =>
    [...gaugeKeys.all, "catalog-river-gauges", river] as const,
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

/** Distinct river names from the gauge catalog matching `q` - suggests
 * gauge-backed rivers while typing a new river's name. Pass a debounced
 * value; disabled until the query is at least two characters. */
export function useCatalogRivers(q: string, limit = 6) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: gaugeKeys.catalogRivers(trimmed),
    queryFn: () => gaugesApi.catalogRivers({ q: trimmed, limit }),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/** All catalog stations of one river (exact name, case-insensitive) - lists
 * a gauge-backed river's gauges in the suggest-river panel. */
export function useCatalogRiverGauges(river: string | null) {
  return useQuery({
    queryKey: gaugeKeys.catalogRiverGauges(river ?? ""),
    queryFn: () =>
      gaugesApi.catalogSearch({ river: river as string, limit: 50 }),
    enabled: !!river,
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

/** A series' readings over a period as about `points` buckets (average, low
 * and high), or raw readings when the period holds few. Waits for `points`,
 * which comes from the plot's width. A period that ended before today never
 * changes, so it stays fresh for a day. */
export function useReadingSummary(
  gaugeId: number,
  seriesId: number,
  period: { from: string; to?: string },
  points: number | null,
) {
  return useQuery({
    queryKey: gaugeKeys.summary(
      gaugeId,
      seriesId,
      period.from,
      period.to,
      points ?? 0,
    ),
    queryFn: () =>
      gaugeReadingsApi.summary(gaugeId, seriesId, {
        ...period,
        points: points ?? undefined,
      }),
    enabled: points != null,
    staleTime: summaryStaleTime(period.to),
    placeholderData: keepPreviousData,
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
