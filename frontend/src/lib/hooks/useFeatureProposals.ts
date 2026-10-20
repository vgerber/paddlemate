import { useQuery } from "@tanstack/react-query";
import { proposalsApi } from "@/lib/api";
import { proposalKeys } from "@/lib/hooks/useProposals";

/** The pending feature proposals of a section. Always loaded for the open
 * section: the feature timeline marks features with a pending delete. */
export function usePendingFeatureProposals(sectionId: number | undefined) {
  const params = {
    entity_type: "feature",
    status: "pending",
    section_id: sectionId,
  } as const;
  return useQuery({
    queryKey: proposalKeys.list(params),
    queryFn: () => proposalsApi.list(params),
    enabled: sectionId != null,
  });
}
