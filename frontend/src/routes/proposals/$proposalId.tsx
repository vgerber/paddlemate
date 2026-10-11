import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import ProposalDetailView from "@/components/proposals/ProposalDetailView";
import ProposalsView from "@/components/proposals/ProposalsView";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type {
  ProposalEntityType,
  ProposalOperation,
  ProposalStatus,
} from "@/lib/api";
import { useProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/proposals/$proposalId")({
  component: ProposalDetailPage,
});

/** One proposal as a page: the phone's way into it, and the address a link
 * to it lands on. On a wide screen the address opens the proposals canvas
 * with this one open and drawn. */
function ProposalDetailPage() {
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  return isDesktop ? <OpenOnCanvas /> : <ProposalPage />;
}

function OpenOnCanvas() {
  const navigate = useNavigate();
  const { proposalId } = Route.useParams();
  const { isAdmin } = useSession();
  const [status, setStatus] = useState<ProposalStatus>("pending");
  const [entityType, setEntityType] = useState<ProposalEntityType>();
  const [operation, setOperation] = useState<ProposalOperation>();

  return (
    <ProposalsView
      adminMode={isAdmin}
      status={status}
      selectedId={Number(proposalId)}
      onSelect={(id) =>
        id == null
          ? navigate({
              to: "/proposals",
              search: {
                status,
                entity_type: entityType,
                operation,
                selected: undefined,
              },
            })
          : navigate({
              to: "/proposals/$proposalId",
              params: { proposalId: String(id) },
            })
      }
      entityType={entityType}
      operation={operation}
      onStatusChange={setStatus}
      onEntityTypeChange={setEntityType}
      onOperationChange={setOperation}
    />
  );
}

function ProposalPage() {
  const router = useRouter();
  const { proposalId } = Route.useParams();
  const { data: proposal, isLoading } = useProposal(Number(proposalId));
  const { isAdmin } = useSession();

  const goBack = () => {
    if (window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({
        to: "/proposals",
        search: {
          status: "pending",
          entity_type: undefined,
          operation: undefined,
          selected: undefined,
        },
      });
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {isLoading ? (
        <LoadingBox size={22} py={6} />
      ) : proposal ? (
        <ProposalDetailView
          proposal={proposal}
          adminMode={isAdmin}
          onBack={goBack}
          // Pending is the tab a proposal is opened from; its chip would only
          // repeat it. Other states keep the chip.
          listStatus="pending"
        />
      ) : (
        <EmptyState title="Proposal not found." />
      )}
    </Box>
  );
}
