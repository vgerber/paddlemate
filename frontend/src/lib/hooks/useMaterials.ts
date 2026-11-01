import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { announceIfProposal } from "@/components/proposals/ProposalSentSnackbar";
import type {
  MaterialCategory,
  MaterialFilters,
  MaterialPhotoUpload,
  MaterialProposalBody,
} from "@/lib/api";
import { materialsApi } from "@/lib/api";
import { serializeCompareIds } from "@/lib/materials/compare";
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
  tree: (filters: MaterialFilters) =>
    [...materialKeys.all, "tree", filters] as const,
  brands: (category: MaterialCategory | undefined) =>
    [...materialKeys.all, "brands", category ?? "all"] as const,
  detail: (id: number) => [...materialKeys.all, id] as const,
};

export function useMaterials(filters: MaterialFilters = {}, enabled = true) {
  return useQuery({
    enabled,
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

/** The browse tree for the filters that are not the tree's own levels. */
export function useMaterialTree(filters: MaterialFilters) {
  return useQuery({
    queryKey: materialKeys.tree(filters),
    queryFn: ({ signal }) => materialsApi.tree(filters, signal),
    placeholderData: keepPreviousData,
  });
}

/** Most models one brand lists in the tree; a brand has far fewer. */
const BRAND_MODELS = 100;

/** The models of one brand, loaded when its tree branch opens. */
export function useBrandModels(filters: MaterialFilters, enabled: boolean) {
  return useQuery({
    queryKey: materialKeys.models({ ...filters, per_page: BRAND_MODELS }),
    queryFn: ({ signal }) =>
      materialsApi.models({ ...filters, per_page: BRAND_MODELS }, signal),
    enabled,
    select: (page) => page.items,
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
export function useMaterialComparison(ids: number[], keepPrevious = false) {
  return useQuery({
    queryKey: materialKeys.compare(ids),
    queryFn: ({ signal }) =>
      materialsApi.list({ ids: serializeCompareIds(ids) }, signal),
    enabled: ids.length > 0,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
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

/** Add a photo to an entry. An admin's is live (the caches refresh); anyone
 * else's is a proposal and the wiki stays as it was. `progress` is the
 * fraction of the file sent so far. */
export function useAddMaterialPhoto(materialId: number) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: (photo: MaterialPhotoUpload) =>
      materialsApi.addPhoto(materialId, photo, setProgress),
    // The dialog renders the failure next to its button.
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      if (isProposal(result)) {
        qc.invalidateQueries({ queryKey: proposalKeys.all });
        announceIfProposal(result);
        return;
      }
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
    onSettled: () => setProgress(null),
  });
  return { ...mutation, progress };
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

/** The picture of a photo waiting for review, loaded with the caller's token
 * (the file is not public yet). `failed` is true when it cannot be shown. */
export function useMaterialPhotoPreview(
  materialId: number | null,
  imageId: number | null,
) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });
  useEffect(() => {
    if (materialId == null || imageId == null) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    materialsApi.previewPhoto(materialId, imageId).then(
      (url) => {
        objectUrl = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setState({ url, failed: false });
      },
      () => !cancelled && setState({ url: null, failed: true }),
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [materialId, imageId]);
  return state;
}
