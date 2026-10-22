import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ProposalFilters, ReviewRequest } from "@/lib/api";
import { proposalsApi } from "@/lib/api";
import { client } from "@/lib/api/client";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { createLimiter } from "@/lib/limiter";
import type { HistoryTarget } from "./types";

export const provenanceKeys = {
  all: ["provenance"] as const,
  history: (target: HistoryTarget) =>
    [...provenanceKeys.all, "history", target] as const,
  sources: (waterwayId: number, sectionId?: number) =>
    [...provenanceKeys.all, "sources", waterwayId, sectionId ?? null] as const,
};

async function fetchHistory(target: HistoryTarget) {
  const query = { per_page: 100 };
  const waterway_id = target.waterwayId;
  if (!("sectionId" in target)) {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/history",
      { params: { path: { waterway_id }, query } },
    );
    if (!data) throw new Error("No history");
    return data;
  }
  const section_id = target.sectionId;
  if (!("featureId" in target)) {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/history",
      { params: { path: { waterway_id, section_id }, query } },
    );
    if (!data) throw new Error("No history");
    return data;
  }
  const { data } = await client.GET(
    "/api/v1/waterways/{waterway_id}/sections/{section_id}/features/{feature_id}/history",
    {
      params: {
        path: { waterway_id, section_id, feature_id: target.featureId },
        query,
      },
    },
  );
  if (!data) throw new Error("No history");
  return data;
}

/** Steps oldest first; one page of up to 100. */
export function useHistory(target: HistoryTarget) {
  return useQuery({
    queryKey: provenanceKeys.history(target),
    queryFn: () => fetchHistory(target),
  });
}

/** A section's edits are one request per entry; a few at a time keeps a
 * section with many features from opening dozens of connections at once. */
const limit = createLimiter(4);

/** The histories of several entries, each on its own cache key so a single
 * entry's view reuses them. Entries not loaded yet come back as undefined. */
export function useEntryHistories(targets: HistoryTarget[]) {
  return useQueries({
    queries: targets.map((target) => ({
      queryKey: provenanceKeys.history(target),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        limit(() => fetchHistory(target), signal),
    })),
    combine: (results) => ({
      data: results.map((r) => r.data?.items),
      isLoading: results.some((r) => r.isLoading),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => {
        for (const r of results) if (r.error) r.refetch();
      },
    }),
  });
}

/** The section's open, approved and rejected proposals, its features'
 * included; what the caller may see is the API's call. */
export function useSectionProposals(sectionId: number) {
  const filters: ProposalFilters = { section_id: sectionId };
  return useQuery({
    queryKey: proposalKeys.list(filters),
    queryFn: () => proposalsApi.list(filters),
  });
}

const removedFilters: ProposalFilters = {
  entity_type: "feature",
  operation: "delete",
  status: "approved",
};

/** Approved feature deletions, whichever section they were in: the section
 * filter of the proposal list matches live features only. */
export function useRemovedFeatureProposals() {
  return useQuery({
    queryKey: proposalKeys.list(removedFilters),
    queryFn: () => proposalsApi.list(removedFilters),
  });
}

/** Sources and contributors of a river, or of one section and its features. */
export function useSources(waterwayId: number, sectionId?: number) {
  return useQuery({
    queryKey: provenanceKeys.sources(waterwayId, sectionId),
    queryFn: async () => {
      const { data } = await client.GET(
        "/api/v1/waterways/{waterway_id}/sources",
        {
          params: {
            path: { waterway_id: waterwayId },
            query: { section_id: sectionId },
          },
        },
      );
      if (!data) throw new Error("No sources");
      return data;
    },
  });
}

/** Which proposals are about this very entry, as the list filters name them. */
function entryFilters(target: HistoryTarget): ProposalFilters {
  if ("featureId" in target) return { feature_id: target.featureId };
  if ("sectionId" in target) {
    return { section_id: target.sectionId, entity_type: "water_section" };
  }
  return { waterway_id: target.waterwayId, entity_type: "waterway" };
}

function entryId(target: HistoryTarget): number {
  if ("featureId" in target) return target.featureId;
  if ("sectionId" in target) return target.sectionId;
  return target.waterwayId;
}

/** Open and rejected change proposals for the entry (creations are not a
 * change to it), newest first. */
export function useEntryProposals(target: HistoryTarget) {
  const filters = entryFilters(target);
  const id = entryId(target);
  return useQuery({
    queryKey: proposalKeys.list(filters),
    queryFn: () => proposalsApi.list(filters),
    select: (all) =>
      all.filter((p) => p.operation !== "create" && p.entity_id === id),
  });
}

/** Approve or reject from the timeline; the history gains the step. */
export function useReviewEntryProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReviewRequest }) =>
      proposalsApi.review(id, body),
    // The review dialog renders the failure inline.
    meta: { errorHandledLocally: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
      queryClient.invalidateQueries({ queryKey: provenanceKeys.all });
    },
  });
}
