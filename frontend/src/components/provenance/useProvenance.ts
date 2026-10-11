import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProposalFilters, ReviewRequest } from "@/lib/api";
import { proposalsApi } from "@/lib/api";
import { client } from "@/lib/api/client";
import { proposalKeys } from "@/lib/hooks/useProposals";
import type { HistoryTarget } from "./types";

export const provenanceKeys = {
  all: ["provenance"] as const,
  history: (target: HistoryTarget) =>
    [...provenanceKeys.all, "history", target] as const,
  sources: (waterwayId: number) =>
    [...provenanceKeys.all, "sources", waterwayId] as const,
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

export function useSources(waterwayId: number) {
  return useQuery({
    queryKey: provenanceKeys.sources(waterwayId),
    queryFn: async () => {
      const { data } = await client.GET(
        "/api/v1/waterways/{waterway_id}/sources",
        { params: { path: { waterway_id: waterwayId } } },
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
