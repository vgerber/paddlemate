import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CommentCategory,
  type CommentStatus,
  commentsApi,
  type MediaKind,
  mediaApi,
} from "@/lib/api";

export const commentKeys = {
  all: ["comments"] as const,
  lists: () => [...commentKeys.all, "list"] as const,
  waterway: (waterwayId: number, includeSections: boolean) =>
    [...commentKeys.lists(), "waterway", waterwayId, includeSections] as const,
  section: (waterwayId: number, sectionId: number) =>
    [...commentKeys.lists(), "section", waterwayId, sectionId] as const,
};

export const mediaKeys = {
  all: ["media"] as const,
  lists: () => [...mediaKeys.all, "list"] as const,
  waterway: (waterwayId: number, includeFromNotes: boolean) =>
    [...mediaKeys.lists(), "waterway", waterwayId, includeFromNotes] as const,
};

export function useWaterwayComments(
  waterwayId: number | null,
  includeSections = false,
) {
  return useQuery({
    queryKey: commentKeys.waterway(waterwayId ?? 0, includeSections),
    queryFn: ({ signal }) =>
      commentsApi.list(waterwayId as number, includeSections, signal),
    enabled: waterwayId !== null,
  });
}

export function useSectionComments(
  waterwayId: number | null,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: commentKeys.section(waterwayId ?? 0, sectionId ?? 0),
    queryFn: ({ signal }) =>
      commentsApi.listForSection(
        waterwayId as number,
        sectionId as number,
        signal,
      ),
    enabled: waterwayId !== null && sectionId !== null,
  });
}

export function useWaterwayMedia(
  waterwayId: number | null,
  includeFromNotes = false,
) {
  return useQuery({
    queryKey: mediaKeys.waterway(waterwayId ?? 0, includeFromNotes),
    queryFn: ({ signal }) =>
      mediaApi.list(waterwayId as number, includeFromNotes, signal),
    enabled: waterwayId !== null,
  });
}

export function useCreateComment(waterwayId: number, sectionId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      body: string;
      category?: CommentCategory;
      mediaIds?: number[];
      location?: [number, number] | null;
    }) =>
      sectionId == null
        ? commentsApi.create(waterwayId, input)
        : commentsApi.createForSection(waterwayId, sectionId, input),
    onSuccess: () => {
      // A section note shows up in the river overview too, so invalidate
      // every thread rather than the one that was posted to.
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
      // A note can claim uploads, which takes them out of the gallery.
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
    // The composer keeps the failure next to the text the user typed.
    meta: { errorHandledLocally: true },
  });
}

export function useUpdateComment(waterwayId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      ...input
    }: {
      commentId: number;
      body: string;
      category?: CommentCategory;
    }) => commentsApi.update(waterwayId, commentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
    },
    meta: { errorHandledLocally: true },
  });
}

export function useDeleteComment(waterwayId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) =>
      commentsApi.remove(waterwayId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

export function useModerateComment(waterwayId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      status,
    }: {
      commentId: number;
      status: CommentStatus;
    }) => commentsApi.moderate(waterwayId, commentId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
    },
  });
}

export function useUploadMedia(waterwayId: number, sectionId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: {
      file?: File;
      kind?: MediaKind;
      url?: string;
      caption?: string;
      copyright?: string;
    }) => mediaApi.upload(waterwayId, sectionId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
    meta: { errorHandledLocally: true },
  });
}

export function useDeleteMedia(waterwayId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: number) => mediaApi.remove(waterwayId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
    },
  });
}
