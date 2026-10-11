import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { formatDate } from "@/lib/format";
import { useUnvoteProposal, useVoteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, labelSx, theme } from "@/lib/theme";
import { type ProposalWithNames, proposerName, reviewerLine } from "./status";

const { tokens } = theme;

/** Who proposed it and when, who decided, and the reader's vote. Owns the
 * vote mutations; the decision itself is the review bar's. */
export default function ProposalVoteBar({
  proposal,
}: {
  proposal: ProposalWithNames;
}) {
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
        gap: 1.5,
        pt: 1.5,
        borderTop: "1px solid",
        borderColor: `${tokens.outlineVariant}55`,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={labelSx} noWrap>
          Proposed by {proposerName(proposal, user?.id)} ·{" "}
          {formatDate(proposal.created_at)}
        </Typography>
        {reviewed && (
          <Typography sx={{ ...labelSx, color: "text.disabled" }} noWrap>
            {reviewed}
          </Typography>
        )}
      </Box>

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
                minWidth: tokens.touch.min,
                minHeight: tokens.touch.min,
                px: 1.25,
                gap: 0.5,
                fontFamily: fonts.label,
                fontSize: "0.8125rem",
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
              <ThumbUpOutlinedIcon sx={{ fontSize: 16 }} />
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
              <ThumbDownOutlinedIcon sx={{ fontSize: 16 }} />
              {proposal.downvotes}
            </ToggleButton>
          </ToggleButtonGroup>
        </span>
      </Tooltip>
    </Box>
  );
}
