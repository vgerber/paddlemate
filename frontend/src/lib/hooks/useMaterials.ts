import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { announceIfProposal } from "@/components/proposals/ProposalSentSnackbar";
import type {
  MaterialCategory,
  MaterialFilters,
  MaterialProposalBody,
} from "@/lib/api";
import { materialsApi } from "@/lib/api";
import { serializeCompareIds } from "@/lib/materials/materials";
import { isProposal } from "@/lib/proposals";
import { proposalKeys } from "./useProposals";

export const materialKeys = {
  all: ["materials"] as const,
  lists: () => [...materialKeys.all, "list"] as const,
  list: (filters: MaterialFilters) =>
    [...materialKeys.lists(), filters] as const,
  models: (filters: MaterialFilters) =>
    [...materialKeys.lists(), "models", filters] as const,
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

/** Models per page of the wiki list. */
export const PAGE_SIZE = 24;

/** The model list a reader scrolls, one row per model. */
export function useMaterialModels(filters: MaterialFilters) {
  return useInfiniteQuery({
    queryKey: materialKeys.models(filters),
    queryFn: ({ signal, pageParam }) =>
      materialsApi.models(
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

/** Admin writes land at once; anyone else's become a pending proposal and
 * leave the wiki as it was, so the caches of the entries stay. */
export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialProposalBody) => materialsApi.create(body),
    // The entry form renders the failure next to its save button - a
    // duplicate entry is a message about the form, not about the app.
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      if (isProposal(result)) {
        qc.invalidateQueries({ queryKey: proposalKeys.all });
        announceIfProposal(result);
        return;
      }
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
  });
}

export function useUpdateMaterial(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialProposalBody) => materialsApi.update(id, body),
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      if (isProposal(result)) {
        qc.invalidateQueries({ queryKey: proposalKeys.all });
        announceIfProposal(result);
        return;
      }
      qc.setQueryData(materialKeys.detail(id), result);
      qc.invalidateQueries({ queryKey: materialKeys.lists() });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialsApi.remove(id),
    onSuccess: (result, id) => {
      if (isProposal(result)) {
        qc.invalidateQueries({ queryKey: proposalKeys.all });
        announceIfProposal(result);
        return;
      }
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
