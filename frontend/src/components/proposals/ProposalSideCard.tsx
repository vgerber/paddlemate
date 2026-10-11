import Box from "@mui/material/Box";
import FloatingCard from "@/components/canvas/FloatingCard";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Proposal, ProposalStatus } from "@/lib/api";
import { ENTITY_LABEL, OP_LABEL, proposalTitle } from "@/lib/proposals";
import ProposalDetailView from "./ProposalDetailView";
import StatusChip from "./StatusChip";

interface ProposalSideCardProps {
  /** Undefined while it loads or when there is no such proposal. */
  proposal: Proposal | undefined;
  loading: boolean;
  adminMode?: boolean;
  listStatus: ProposalStatus;
  onClose: () => void;
}

function Missing({ loading }: { loading: boolean }) {
  if (loading) return <LoadingBox size={22} py={6} />;
  return <EmptyState title="Proposal not found." />;
}

/** The open proposal on the canvas: the change as the main block, the review
 * controls docked at the card's foot. The map behind it draws the change. */
export default function ProposalSideCard({
  proposal,
  loading,
  adminMode,
  listStatus,
  onClose,
}: ProposalSideCardProps) {
  const kind = proposal
    ? `${OP_LABEL[proposal.operation] ?? proposal.operation} · ${ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}`
    : undefined;

  return (
    <FloatingCard
      id="proposal"
      side="right"
      kind="side"
      screen="proposals"
      title={proposal ? proposalTitle(proposal) : "Proposal"}
      subtitle={kind}
      onClose={onClose}
      actions={
        proposal && proposal.status !== listStatus ? (
          <StatusChip status={proposal.status} />
        ) : undefined
      }
    >
      <Box sx={{ height: "100%" }}>
        {proposal ? (
          <ProposalDetailView
            proposal={proposal}
            adminMode={adminMode}
            listStatus={listStatus}
            docked
          />
        ) : (
          <Missing loading={loading} />
        )}
      </Box>
    </FloatingCard>
  );
}
