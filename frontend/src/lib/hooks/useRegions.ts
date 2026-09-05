import { useQuery } from "@tanstack/react-query";
import { regionsApi } from "@/lib/api";

export const regionKeys = {
  all: ["regions"] as const,
  searches: () => [...regionKeys.all, "search"] as const,
  search: (q: string) => [...regionKeys.searches(), q] as const,
  outlines: () => [...regionKeys.all, "outline"] as const,
  outline: (id: number) => [...regionKeys.outlines(), id] as const,
  views: () => [...regionKeys.all, "view"] as const,
  view: (bbox: string) => [...regionKeys.views(), bbox] as const,
};

/** How long the map may keep a viewport's regions before asking again. They
 * only change when OSM does, so this is about pans returning instantly. */
const VIEW_STALE_MS = 5 * 60 * 1000;

/** How long to wait before asking for regions the server is still fetching. */
const FILLING_RETRY_MS = 2000;

/** Imported regions matching a name. Empty until the term is worth a round
 * trip - one letter matches half the catalog. */
export function useRegionSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: regionKeys.search(term),
    queryFn: ({ signal }) => regionsApi.search(term, signal),
    enabled: term.length >= 2,
  });
}

/** One region's boundary. Outlines never change between imports, so this
 * stays fresh for the session. */
export function useRegionOutline(regionId: number | undefined) {
  return useQuery({
    queryKey: regionKeys.outline(regionId ?? 0),
    queryFn: ({ signal }) => regionsApi.outline(regionId as number, signal),
    enabled: regionId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** The regions in the map's current viewport, for the browse layer. Ground
 * the server has not seen is fetched from OSM in the background, so a list
 * that comes back `filling` is polled until it is complete. */
export function useRegionsInView(
  bbox: [number, number, number, number] | undefined,
) {
  const key = bbox?.map((v) => v.toFixed(3)).join(",");
  return useQuery({
    queryKey: regionKeys.view(key ?? ""),
    queryFn: ({ signal }) =>
      regionsApi.inView(bbox as [number, number, number, number], signal),
    enabled: bbox != null,
    staleTime: VIEW_STALE_MS,
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.filling ? FILLING_RETRY_MS : false,
  });
}
