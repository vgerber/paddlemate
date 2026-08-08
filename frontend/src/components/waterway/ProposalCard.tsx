import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProposalCardHeader from "@/components/proposals/ProposalCardHeader";
import ProposalCreateSummary from "@/components/proposals/ProposalCreateSummary";
import ProposalDiffTable from "@/components/proposals/ProposalDiffTable";
import ProposalVoteBar from "@/components/proposals/ProposalVoteBar";
import type { Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useReviewProposal } from "@/lib/hooks/useProposals";

interface ProposalCardProps {
  proposal: Proposal;
  adminMode?: boolean;
}

export default function ProposalCard({
  proposal,
  adminMode,
}: ProposalCardProps) {
  const review = useReviewProposal();
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<
    "approved" | "rejected" | null
  >(null);

  function closeReview() {
    if (review.isPending) return;
    setReviewAction(null);
    review.reset();
  }

  function handleReview() {
    if (!reviewAction) return;
    review.mutate(
      {
        id: proposal.id,
        body: { status: reviewAction, review_note: reviewNote || null },
      },
      {
        onSuccess: () => {
          setReviewAction(null);
          review.reset();
        },
      },
    );
  }

  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <ProposalCardHeader proposal={proposal} />

      {proposal.operation === "delete" && (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Deletion request
          {original ? `: "${(original.name as string | undefined) ?? ""}"` : ""}
        </Typography>
      )}

      {proposal.operation === "create" && (
        <ProposalCreateSummary proposed={proposed} />
      )}

      {original && proposal.operation === "update" && (
        <ProposalDiffTable original={original} proposed={proposed} />
      )}

      {/* Review note for non-pending */}
      {proposal.review_note && (
        <Typography variant="caption" color="text.secondary">
          Note: {proposal.review_note}
        </Typography>
      )}

      <ProposalVoteBar
        proposal={proposal}
        adminMode={adminMode}
        onReview={setReviewAction}
      />

      {/* Review confirmation dialog */}
      <ConfirmDialog
        open={reviewAction !== null}
        title={
          reviewAction === "approved" ? "Approve proposal?" : "Reject proposal?"
        }
        body={
          reviewAction === "approved"
            ? "This applies the proposed change and makes it live."
            : "This dismisses the proposal without applying it."
        }
        confirmLabel={reviewAction === "approved" ? "Approve" : "Reject"}
        pendingLabel="Saving…"
        color={reviewAction === "approved" ? "success" : "error"}
        pending={review.isPending}
        onCancel={closeReview}
        onConfirm={handleReview}
      >
        <TextField
          label="Note (optional)"
          size="small"
          multiline
          rows={2}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          fullWidth
        />
        {review.isError && (
          <Alert
            severity="error"
            sx={{ mt: 1.5, py: 0.25, fontSize: "0.75rem" }}
          >
            {apiErrorMessage(review.error, "Review failed. Please try again.")}
          </Alert>
        )}
      </ConfirmDialog>
    </Box>
  );
}
