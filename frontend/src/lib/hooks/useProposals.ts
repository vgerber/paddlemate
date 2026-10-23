import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Proposal,
  type ProposalFilters,
  proposalsApi,
  type ReviewRequest,
} from "@/lib/api";
import { provenanceKeys } from "./useProvenance";

export const proposalKeys = {
  all: ["proposals"] as const,
  /** Prefix of every list query - safe scope for bulk cache updates. */
  lists: () => [...proposalKeys.all, "list"] as const,
  list: (filters: ProposalFilters) =>
    [...proposalKeys.lists(), filters] as const,
  detail: (id: number) => [...proposalKeys.all, id] as const,
};

export function useProposals(filters: ProposalFilters = {}) {
  return useQuery({
    queryKey: proposalKeys.list(filters),
    queryFn: () => proposalsApi.list(filters),
  });
}

/** A null id waits: the proposal open beside a list may be none. */
export function useProposal(id: number | null) {
  return useQuery({
    queryKey: proposalKeys.detail(id ?? 0),
    queryFn: () => proposalsApi.get(id ?? 0),
    enabled: id !== null,
  });
}

export function useVoteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vote }: { id: number; vote: 1 | -1 }) =>
      proposalsApi.vote(id, vote),
    onMutate: async ({ id, vote }) => {
      // Scope to list caches only: proposalKeys.all also prefix-matches the
      // detail caches, which hold a single Proposal, not an array.
      await queryClient.cancelQueries({ queryKey: proposalKeys.lists() });
      const previous = queryClient.getQueriesData<Proposal[]>({
        queryKey: proposalKeys.lists(),
      });
      queryClient.setQueriesData<Proposal[]>(
        { queryKey: proposalKeys.lists() },
        (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((p) => {
            if (p.id !== id) return p;
            const prev = p.user_vote;
            return {
              ...p,
              user_vote: vote,
              upvotes: p.upvotes + (vote === 1 ? 1 : 0) + (prev === 1 ? -1 : 0),
              downvotes:
                p.downvotes + (vote === -1 ? 1 : 0) + (prev === -1 ? -1 : 0),
            };
          });
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [queryKey, data] of context.previous) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
    },
  });
}

export function useUnvoteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => proposalsApi.unvote(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
    },
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => proposalsApi.delete(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
    },
  });
}

export function useReviewProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReviewRequest }) =>
      proposalsApi.review(id, body),
    // The review dialog renders the failure inline.
    meta: { errorHandledLocally: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
      // An approval adds a step to the history and may delete a feature.
      queryClient.invalidateQueries({ queryKey: provenanceKeys.all });
    },
  });
}
