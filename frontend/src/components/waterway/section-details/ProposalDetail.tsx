import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Proposal } from "@/lib/api";
import { useUnvoteProposal, useVoteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";

const { tokens } = theme;

function VoteButtons({ proposal }: { proposal: Proposal }) {
  const { isAuthenticated } = useSession();
  const vote = useVoteProposal();
  const unvote = useUnvoteProposal();

  function handleVote(v: 1 | -1) {
    if (proposal.user_vote === v) unvote.mutate(proposal.id);
    else vote.mutate({ id: proposal.id, vote: v });
  }

  return (
    <>
      <Tooltip title={!isAuthenticated ? "Login to vote" : ""} placement="top">
        <span>
          <IconButton
            size="small"
            disabled={!isAuthenticated}
            onClick={(e) => { e.stopPropagation(); handleVote(1); }}
            sx={{ color: proposal.user_vote === 1 ? tokens.secondary : tokens.outline }}
          >
            <ThumbUpOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography sx={{ fontFamily: fonts.mono, fontSize: 11, color: tokens.outline, lineHeight: 1 }}>
        {proposal.upvotes}
      </Typography>
      <Tooltip title={!isAuthenticated ? "Login to vote" : ""} placement="top">
        <span>
          <IconButton
            size="small"
            disabled={!isAuthenticated}
            onClick={(e) => { e.stopPropagation(); handleVote(-1); }}
            sx={{ color: proposal.user_vote === -1 ? "error.main" : tokens.outline }}
          >
            <ThumbDownOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography sx={{ fontFamily: fonts.mono, fontSize: 11, color: tokens.outline, lineHeight: 1 }}>
        {proposal.downvotes}
      </Typography>
    </>
  );
}

interface Props {
  proposal: Proposal;
  coords: [number, number];
  featureType: string;
}

export function ProposalDetail({ proposal, coords, featureType }: Props) {
  return (
    <Stack direction="column" sx={{ mt: "4px", gap: "2px" }}>
      <Typography
        sx={{
          fontFamily: fonts.label,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: tokens.outline,
        }}
      >
        {featureType.replace(/_/g, " ")}
      </Typography>
      <CoordsInfo coords={coords} actions={<VoteButtons proposal={proposal} />} />
    </Stack>
  );
}
