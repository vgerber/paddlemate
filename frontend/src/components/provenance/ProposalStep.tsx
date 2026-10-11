import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { proposerName } from "@/components/proposals/status";
import type { Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { formatDate, timeAgo } from "@/lib/format";
import { theme } from "@/lib/theme";
import HistoryChanges from "./HistoryChanges";
import { proposalChanges } from "./proposalChanges";
import StepRow, { Byline, smallSx } from "./StepRow";
import { useReviewEntryProposal } from "./useProvenance";

const { tokens } = theme;

export function ReviewNote({ note }: { note: string }) {
  return (
    <Typography
      data-testid="review-note"
      sx={{
        ...smallSx,
        mt: 0.75,
        color: "text.secondary",
        borderLeft: `2px solid ${tokens.outlineVariant}`,
        pl: 1,
        overflowWrap: "anywhere",
      }}
    >
      {note}
    </Typography>
  );
}

function ReviewButtons({ proposal }: { proposal: Proposal }) {
  const review = useReviewEntryProposal();
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = useState("");

  function close() {
    if (review.isPending) return;
    setAction(null);
    review.reset();
  }

  function confirm() {
    if (!action) return;
    review.mutate(
      { id: proposal.id, body: { status: action, review_note: note || null } },
      {
        onSuccess: () => {
          setAction(null);
          setNote("");
          review.reset();
        },
      },
    );
  }

  const approving = action === "approved";
  return (
    <>
      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => setAction("rejected")}
          sx={{ minHeight: tokens.touch.min }}
        >
          Reject
        </Button>
        <Button
          variant="contained"
          onClick={() => setAction("approved")}
          sx={{ minHeight: tokens.touch.min }}
        >
          Approve
        </Button>
      </Box>
      <ConfirmDialog
        open={action !== null}
        title={approving ? "Approve this change?" : "Reject this change?"}
        confirmLabel={approving ? "Approve" : "Reject"}
        pendingLabel="Saving…"
        color={approving ? "success" : "error"}
        pending={review.isPending}
        onCancel={close}
        onConfirm={confirm}
      >
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          fullWidth
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        {review.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {apiErrorMessage(review.error, "The review could not be saved.")}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}

function title(proposal: Proposal): string {
  const what = proposal.operation === "delete" ? "deletion" : "change";
  return proposal.status === "rejected"
    ? `Rejected ${what}`
    : `Proposed ${what}`;
}

/** A proposal on the rail: hollow while it waits, reviewers get the buttons.
 * A rejected one reads the same, minus the buttons, with the reviewer's note. */
export default function ProposalStep({
  proposal,
  first,
  last,
  canReview,
}: {
  proposal: Proposal;
  first: boolean;
  last: boolean;
  canReview: boolean;
}) {
  const pending = proposal.status === "pending";
  const reviewer = proposal.reviewed_by_name;
  return (
    <StepRow
      testId="history-proposal"
      kind={pending ? "pending" : "gone"}
      first={first}
      last={last}
      title={title(proposal)}
      status={proposal.status}
    >
      <Byline
        parts={[{ text: "by " }, { text: proposerName(proposal), name: true }]}
        tail={[
          pending
            ? timeAgo(proposal.created_at)
            : formatDate(proposal.created_at),
          ...(pending
            ? [`${proposal.upvotes} up, ${proposal.downvotes} down`]
            : reviewer
              ? [`rejected by ${reviewer}`]
              : []),
        ]}
      />
      <HistoryChanges changes={proposalChanges(proposal)} />
      {proposal.review_note && <ReviewNote note={proposal.review_note} />}
      {pending && canReview && <ReviewButtons proposal={proposal} />}
    </StepRow>
  );
}
