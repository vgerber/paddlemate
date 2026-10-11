import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import PanelHeader from "@/components/PanelHeader";
import ProposalCreateSummary from "@/components/proposals/ProposalCreateSummary";
import ProposalDetailPane from "@/components/proposals/ProposalDetailPane";
import ProposalReviewControls from "@/components/proposals/ProposalReviewControls";
import type { Proposal } from "@/lib/api";
import { ENTITY_LABEL, OP_LABEL, proposalTitle } from "@/lib/proposals";
import { labelSx } from "@/lib/theme";
import StatusChip from "./StatusChip";

/** The whole proposal: what it is, the change itself with its map, and the
 * review controls. Fills the pane beside the list on a desktop; with
 * `onBack` it is a page of its own under the panel header. */
export default function ProposalDetailView({
  proposal,
  adminMode,
  onBack,
}: {
  proposal: Proposal;
  adminMode?: boolean;
  onBack?: () => void;
}) {
  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;
  const kind = `${OP_LABEL[proposal.operation] ?? proposal.operation} · ${ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}`;

  return (
    <Box data-testid="proposal-detail">
      {onBack ? (
        <PanelHeader
          title={proposalTitle(proposal)}
          subtitle={kind}
          onBack={onBack}
          actionButton={<StatusChip status={proposal.status} />}
        />
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1.5 }}>
          <Typography sx={{ ...labelSx, flex: 1, minWidth: 0 }} noWrap>
            {kind}
          </Typography>
          <StatusChip status={proposal.status} />
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          px: onBack ? 2 : 0,
          py: onBack ? 2 : 0,
        }}
      >
        {proposal.operation === "delete" && (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            Deletion request
            {original
              ? `: "${(original.name as string | undefined) ?? ""}"`
              : ""}
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
    </Box>
  );
}
