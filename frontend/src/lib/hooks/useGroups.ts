import { useQuery } from "@tanstack/react-query";
import { groupsApi } from "@/lib/api";

export const groupKeys = {
  all: ["groups"] as const,
};

export function useGroups() {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: groupsApi.list,
    staleTime: 60_000,
  });
}
