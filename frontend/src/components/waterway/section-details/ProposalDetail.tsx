import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { Proposal } from "@/lib/api";
import {
  useDeleteProposal,
  useUnvoteProposal,
  useVoteProposal,
} from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";

const { tokens } = theme;

function ProposalActions({ proposal }: { proposal: Proposal }) {
  const { isAuthenticated, user } = useSession();
  const vote = useVoteProposal();
  const unvote = useUnvoteProposal();
  const del = useDeleteProposal();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isOwner = !!user && user.id === proposal.submitted_by;

  function handleVote(v: 1 | -1) {
    if (proposal.user_vote === v) unvote.mutate(proposal.id);
    else vote.mutate({ id: proposal.id, vote: v });
  }

  function handleDelete() {
    del.mutate(proposal.id, { onSuccess: () => setConfirmOpen(false) });
  }

  return (
    <>
      <Tooltip title={!isAuthenticated ? "Login to vote" : ""} placement="top">
        <span>
          <IconButton
            size="small"
            disabled={!isAuthenticated}
            onClick={(e) => {
              e.stopPropagation();
              handleVote(1);
            }}
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
            disabled={!isAuthenticated}
            onClick={(e) => {
              e.stopPropagation();
              handleVote(-1);
            }}
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

      {isOwner && (
        <Tooltip title="Withdraw proposal" placement="top">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            sx={{ color: "error.main" }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle>Withdraw proposal?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes your pending proposal. This action cannot
            be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={del.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" disabled={del.isPending}>
            {del.isPending ? "Withdrawing…" : "Withdraw"}
          </Button>
        </DialogActions>
      </Dialog>
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
      <CoordsInfo
        coords={coords}
        actions={<ProposalActions proposal={proposal} />}
      />
    </Stack>
  );
}
