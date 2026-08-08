import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import ProposalDetailPane from "@/components/proposals/ProposalDetailPane";
import LoadingBox from "@/components/states/LoadingBox";
import { useProposal } from "@/lib/hooks/useProposals";
import { proposalTitle, STATUS_COLOR } from "@/lib/proposals";
import { fonts } from "@/lib/theme";

export const Route = createFileRoute("/proposals/$proposalId")({
  component: ProposalDetailPage,
});

/** Full read-only view of a single proposal. */
function ProposalDetailPage() {
  const router = useRouter();
  const { proposalId } = Route.useParams();
  const { data: proposal, isLoading } = useProposal(Number(proposalId));

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
        },
      });
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: { xs: 1.5, md: 2 } }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          pb: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.05em",
            minWidth: 0,
          }}
          noWrap
        >
          {proposal ? proposalTitle(proposal) : "Proposal"}
        </Typography>
        {proposal && (
          <Chip
            label={proposal.status}
            size="small"
            variant="outlined"
            color={STATUS_COLOR[proposal.status]}
            sx={{ flexShrink: 0 }}
          />
        )}
        <Button
          onClick={goBack}
          size="small"
          sx={{ ml: "auto", flexShrink: 0 }}
        >
          Back
        </Button>
      </Box>

      {isLoading ? (
        <LoadingBox size={22} py={6} />
      ) : proposal ? (
        <ProposalDetailPane proposal={proposal} />
      ) : (
        <Typography color="text.secondary" variant="body2">
          Proposal not found.
        </Typography>
      )}
    </Box>
  );
}
