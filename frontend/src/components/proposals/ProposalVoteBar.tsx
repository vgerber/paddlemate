import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Proposal } from "@/lib/api";
import { useUnvoteProposal, useVoteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** Card footer: date, submitter, up/down votes and - in admin mode on
 * pending proposals - the approve/reject buttons. Owns the vote mutations;
 * review confirmation stays with the parent. */
export default function ProposalVoteBar({
  proposal,
  adminMode,
  onReview,
}: {
  proposal: Proposal;
  adminMode?: boolean;
  onReview: (action: "approved" | "rejected") => void;
}) {
  const { isAuthenticated, user } = useSession();
  const vote = useVoteProposal();
  const unvote = useUnvoteProposal();
  const isOwn = user?.id === proposal.submitted_by;

  function handleVote(v: 1 | -1) {
    if (proposal.user_vote === v) {
      unvote.mutate(proposal.id);
    } else {
      vote.mutate({ id: proposal.id, vote: v });
    }
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.25 }}>
      <Typography
        sx={{
          fontFamily: fonts.mono,
          fontSize: "0.72rem",
          color: "primary.main",
          flexShrink: 0,
        }}
      >
        {new Date(proposal.created_at).toLocaleDateString()}
      </Typography>
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          color: "text.disabled",
          fontFamily: fonts.label,
          fontSize: "0.68rem",
          letterSpacing: "0.04em",
        }}
        noWrap
      >
        {isOwn ? "You" : proposal.submitted_by}
      </Typography>

      <Tooltip title={!isAuthenticated ? "Login to vote" : ""} placement="top">
        <span>
          <IconButton
            size="small"
            aria-label="Upvote proposal"
            disabled={!isAuthenticated}
            onClick={() => handleVote(1)}
            sx={{
              color:
                proposal.user_vote === 1 ? tokens.secondary : tokens.outline,
            }}
          >
            <ThumbUpOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        sx={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: tokens.outline,
          lineHeight: 1,
        }}
      >
        {proposal.upvotes}
      </Typography>
      <Tooltip title={!isAuthenticated ? "Login to vote" : ""} placement="top">
        <span>
          <IconButton
            size="small"
            aria-label="Downvote proposal"
            disabled={!isAuthenticated}
            onClick={() => handleVote(-1)}
            sx={{
              color: proposal.user_vote === -1 ? "error.main" : tokens.outline,
            }}
          >
            <ThumbDownOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        sx={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: tokens.outline,
          lineHeight: 1,
        }}
      >
        {proposal.downvotes}
      </Typography>

      {adminMode && proposal.status === "pending" && (
        <>
          <Tooltip title="Approve proposal" placement="top">
            <IconButton
              size="small"
              aria-label="Approve proposal"
              onClick={() => onReview("approved")}
              sx={{ ml: 1, color: tokens.secondary }}
            >
              <CheckOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reject proposal" placement="top">
            <IconButton
              size="small"
              aria-label="Reject proposal"
              onClick={() => onReview("rejected")}
              sx={{ color: "error.main" }}
            >
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );
}
