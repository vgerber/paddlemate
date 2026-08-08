import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type CreateDescentRequest,
  type DescentFilters,
  descentsApi,
  type PatchDescentRequest,
  sectionsApi,
} from "@/lib/api";

export const descentKeys = {
  all: ["descents"] as const,
  lists: () => [...descentKeys.all, "list"] as const,
  list: (filters: DescentFilters) => [...descentKeys.lists(), filters] as const,
  infinite: (filters: DescentFilters) =>
    [...descentKeys.lists(), "infinite", filters] as const,
  sectionCounts: (waterwayId: number) =>
    [...descentKeys.lists(), "section-counts", waterwayId] as const,
  detail: (id: number) => [...descentKeys.all, id] as const,
};

export function useDescents(filters: DescentFilters = {}, enabled = true) {
  return useQuery({
    queryKey: descentKeys.list(filters),
    queryFn: () => descentsApi.list(filters),
    enabled,
  });
}

export function useInfiniteDescents(
  filters: Omit<DescentFilters, "page"> = {},
) {
  return useInfiniteQuery({
    queryKey: descentKeys.infinite(filters),
    queryFn: ({ pageParam }) =>
      descentsApi.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.total_pages ? last.page + 1 : undefined,
  });
}

/** Descent count per section of a waterway, as a section_id -> count map. */
export function useSectionDescentCounts(waterwayId: number | null) {
  return useQuery({
    queryKey: descentKeys.sectionCounts(waterwayId ?? 0),
    queryFn: () => sectionsApi.descentCounts(waterwayId as number),
    enabled: waterwayId != null,
    select: (rows): Record<number, number> =>
      Object.fromEntries(rows.map((r) => [r.section_id, r.count])),
  });
}

export function useMyDescents(
  filters: Omit<DescentFilters, "scope"> = {},
  enabled = true,
) {
  return useDescents({ ...filters, scope: "owned" }, enabled);
}

export function useDescent(id: number | null) {
  return useQuery({
    queryKey: descentKeys.detail(id ?? 0),
    queryFn: () => descentsApi.get(id as number),
    enabled: id !== null,
  });
}

export function useCreateDescent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDescentRequest) => descentsApi.create(body),
    // DescentForm renders the failure inline next to the save button.
    meta: { errorHandledLocally: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: descentKeys.lists() }),
  });
}

export function usePatchDescent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatchDescentRequest }) =>
      descentsApi.update(id, body),
    // DescentForm renders the failure inline next to the save button.
    meta: { errorHandledLocally: true },
    onSuccess: (data) => {
      qc.setQueryData(descentKeys.detail(data.id), data);
      qc.invalidateQueries({ queryKey: descentKeys.lists() });
    },
  });
}

export function useDeleteDescent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => descentsApi.remove(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: descentKeys.detail(id) });
      qc.invalidateQueries({ queryKey: descentKeys.lists() });
    },
  });
}
