import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MaterialBody,
  MaterialCategory,
  MaterialFilters,
} from "@/lib/api";
import { materialsApi } from "@/lib/api";
import { serializeCompareIds } from "@/lib/materials/materials";

export const materialKeys = {
  all: ["materials"] as const,
  lists: () => [...materialKeys.all, "list"] as const,
  list: (filters: MaterialFilters) =>
    [...materialKeys.lists(), filters] as const,
  infinite: (filters: MaterialFilters) =>
    [...materialKeys.lists(), "infinite", filters] as const,
  compare: (ids: number[]) =>
    [...materialKeys.lists(), "compare", serializeCompareIds(ids)] as const,
  brands: (category: MaterialCategory | undefined) =>
    [...materialKeys.all, "brands", category ?? "all"] as const,
  detail: (id: number) => [...materialKeys.all, id] as const,
};

export function useMaterials(filters: MaterialFilters = {}) {
  return useQuery({
    queryKey: materialKeys.list(filters),
    queryFn: ({ signal }) => materialsApi.list(filters, signal),
  });
}

/** The list a reader scrolls: pages of PAGE_SIZE, the next one on request. */
export const PAGE_SIZE = 24;

export function useMaterialList(filters: MaterialFilters) {
  return useInfiniteQuery({
    queryKey: materialKeys.infinite(filters),
    queryFn: ({ signal, pageParam }) =>
      materialsApi.list(
        { ...filters, page: pageParam, per_page: PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.total_pages ? last.page + 1 : undefined,
  });
}

export function useMaterial(id: number | undefined) {
  return useQuery({
    queryKey: materialKeys.detail(id ?? 0),
    queryFn: ({ signal }) => materialsApi.get(id as number, signal),
    enabled: id != null,
  });
}

/** The entries a comparison holds, in the order they were picked. The server
 * ignores every other filter when `ids` is given, so this is one request
 * however many columns the table has. */
export function useMaterialComparison(ids: number[]) {
  return useQuery({
    queryKey: materialKeys.compare(ids),
    queryFn: ({ signal }) =>
      materialsApi.list({ ids: serializeCompareIds(ids) }, signal),
    enabled: ids.length > 0,
    select: (page) => page.items,
  });
}

export function useMaterialBrands(category?: MaterialCategory) {
  return useQuery({
    queryKey: materialKeys.brands(category),
    queryFn: ({ signal }) => materialsApi.brands(category, signal),
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialBody) => materialsApi.create(body),
    // The entry form renders the failure next to its save button - a
    // duplicate entry is a message about the form, not about the app.
    meta: { errorHandledLocally: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
  });
}

export function useUpdateMaterial(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialBody) => materialsApi.update(id, body),
    meta: { errorHandledLocally: true },
    onSuccess: (material) => {
      qc.setQueryData(materialKeys.detail(id), material);
      qc.invalidateQueries({ queryKey: materialKeys.lists() });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialsApi.remove(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: materialKeys.detail(id) });
      qc.invalidateQueries({ queryKey: materialKeys.lists() });
    },
  });
}

export function useRemoveMaterialImage(materialId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: number) =>
      materialsApi.removeImage(materialId, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKeys.all }),
  });
}

export function useRemoveBrandImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brand: string) => materialsApi.removeBrandImages(brand),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKeys.all }),
  });
}
