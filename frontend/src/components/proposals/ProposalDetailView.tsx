import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import PanelHeader from "@/components/PanelHeader";
import ProposalCreateSummary from "@/components/proposals/ProposalCreateSummary";
import ProposalDetailPane from "@/components/proposals/ProposalDetailPane";
import ProposalReviewControls from "@/components/proposals/ProposalReviewControls";
import ProposalVoteBar from "@/components/proposals/ProposalVoteBar";
import type { Proposal, ProposalStatus } from "@/lib/api";
import { ENTITY_LABEL, OP_LABEL, proposalTitle } from "@/lib/proposals";
import { BOTTOM_NAV_SPACE, labelSx, theme } from "@/lib/theme";
import StatusChip from "./StatusChip";

const { tokens } = theme;

/** The whole proposal: what it is, the change itself with its map, and the
 * review controls. Beside the list on a desktop it keeps its title and drops
 * only the back arrow, which `onBack` adds on a phone. */
export default function ProposalDetailView({
  proposal,
  adminMode,
  onBack,
  listStatus,
  docked,
}: {
  proposal: Proposal;
  adminMode?: boolean;
  onBack?: () => void;
  /** The status tab the proposal was opened from; its chip would only
   * repeat the tab, so it is drawn when this is absent (a deep link) or
   * differs. */
  listStatus?: ProposalStatus;
  /** Inside a canvas card: the card draws the header and the map, and the
   * review controls sit at its foot instead of scrolling with the text. */
  docked?: boolean;
}) {
  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;
  const kind = `${OP_LABEL[proposal.operation] ?? proposal.operation} · ${ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}`;

  return (
    <Box
      data-testid="proposal-detail"
      sx={{
        display: "flex",
        flexDirection: "column",
        ...(docked
          ? { height: "100%" }
          : { minHeight: `calc(100dvh - ${BOTTOM_NAV_SPACE})` }),
      }}
    >
      {!docked && (
        <PanelHeader
          title={proposalTitle(proposal)}
          subtitle={kind}
          onBack={onBack}
          actionButton={
            listStatus === proposal.status ? undefined : (
              <StatusChip status={proposal.status} />
            )
          }
        />
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          px: 2,
          py: 2,
          ...(docked
            ? { flex: 1, minHeight: 0, overflowY: "auto" }
            : {
                // On the phone the change reads as a card on the ground.
                m: 2,
                bgcolor: tokens.surface,
                borderRadius: `${tokens.radii.lg}px`,
                boxShadow: tokens.elevation.e1,
              }),
        }}
      >
        <ProposalVoteBar proposal={proposal} />

        {proposal.submitter_note && (
          <Box data-testid="proposal-submitter-note">
            <Typography sx={{ ...labelSx, color: "text.secondary" }}>
              Note from the submitter
            </Typography>
            <Typography
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {proposal.submitter_note}
            </Typography>
          </Box>
        )}

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

        <ProposalDetailPane proposal={proposal} showMap={!docked} />

        {proposal.review_note && (
          <Typography variant="caption" color="textSecondary">
            Note: {proposal.review_note}
          </Typography>
        )}
      </Box>

      {adminMode && proposal.status === "pending" && (
        // The bar's negative margins cancel this padding, so it runs edge to
        // edge at the foot; the auto margin docks it when the change is short.
        <Box sx={{ px: 2, pb: 2, flexShrink: 0, mt: "auto" }}>
          <ProposalReviewControls proposal={proposal} adminMode={adminMode} />
        </Box>
      )}
    </Box>
  );
}
