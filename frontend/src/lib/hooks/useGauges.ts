import { useQuery } from "@tanstack/react-query";
import { gaugeReadingsApi, gaugesApi } from "@/lib/api";

export const gaugeKeys = {
  all: ["gauges"] as const,
  readings: (gaugeId: number, seriesId: number, from?: string) =>
    [...gaugeKeys.all, gaugeId, "series", seriesId, "readings", from] as const,
  search: (q: string | undefined, lat?: number, lon?: number) =>
    [...gaugeKeys.all, "search", q, lat, lon] as const,
};

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
