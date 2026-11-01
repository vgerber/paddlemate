import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { lineInset } from "@/components/phone/phoneGrid";
import type { Proposal } from "@/lib/api";
import { useDeleteProposal } from "@/lib/hooks/useProposals";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

const WHAT: Record<Proposal["operation"], string> = {
  create: "Your entry",
  update: "Your change",
  delete: "Your removal request",
};

const what = (proposal: Proposal) =>
  proposal.entity_type === "material_photo"
    ? "Your photo"
    : WHAT[proposal.operation];

/** A quiet line under the header telling the author their own proposal for
 * this entry is still waiting, with a link to it and the way to take it
 * back. */
export default function PendingProposalNote({
  proposals,
}: {
  proposals: Proposal[];
}) {
  const navigate = useNavigate();
  const withdraw = useDeleteProposal();
  const [withdrawing, setWithdrawing] = useState<Proposal | null>(null);
  if (proposals.length === 0) return null;
  return (
    <Box
      data-testid="pending-proposals"
      sx={{ px: lineInset(2), pt: { xs: 1, md: 0 }, display: "grid", gap: 0.5 }}
    >
      {proposals.map((proposal) => (
        <Box
          key={proposal.id}
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {what(proposal)} is waiting for review.
          </Typography>
          <Button
            size="small"
            // A real link, opened by the router when it is a plain click.
            href={`/proposals/${proposal.id}`}
            onClick={(event) => {
              event.preventDefault();
              navigate({
                to: "/proposals/$proposalId",
                params: { proposalId: String(proposal.id) },
              });
            }}
            sx={{ minHeight: tokens.touch.min }}
          >
            View
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => setWithdrawing(proposal)}
            sx={{ minHeight: tokens.touch.min }}
          >
            Withdraw
          </Button>
        </Box>
      ))}
      <ConfirmDialog
        open={withdrawing != null}
        title="Withdraw this proposal?"
        body="It leaves the review queue and the change is not made."
        confirmLabel="Withdraw"
        pendingLabel="Withdrawing..."
        color="error"
        pending={withdraw.isPending}
        onCancel={() => setWithdrawing(null)}
        onConfirm={() =>
          withdrawing &&
          withdraw.mutate(withdrawing.id, {
            onSuccess: () => setWithdrawing(null),
          })
        }
      />
    </Box>
  );
}
