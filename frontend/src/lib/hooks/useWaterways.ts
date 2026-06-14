import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type CreateFeatureInput,
  commentsApi,
  featuresApi,
  gaugeReadingsApi,
  sectionsApi,
  type WaterwayFilters,
  waterStatusApi,
  waterwaysApi,
} from "@/lib/api";

export const waterwayKeys = {
  all: ["waterways"] as const,
  lists: (filters: WaterwayFilters) =>
    [...waterwayKeys.all, "list", filters] as const,
  detail: (id: number) => [...waterwayKeys.all, id] as const,
  section: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.detail(waterwayId), "sections", sectionId] as const,
  sectionComments: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.section(waterwayId, sectionId), "comments"] as const,
  sectionWaterStatus: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.section(waterwayId, sectionId), "water-status"] as const,
  gaugeReadings: (gaugeId: number, seriesId: number, from?: string) =>
    ["gauges", gaugeId, "series", seriesId, "readings", from] as const,
};

const PER_PAGE = 20;

export function useWaterways(
  filters: Omit<WaterwayFilters, "page"> | null = {},
) {
  return useInfiniteQuery({
    queryKey: waterwayKeys.lists(filters ?? {}),
    queryFn: ({ pageParam }) =>
      waterwaysApi.list({
        ...(filters ?? {}),
        page: pageParam,
        per_page: filters?.per_page ?? PER_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    enabled: filters !== null,
  });
}

export function useWaterway(id: number | null) {
  return useQuery({
    queryKey: waterwayKeys.detail(id ?? 0),
    queryFn: () => waterwaysApi.get(id as number),
    enabled: id !== null,
  });
}

export function useSectionWithFeatures(
  waterwayId: number,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.section(waterwayId, sectionId ?? 0),
    queryFn: () => sectionsApi.get(waterwayId, sectionId as number),
    enabled: sectionId !== null,
  });
}

export function useSectionComments(
  waterwayId: number,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.sectionComments(waterwayId, sectionId ?? 0),
    queryFn: () => commentsApi.listForSection(waterwayId, sectionId as number),
    enabled: sectionId !== null,
  });
}

export function useCreateComment(waterwayId: number, sectionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      commentsApi.createForSection(waterwayId, sectionId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.sectionComments(waterwayId, sectionId),
      }),
  });
}

export function useCreateFeature(waterwayId: number, sectionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFeatureInput) =>
      featuresApi.create(waterwayId, sectionId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.section(waterwayId, sectionId),
      }),
  });
}

export function useWaterStatus(waterwayId: number | null, sectionId: number | null) {
  return useQuery({
    queryKey: waterwayKeys.sectionWaterStatus(waterwayId ?? 0, sectionId ?? 0),
    queryFn: () =>
      waterStatusApi.getForSection(waterwayId as number, sectionId as number),
    enabled: waterwayId !== null && sectionId !== null,
    // Re-fetch every 5 minutes - matches gauge reader poll interval
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches water status for every section in a waterway. Results are
 *  cached normally - reuses data already fetched by SectionListItem/SectionGaugeRows. */
export function useAllSectionWaterStatus(
  waterwayId: number,
  sectionIds: number[],
) {
  return useQueries({
    queries: sectionIds.map((sectionId) => ({
      queryKey: waterwayKeys.sectionWaterStatus(waterwayId, sectionId),
      queryFn: () => waterStatusApi.getForSection(waterwayId, sectionId),
      staleTime: 5 * 60 * 1000,
    })),
  });
}

/** Fetches water status for arbitrary (waterwayId, sectionId) pairs - used for search results. */
export function useSectionWaterStatuses(
  pairs: { waterwayId: number; sectionId: number }[],
) {
  return useQueries({
    queries: pairs.map(({ waterwayId, sectionId }) => ({
      queryKey: waterwayKeys.sectionWaterStatus(waterwayId, sectionId),
      queryFn: () => waterStatusApi.getForSection(waterwayId, sectionId),
      staleTime: 5 * 60 * 1000,
    })),
  });
}

export function useGaugeReadings(
  gaugeId: number | null,
  seriesId: number | null,
  from?: string,
  limit?: number,
) {
  return useQuery({
    queryKey: waterwayKeys.gaugeReadings(gaugeId ?? 0, seriesId ?? 0, from),
    queryFn: () =>
      gaugeReadingsApi.list(gaugeId as number, seriesId as number, from, limit),
    enabled: gaugeId !== null && seriesId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
