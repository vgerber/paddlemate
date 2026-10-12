import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useReviewProposal } from "@/lib/hooks/useProposals";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme";

const { tokens } = theme;

/** The admin accept/reject flow: a bar of two labelled buttons that stays in
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
      {adminMode && proposal.status === "pending" && (
        <Box
          sx={{
            position: "sticky",
            bottom: { xs: BOTTOM_NAV_SPACE, md: 0 },
            zIndex: 2,
            display: "flex",
            justifyContent: "flex-end",
            gap: 1.5,
            px: 2,
            py: 1.5,
            mx: -2,
            mb: -2,
            bgcolor: tokens.surface,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            variant="contained"
            onClick={() => setReviewAction("approved")}
            sx={{ minHeight: tokens.touch.min }}
          >
            Approve
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setReviewAction("rejected")}
            sx={{ minHeight: tokens.touch.min }}
          >
            Reject
          </Button>
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
