import Box from "@mui/material/Box";
import FloatingCard from "@/components/canvas/FloatingCard";
import LoadingBox from "@/components/states/LoadingBox";
import MissingState from "@/components/states/MissingState";
import type { Proposal, ProposalStatus } from "@/lib/api";
import { proposalKind, proposalTitle } from "@/lib/proposals";
import ProposalDetailView from "./ProposalDetailView";
import ProposalMenu from "./ProposalMenu";
import StatusChip from "./StatusChip";

interface ProposalSideCardProps {
  /** Undefined while it loads or when there is no such proposal. */
  proposal: Proposal | undefined;
  loading: boolean;
  /** Why it did not load, when it did not. */
  error?: unknown;
  onRetry?: () => void;
  adminMode?: boolean;
  listStatus: ProposalStatus;
  onClose: () => void;
}

function Missing({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry?: () => void;
}) {
  if (loading) return <LoadingBox size={22} py={6} />;
  return (
    <MissingState
      error={error}
      notFound="Proposal not found."
      onRetry={onRetry}
    />
  );
}

/** The open proposal on the canvas: the change as the main block, the review
 * controls docked at the card's foot. The map behind it draws the change. */
export default function ProposalSideCard({
  proposal,
  loading,
  error,
  onRetry,
  adminMode,
  listStatus,
  onClose,
}: ProposalSideCardProps) {
  const kind = proposal ? proposalKind(proposal) : undefined;

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
        proposal && (
          <>
            {proposal.status !== listStatus && (
              <StatusChip status={proposal.status} />
            )}
            <ProposalMenu proposal={proposal} onWithdrawn={onClose} />
          </>
        )
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
          <Missing loading={loading} error={error} onRetry={onRetry} />
        )}
      </Box>
    </FloatingCard>
  );
}
