import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import ProposalCreateSummary from "@/components/proposals/ProposalCreateSummary";
import ProposalDetailPane from "@/components/proposals/ProposalDetailPane";
import ProposalReviewControls from "@/components/proposals/ProposalReviewControls";
import type { Proposal } from "@/lib/api";
import {
  ENTITY_LABEL,
  OP_LABEL,
  proposalTitle,
  STATUS_COLOR,
} from "@/lib/proposals";
import { fonts, labelSx } from "@/lib/theme";

/** The whole proposal: what it is, the change itself with its map, and the
 * review controls. Fills the pane beside the list on desktop. */
export default function ProposalDetailView({
  proposal,
  adminMode,
}: {
  proposal: Proposal;
  adminMode?: boolean;
}) {
  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pb: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontWeight: 700,
              fontSize: "1rem",
              textTransform:
                proposal.entity_type === "feature" ? "capitalize" : "none",
            }}
            noWrap
          >
            {proposalTitle(proposal)}
          </Typography>
          <Typography sx={{ ...labelSx, display: "block" }}>
            {OP_LABEL[proposal.operation] ?? proposal.operation} ·{" "}
            {ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}
          </Typography>
        </Box>
        <Chip
          label={proposal.status}
          size="small"
          variant="outlined"
          color={STATUS_COLOR[proposal.status]}
          sx={{ ml: "auto", flexShrink: 0 }}
        />
      </Box>

      {proposal.operation === "delete" && (
        <Typography sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
          Deletion request
          {original ? `: "${(original.name as string | undefined) ?? ""}"` : ""}
        </Typography>
      )}

      {proposal.operation === "create" && (
        <ProposalCreateSummary proposed={proposed} />
      )}

      <ProposalDetailPane proposal={proposal} />

      {proposal.review_note && (
        <Typography variant="caption" color="text.secondary">
          Note: {proposal.review_note}
        </Typography>
      )}

      <ProposalReviewControls proposal={proposal} adminMode={adminMode} />
    </Box>
  );
}
