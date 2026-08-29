import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProposalVoteBar from "@/components/proposals/ProposalVoteBar";
import type { Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useReviewProposal } from "@/lib/hooks/useProposals";

/** Vote bar plus the admin approve/reject flow. Shared by the mobile card
 * and the desktop detail pane so reviewing works the same in both. */
export default function ProposalReviewControls({
  proposal,
  adminMode,
}: {
  proposal: Proposal;
  adminMode?: boolean;
}) {
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

  return (
    <>
      <ProposalVoteBar
        proposal={proposal}
        adminMode={adminMode}
        onReview={setReviewAction}
      />

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
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {apiErrorMessage(review.error, "Review failed. Please try again.")}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
