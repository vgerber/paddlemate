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
} from "@/lib/api";

export const descentKeys = {
  all: ["descents"] as const,
  lists: () => [...descentKeys.all, "list"] as const,
  list: (filters: DescentFilters) => [...descentKeys.lists(), filters] as const,
  infinite: (filters: DescentFilters) =>
    [...descentKeys.lists(), "infinite", filters] as const,
  detail: (id: number) => [...descentKeys.all, id] as const,
};

export function useDescents(filters: DescentFilters = {}) {
  return useQuery({
    queryKey: descentKeys.list(filters),
    queryFn: () => descentsApi.list(filters),
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

export function useMyDescents(filters: Omit<DescentFilters, "scope"> = {}) {
  return useDescents({ ...filters, scope: "owned" });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: descentKeys.lists() }),
  });
}

export function usePatchDescent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatchDescentRequest }) =>
      descentsApi.update(id, body),
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
