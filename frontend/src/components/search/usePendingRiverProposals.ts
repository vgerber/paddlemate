import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { proposalsApi } from "@/lib/api";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { searchKey } from "@/lib/text";

const PENDING_FILTERS = {
  entity_type: "waterway",
  status: "pending",
  operation: "create",
} as const;

/** The user's own pending river proposals matching the search - shown as
 * disabled "pending approval" entries in the result list. */
export function usePendingRiverProposals(searchName: string, active: boolean) {
  const { isAuthenticated } = useSession();
  const { data: proposals = [] } = useQuery({
    queryKey: proposalKeys.list(PENDING_FILTERS),
    queryFn: () => proposalsApi.list(PENDING_FILTERS),
    enabled: isAuthenticated && active && !!searchName,
  });

  return useMemo(() => {
    if (!active || !searchName) return [];
    const q = searchKey(searchName);
    return proposals
      .map((p) => ({
        id: p.id,
        name: (p.proposed_data as { name?: string }).name ?? "?",
      }))
      .filter((p) => searchKey(p.name).includes(q));
  }, [active, searchName, proposals]);
}
