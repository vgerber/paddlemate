import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import { proposalsApi } from "@/lib/api";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { buildProposalScene } from "./proposalScene";

/** The proposal open beside the list, with the map scene that draws it. The
 * scene keeps its identity until the proposal or the river around it
 * changes, so the map is not redrawn by unrelated renders. */
export function useProposalScene(id: number | undefined) {
  const { data: proposal, isLoading } = useQuery({
    queryKey: proposalKeys.detail(id ?? 0),
    queryFn: () => proposalsApi.get(id as number),
    enabled: id != null,
  });

  const data = proposal?.proposed_data as Record<string, unknown> | undefined;
  const original = proposal?.original_data as
    | Record<string, unknown>
    | null
    | undefined;
  const waterwayId = data?.waterway_id ?? original?.waterway_id;
  const { data: waterway } = useWaterway(
    typeof waterwayId === "number" ? waterwayId : null,
  );

  const sections = waterway?.sections;
  const scene = useMemo<MapScene>(
    () => buildProposalScene(proposal, sections),
    [proposal, sections],
  );
  return { proposal, isLoading: id != null && isLoading, scene };
}
