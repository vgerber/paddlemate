import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import VoteButton from "@/components/VoteButton";
import type { Proposal } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useUnvoteProposal, useVoteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { labelSx } from "@/lib/theme";
import { proposerName, reviewerLine } from "./status";

/** Who proposed it and when, who decided, and the reader's vote. Owns the
 * vote mutations; the decision itself is the review bar's. */
export default function ProposalVoteBar({ proposal }: { proposal: Proposal }) {
  const { isAuthenticated, user } = useSession();
  const vote = useVoteProposal();
  const unvote = useUnvoteProposal();
  const reviewed = reviewerLine(proposal);

  function handleVote(next: 1 | -1 | null) {
    if (next === null) unvote.mutate(proposal.id);
    else vote.mutate({ id: proposal.id, vote: next });
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={labelSx} noWrap>
          Proposed by {proposerName(proposal, user?.id)} ·{" "}
          {formatDate(proposal.created_at)}
        </Typography>
        {!isAuthenticated && (
          <Typography sx={{ ...labelSx, color: "text.disabled" }} noWrap>
            Sign in to vote
          </Typography>
        )}
        {reviewed && (
          <Typography sx={{ ...labelSx, color: "text.disabled" }} noWrap>
            {reviewed}
          </Typography>
        )}
      </Box>

      <VoteButton
        direction="up"
        label="Upvote proposal"
        count={proposal.upvotes}
        pressed={proposal.user_vote === 1}
        disabled={!isAuthenticated}
        onClick={() => handleVote(proposal.user_vote === 1 ? null : 1)}
      />
      <VoteButton
        direction="down"
        label="Downvote proposal"
        count={proposal.downvotes}
        pressed={proposal.user_vote === -1}
        disabled={!isAuthenticated}
        onClick={() => handleVote(proposal.user_vote === -1 ? null : -1)}
      />
    </Box>
  );
}
