import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import type { Proposal } from "@/lib/api";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

const WHAT: Record<Proposal["operation"], string> = {
  create: "Your entry",
  update: "Your change",
  delete: "Your removal request",
};

/** A quiet line under the header telling the author their own proposal for
 * this entry is still waiting, with a link to it. */
export default function PendingProposalNote({
  proposals,
}: {
  proposals: Proposal[];
}) {
  if (proposals.length === 0) return null;
  return (
    <Box
      data-testid="pending-proposals"
      sx={{ px: 2, pt: 1.5, display: "grid", gap: 0.5 }}
    >
      {proposals.map((proposal) => (
        <Box
          key={proposal.id}
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {WHAT[proposal.operation]} is waiting for review.
          </Typography>
          <Link
            to="/proposals/$proposalId"
            params={{ proposalId: String(proposal.id) }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: tokens.touch.min,
              padding: "0 4px",
              fontSize: "0.875rem",
              color: tokens.primary,
            }}
          >
            View
          </Link>
        </Box>
      ))}
    </Box>
  );
}
