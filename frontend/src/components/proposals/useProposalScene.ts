import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import { useProposal } from "@/lib/hooks/useProposals";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { proposalRecord } from "@/lib/proposals";
import { buildProposalScene } from "./proposalScene";

/** The proposal open beside the list, with the map scene that draws it. The
 * scene keeps its identity until the proposal or the river around it
 * changes, so the map is not redrawn by unrelated renders. */
export function useProposalScene(id: number | undefined) {
  const { data: proposal, isLoading, error, refetch } = useProposal(id ?? null);

  const data = proposalRecord(proposal?.proposed_data);
  const original = proposalRecord(proposal?.original_data);
  const waterwayId = data.waterway_id ?? original.waterway_id;
  const { data: waterway } = useWaterway(
    typeof waterwayId === "number" ? waterwayId : null,
  );

  const sections = waterway?.sections;
  const scene = useMemo<MapScene>(
    () => buildProposalScene(proposal, sections),
    [proposal, sections],
  );
  return {
    proposal,
    isLoading: id != null && isLoading,
    error,
    refetch,
    scene,
  };
}
