import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import RowMenu from "@/components/RowMenu";
import type { Proposal } from "@/lib/api";
import { useDeleteProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { DeleteIcon } from "@/lib/icons";

/** What the author can do with their own proposal while it waits: take it
 * back. Nothing for anyone else (admins decide in the review bar). */
export default function ProposalMenu({
  proposal,
  onWithdrawn,
}: {
  proposal: Proposal;
  onWithdrawn: () => void;
}) {
  const { user } = useSession();
  const withdraw = useDeleteProposal();
  const [confirming, setConfirming] = useState(false);

  if (proposal.status !== "pending" || proposal.submitted_by !== user?.id) {
    return null;
  }

  return (
    <>
      <RowMenu
        label="Proposal actions"
        actions={[
          {
            label: "Withdraw",
            icon: <DeleteIcon fontSize="small" />,
            danger: true,
            onClick: () => setConfirming(true),
          },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        title="Withdraw this proposal?"
        body="It leaves the review queue and the change is not made."
        confirmLabel="Withdraw"
        pendingLabel="Withdrawing..."
        color="error"
        pending={withdraw.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          withdraw.mutate(proposal.id, {
            onSuccess: () => {
              setConfirming(false);
              onWithdrawn();
            },
          })
        }
      />
    </>
  );
}
