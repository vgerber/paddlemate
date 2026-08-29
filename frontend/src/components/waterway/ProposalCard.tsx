import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ProposalCardHeader from "@/components/proposals/ProposalCardHeader";
import ProposalCreateSummary from "@/components/proposals/ProposalCreateSummary";
import ProposalDiffTable from "@/components/proposals/ProposalDiffTable";
import ProposalReviewControls from "@/components/proposals/ProposalReviewControls";
import type { Proposal } from "@/lib/api";

interface ProposalCardProps {
  proposal: Proposal;
  adminMode?: boolean;
}

export default function ProposalCard({
  proposal,
  adminMode,
}: ProposalCardProps) {
  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <ProposalCardHeader proposal={proposal} />

      {proposal.operation === "delete" && (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Deletion request
          {original ? `: "${(original.name as string | undefined) ?? ""}"` : ""}
        </Typography>
      )}

      {proposal.operation === "create" && (
        <ProposalCreateSummary proposed={proposed} />
      )}

      {original && proposal.operation === "update" && (
        <ProposalDiffTable original={original} proposed={proposed} />
      )}

      {/* Review note for non-pending */}
      {proposal.review_note && (
        <Typography variant="caption" color="text.secondary">
          Note: {proposal.review_note}
        </Typography>
      )}

      <ProposalReviewControls proposal={proposal} adminMode={adminMode} />
    </Box>
  );
}
