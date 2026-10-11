import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
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
