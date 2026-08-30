import OpenInFullOutlinedIcon from "@mui/icons-material/OpenInFullOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import type { Proposal } from "@/lib/api";
import {
  ENTITY_LABEL,
  OP_LABEL,
  proposalTitle,
  STATUS_COLOR,
} from "@/lib/proposals";
import { fonts } from "@/lib/theme";

/** Card title row (name, status, open-detail button) plus the
 * entity-and-operation line under it. */
export default function ProposalCardHeader({
  proposal,
}: {
  proposal: Proposal;
}) {
  const navigate = useNavigate();
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.02em",
            flex: 1,
            minWidth: 0,
            textTransform:
              proposal.entity_type === "feature" ? "capitalize" : "none",
          }}
          noWrap
        >
          {proposalTitle(proposal)}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: fonts.label,
            color: `${STATUS_COLOR[proposal.status]}.main`,
            flexShrink: 0,
          }}
        >
          {proposal.status}
        </Typography>
        <Tooltip title="View full proposal">
          <IconButton
            size="small"
            aria-label="View full proposal"
            onClick={() =>
              navigate({
                to: "/proposals/$proposalId",
                params: { proposalId: String(proposal.id) },
              })
            }
            sx={{ flexShrink: 0, mt: -0.5 }}
          >
            <OpenInFullOutlinedIcon sx={{ fontSize: "0.9rem" }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography
        sx={{
          fontSize: "0.6875rem",
          color: "text.disabled",
          fontFamily: fonts.label,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type} ·{" "}
        {OP_LABEL[proposal.operation] ?? proposal.operation}
      </Typography>
    </>
  );
}
