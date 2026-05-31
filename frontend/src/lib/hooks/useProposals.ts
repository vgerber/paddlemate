import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Proposal,
  type ProposalFilters,
  proposalsApi,
  type ReviewRequest,
} from "../api";

export const proposalKeys = {
  all: ["proposals"] as const,
  list: (filters: ProposalFilters) =>
    [...proposalKeys.all, "list", filters] as const,
  detail: (id: number) => [...proposalKeys.all, id] as const,
};

export function useProposals(filters: ProposalFilters = {}) {
  return useQuery({
    queryKey: proposalKeys.list(filters),
    queryFn: () => proposalsApi.list(filters),
  });
}

export function useProposal(id: number) {
  return useQuery({
    queryKey: proposalKeys.detail(id),
    queryFn: () => proposalsApi.get(id),
  });
}

export function useVoteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vote }: { id: number; vote: 1 | -1 }) =>
      proposalsApi.vote(id, vote),
    onMutate: async ({ id, vote }) => {
      await queryClient.cancelQueries({ queryKey: proposalKeys.all });
      const previous = queryClient.getQueriesData<Proposal[]>({
        queryKey: proposalKeys.all,
      });
      queryClient.setQueriesData<Proposal[]>(
        { queryKey: proposalKeys.all },
        (old) =>
          old?.map((p) => {
            if (p.id !== id) return p;
            const prev = p.user_vote;
            return {
              ...p,
              user_vote: vote,
              upvotes: p.upvotes + (vote === 1 ? 1 : 0) + (prev === 1 ? -1 : 0),
              downvotes:
                p.downvotes + (vote === -1 ? 1 : 0) + (prev === -1 ? -1 : 0),
            };
          }),
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

export function useReviewProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReviewRequest }) =>
      proposalsApi.review(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
    },
  });
}
