import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
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
          <Button
            size="small"
            // A real link, opened by the router when it is a plain click.
            href={`/proposals/${proposal.id}`}
            onClick={(event) => {
              event.preventDefault();
              navigate({
                to: "/proposals/$proposalId",
                params: { proposalId: String(proposal.id) },
              });
            }}
            sx={{ minHeight: tokens.touch.min }}
          >
            View
          </Button>
        </Box>
      ))}
    </Box>
  );
}
