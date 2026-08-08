import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type WaterwayFilters, waterwaysApi } from "@/lib/api";
import type { components } from "@/lib/api/schema";
import { proposalKeys } from "./useProposals";

type CreateWaterwayBody = components["schemas"]["CreateWaterwayBody"];

export const waterwayKeys = {
  all: ["waterways"] as const,
  lists: (filters: WaterwayFilters) =>
    [...waterwayKeys.all, "list", filters] as const,
  detail: (id: number) => [...waterwayKeys.all, id] as const,
  section: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.detail(waterwayId), "sections", sectionId] as const,
  sectionWaterStatus: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.section(waterwayId, sectionId), "water-status"] as const,
};

const PER_PAGE = 20;

export function useWaterways(
  filters: Omit<WaterwayFilters, "page"> | null = {},
) {
  return useInfiniteQuery({
    queryKey: waterwayKeys.lists(filters ?? {}),
    // The signal aborts stale in-flight requests when the filters change,
    // freeing the browser's connection slots for the current search.
    queryFn: ({ pageParam, signal }) =>
      waterwaysApi.list(
        {
          ...(filters ?? {}),
          page: pageParam,
          per_page: filters?.per_page ?? PER_PAGE,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    enabled: filters !== null,
    // Typing refines the filters on every debounce tick: keep the previous
    // results on screen instead of flashing a spinner, and serve repeated
    // queries (backspacing, re-typing) from cache.
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

export function useWaterway(id: number | null) {
  return useQuery({
    queryKey: waterwayKeys.detail(id ?? 0),
    queryFn: ({ signal }) => waterwaysApi.get(id as number, signal),
    enabled: id !== null,
    // Details (sections + geometry) rarely change; search results remount
    // these queries on every keystroke, so don't refetch each time.
    staleTime: 5 * 60 * 1000,
  });
}

/** Create a waterway (admins get a real 201 waterway; everyone else a
 * proposal). Refresh both views either way. */
export function useCreateWaterway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWaterwayBody) => waterwaysApi.create(body),
    // The suggest panel renders submit failures inline (409 handling).
    meta: { errorHandledLocally: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      qc.invalidateQueries({ queryKey: waterwayKeys.all });
    },
  });
}
