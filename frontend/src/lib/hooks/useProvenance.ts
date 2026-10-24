import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HistoryTarget } from "@/components/provenance/types";
import type { HistoryPage, ProposalFilters } from "@/lib/api";
import { proposalsApi } from "@/lib/api";
import { client } from "@/lib/api/client";
import { proposalKeys } from "@/lib/hooks/useProposals";

export const provenanceKeys = {
  all: ["provenance"] as const,
  history: (target: HistoryTarget) =>
    [...provenanceKeys.all, "history", target] as const,
  sources: (waterwayId: number, sectionId?: number) =>
    [...provenanceKeys.all, "sources", waterwayId, sectionId ?? null] as const,
};

/** One page of steps; a section's also holds its features' pages by id. */
type HistoryResult = HistoryPage & {
  features?: Record<string, HistoryPage> | null;
};

async function fetchHistory(target: HistoryTarget): Promise<HistoryResult> {
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
    // The features' steps come along; see `seedFeatureHistories`.
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/history",
      {
        params: {
          path: { waterway_id, section_id },
          query: { ...query, include_features: true },
        },
      },
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

/** The phone and desktop panels, and the views that read the entries a
 * section's history seeded, mount one after the other; the later ones read
 * what the first fetched. Edits invalidate `provenanceKeys.all`. */
const HISTORY_STALE_MS = 30_000;

/** Steps oldest first; one page of up to 100. A section's answer carries its
 * features' pages too (`features`), and each lands on its own key, so a
 * feature's view reads them without another request. */
export function useHistory(target: HistoryTarget) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: provenanceKeys.history(target),
    queryFn: async () => {
      const page = await fetchHistory(target);
      if ("sectionId" in target) {
        for (const [id, feature] of Object.entries(page.features ?? {})) {
          qc.setQueryData(
            provenanceKeys.history({ ...target, featureId: Number(id) }),
            feature,
          );
        }
      }
      return page;
    },
    staleTime: HISTORY_STALE_MS,
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
