import Box from "@mui/material/Box";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import ProposalDetailView from "@/components/proposals/ProposalDetailView";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { useProposal } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";

export const Route = createFileRoute("/proposals/$proposalId")({
  component: ProposalDetailPage,
});

/** One proposal as a page: the phone's way into it, and the address a link
 * to it lands on. */
function ProposalDetailPage() {
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
        />
      ) : (
        <EmptyState title="Proposal not found." />
      )}
    </Box>
  );
}
