import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Proposal } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useUnvoteProposal, useVoteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** The page's control scale - MUI's small button runs bigger and bolder
 * than everything else here. */
const decisionButtonSx = {
  px: 1.5,
  py: 0.375,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  "& .MuiButton-startIcon": { mr: 0.5 },
} as const;

/** Who submitted it and when, the reader's vote, and - for an admin on a
 * pending proposal - the decision. Owns the vote mutations; review
 * confirmation stays with the parent. */
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
  const canDecide = adminMode && proposal.status === "pending";

  function handleVote(next: 1 | -1 | null) {
    if (next === null) unvote.mutate(proposal.id);
    else vote.mutate({ id: proposal.id, vote: next });
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        mt: 0.5,
        pt: 1.5,
        borderTop: "1px solid",
        borderColor: `${tokens.outlineVariant}55`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography
          sx={{ ...labelSx, minWidth: 0, flex: 1 }}
          noWrap
          title={proposal.submitted_by}
        >
          {isOwn ? "You" : proposal.submitted_by} ·{" "}
          {formatDate(proposal.created_at)}
        </Typography>

        <Tooltip
          title={!isAuthenticated ? "Sign in to vote" : ""}
          placement="top"
        >
          <span>
            <ToggleButtonGroup
              size="small"
              exclusive
              disabled={!isAuthenticated}
              value={proposal.user_vote ?? null}
              onChange={(_, next) => handleVote(next as 1 | -1 | null)}
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.25,
                  py: 0.5,
                  gap: 0.5,
                  fontFamily: fonts.mono,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                  borderColor: `${tokens.outlineVariant}55`,
                },
              }}
            >
              <ToggleButton
                value={1}
                aria-label="Upvote proposal"
                sx={{
                  "&.Mui-selected": {
                    color: tokens.success,
                    bgcolor: `${tokens.success}14`,
                    "&:hover": { bgcolor: `${tokens.success}1f` },
                  },
                }}
              >
                <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                {proposal.upvotes}
              </ToggleButton>
              <ToggleButton
                value={-1}
                aria-label="Downvote proposal"
                sx={{
                  "&.Mui-selected": {
                    color: tokens.error,
                    bgcolor: `${tokens.error}14`,
                    "&:hover": { bgcolor: `${tokens.error}1f` },
                  },
                }}
              >
                <ThumbDownOutlinedIcon sx={{ fontSize: 14 }} />
                {proposal.downvotes}
              </ToggleButton>
            </ToggleButtonGroup>
          </span>
        </Tooltip>
      </Box>

      {canDecide && (
        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CloseOutlinedIcon sx={{ fontSize: 14 }} />}
            onClick={() => onReview("rejected")}
            sx={{
              ...decisionButtonSx,
              color: "text.secondary",
              borderColor: `${tokens.outlineVariant}55`,
            }}
          >
            Reject
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CheckOutlinedIcon sx={{ fontSize: 14 }} />}
            onClick={() => onReview("approved")}
            sx={{
              ...decisionButtonSx,
              color: tokens.tertiary,
              borderColor: `${tokens.tertiary}55`,
              "&:hover": { borderColor: tokens.tertiary },
            }}
          >
            Approve
          </Button>
        </Box>
      )}
    </Box>
  );
}
