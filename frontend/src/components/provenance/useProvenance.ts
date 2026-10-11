import { useQuery } from "@tanstack/react-query";
import { ApiError, rawRequest } from "@/lib/api/client";
import type { HistoryPage, HistoryTarget, SourcesSummary } from "./types";

export const provenanceKeys = {
  all: ["provenance"] as const,
  history: (target: HistoryTarget) =>
    [...provenanceKeys.all, "history", target] as const,
  sources: (waterwayId: number) =>
    [...provenanceKeys.all, "sources", waterwayId] as const,
};

/** API path of an entry's history. */
export function historyPath(target: HistoryTarget): string {
  const base = `/api/v1/waterways/${target.waterwayId}`;
  if (!("sectionId" in target)) return `${base}/history`;
  const section = `${base}/sections/${target.sectionId}`;
  if (!("featureId" in target)) return `${section}/history`;
  return `${section}/features/${target.featureId}/history`;
}

async function getJson<T>(path: string): Promise<T> {
  const { url, headers } = await rawRequest(path);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return (await response.json()) as T;
}

/** Steps oldest first; one page of up to 100. */
export function useHistory(target: HistoryTarget) {
  return useQuery({
    queryKey: provenanceKeys.history(target),
    queryFn: () => getJson<HistoryPage>(`${historyPath(target)}?per_page=100`),
  });
}

export function useSources(waterwayId: number) {
  return useQuery({
    queryKey: provenanceKeys.sources(waterwayId),
    queryFn: () =>
      getJson<SourcesSummary>(`/api/v1/waterways/${waterwayId}/sources`),
  });
}
