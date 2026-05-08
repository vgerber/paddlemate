import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  waterwaysApi,
  sectionsApi,
  commentsApi,
  featuresApi,
  type CreateFeatureInput,
} from "@/lib/api";

export const waterwayKeys = {
  all: ["waterways"] as const,
  lists: () => [...waterwayKeys.all, "list"] as const,
  detail: (id: number) => [...waterwayKeys.all, id] as const,
  section: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.detail(waterwayId), "sections", sectionId] as const,
  sectionComments: (waterwayId: number, sectionId: number) =>
    [...waterwayKeys.section(waterwayId, sectionId), "comments"] as const,
};

export function useWaterways() {
  return useQuery({
    queryKey: waterwayKeys.lists(),
    queryFn: () => waterwaysApi.list(),
  });
}

export function useWaterway(id: number) {
  return useQuery({
    queryKey: waterwayKeys.detail(id),
    queryFn: () => waterwaysApi.get(id),
  });
}

export function useSectionWithFeatures(
  waterwayId: number,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.section(waterwayId, sectionId ?? 0),
    queryFn: () => sectionsApi.get(waterwayId, sectionId!),
    enabled: sectionId !== null,
  });
}

export function useSectionComments(
  waterwayId: number,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.sectionComments(waterwayId, sectionId ?? 0),
    queryFn: () => commentsApi.listForSection(waterwayId, sectionId!),
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
