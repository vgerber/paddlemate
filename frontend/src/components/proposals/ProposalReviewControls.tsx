import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import ProposalVoteBar from "@/components/proposals/ProposalVoteBar";
import type { Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useReviewProposal } from "@/lib/hooks/useProposals";
import { BOTTOM_NAV_SPACE } from "@/lib/theme";

/** Vote bar plus the admin accept/reject flow: a review bar that stays in
 * reach while the change is read, and the confirmation behind it. */
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
          setReviewNote("");
          review.reset();
        },
      },
    );
  }

  return (
    <>
      <ProposalVoteBar proposal={proposal} />

      {adminMode && proposal.status === "pending" && (
        <Box
          sx={{
            position: "sticky",
            bottom: { xs: BOTTOM_NAV_SPACE, md: 0 },
            zIndex: 1,
          }}
        >
          <PanelBottomBar
            leftIcon={<CloseOutlinedIcon />}
            leftLabel="Reject"
            onLeftClick={() => setReviewAction("rejected")}
            title="Review"
            subtitle={`${proposal.upvotes} up, ${proposal.downvotes} down`}
            action={
              <RoundActionButton
                ariaLabel="Approve"
                onClick={() => setReviewAction("approved")}
              >
                <CheckOutlinedIcon />
              </RoundActionButton>
            }
          />
        </Box>
      )}

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
