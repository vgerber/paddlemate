import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { waterwaysApi } from "@/lib/api";
import { waterwayKeys } from "./useWaterways";

/** Detail fan-out for search results: fetch each result waterway to get its
 * sections and name. Disabled while a waterway is selected. */
export function useSearchResultSections(
  waterwayIds: number[],
  enabled: boolean,
) {
  const details = useQueries({
    queries: enabled
      ? waterwayIds.map((id) => ({
          queryKey: waterwayKeys.detail(id),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            waterwaysApi.get(id, signal),
          // Result ids change on every keystroke; don't refetch details
          // that were already loaded for a previous search.
          staleTime: 5 * 60 * 1000,
        }))
      : [],
  });

  const sections = useMemo(
    () => details.flatMap((q) => q.data?.sections ?? []),
    [details],
  );
  const isFetching = details.some((q) => q.isLoading || q.isFetching);
  // Sections arrive one round trip after the rivers, so any section count
  // taken before they land is partial. A failed fetch leaves isPending
  // false, so this cannot stick.
  const arePending = details.some((q) => q.isPending);
  const names = useMemo(() => {
    const map: Record<number, string> = {};
    for (const q of details) {
      if (q.data) map[q.data.id] = q.data.name;
    }
    return map;
  }, [details]);

  return { sections, isFetching, arePending, names };
}
