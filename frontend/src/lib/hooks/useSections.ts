import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  announceIfProposal,
  announceProposalSent,
} from "@/components/proposals/ProposalSentSnackbar";
import {
  type CreateFeatureInput,
  featuresApi,
  sectionsApi,
  type UpdateFeatureInput,
} from "@/lib/api";
import type { components } from "@/lib/api/schema";
import { proposalKeys } from "./useProposals";
import { provenanceKeys } from "./useProvenance";
import { useSession } from "./useSession";
import { waterwayKeys } from "./useWaterways";

type CreateSectionBody =
  components["schemas"]["Proposable_for_CreateSectionBody"];

export function useSectionWithFeatures(
  waterwayId: number,
  sectionId: number | null,
) {
  return useQuery({
    queryKey: waterwayKeys.section(waterwayId, sectionId ?? 0),
    queryFn: () => sectionsApi.get(waterwayId, sectionId as number),
    enabled: sectionId !== null,
  });
}

/** Refresh everything a submitted change can affect: the waterway's section
 * and feature data, the proposals list (non-admins create proposals) and the Edits tab. */
function invalidateWaterwayAndProposals(
  qc: ReturnType<typeof useQueryClient>,
  waterwayId: number,
) {
  qc.invalidateQueries({ queryKey: waterwayKeys.detail(waterwayId) });
  qc.invalidateQueries({ queryKey: proposalKeys.all });
  qc.invalidateQueries({ queryKey: provenanceKeys.all });
}

export function useCreateSection(waterwayId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSectionBody) =>
      sectionsApi.create(waterwayId, body),
    // The wizard renders submit failures inline.
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      invalidateWaterwayAndProposals(qc, waterwayId);
      announceIfProposal(result);
    },
  });
}

export function useCreateFeature(waterwayId: number, sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFeatureInput) =>
      featuresApi.create(waterwayId, sectionId, data),
    // The suggest-feature form renders submit failures inline.
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      invalidateWaterwayAndProposals(qc, waterwayId);
      announceIfProposal(result);
    },
  });
}

export function useUpdateFeature(waterwayId: number, sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      featureId,
      body,
    }: {
      featureId: number;
      body: UpdateFeatureInput;
    }) => featuresApi.update(waterwayId, sectionId, featureId, body),
    // The suggest-feature form renders submit failures inline.
    meta: { errorHandledLocally: true },
    onSuccess: (result) => {
      invalidateWaterwayAndProposals(qc, waterwayId);
      announceIfProposal(result);
    },
  });
}

export function useDeleteFeature(waterwayId: number, sectionId: number) {
  const qc = useQueryClient();
  const { isAdmin } = useSession();
  return useMutation({
    mutationFn: (featureId: number) =>
      featuresApi.remove(waterwayId, sectionId, featureId),
    // Refresh the feature list and the pending proposals, so the timeline's
    // "deletion proposed" marker shows up right away.
    onSuccess: () => {
      invalidateWaterwayAndProposals(qc, waterwayId);
      // An admin's delete is final; anyone else's goes to review.
      if (!isAdmin) announceProposalSent(null);
    },
  });
}
