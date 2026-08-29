import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import type { Proposal } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import {
  ENTITY_LABEL,
  OP_LABEL,
  proposalTitle,
  STATUS_COLOR,
} from "@/lib/proposals";
import { fonts, labelSx, theme } from "@/lib/theme";

/** One scannable line in the desktop proposals list: what changed, of what
 * kind, how old, and where its votes stand. The full proposal opens beside
 * the list rather than replacing it. */
export default function ProposalRow({
  proposal,
  selected,
  showStatus,
  onSelect,
}: {
  proposal: Proposal;
  selected: boolean;
  /** Only when it adds something - the status tab already filters the list. */
  showStatus?: boolean;
  onSelect: () => void;
}) {
  const hasVotes = proposal.upvotes > 0 || proposal.downvotes > 0;
  return (
    <ListItemButton
      selected={selected}
      onClick={onSelect}
      sx={{
        display: "block",
        borderBottom: "1px solid",
        // A full-strength rule between every row turns the list into a grid;
        // these only need to separate.
        borderColor: `${theme.tokens.outlineVariant}55`,
        py: 1.25,
        "&.Mui-selected": {
          bgcolor: `${theme.tokens.primary}14`,
          "&:hover": { bgcolor: `${theme.tokens.primary}1f` },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 600,
            fontSize: "0.8rem",
            flex: 1,
            minWidth: 0,
            textTransform:
              proposal.entity_type === "feature" ? "capitalize" : "none",
          }}
          noWrap
        >
          {proposalTitle(proposal)}
        </Typography>
        {showStatus && (
          <Typography
            sx={{
              ...labelSx,
              fontSize: "0.55rem",
              color: `${STATUS_COLOR[proposal.status]}.main`,
              flexShrink: 0,
            }}
          >
            {proposal.status}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mt: 0.25,
          color: "text.secondary",
        }}
      >
        <Typography sx={{ ...labelSx, fontSize: "0.55rem" }}>
          {OP_LABEL[proposal.operation] ?? proposal.operation} ·{" "}
          {ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {hasVotes && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              color: "text.disabled",
            }}
          >
            <ThumbUpOutlinedIcon sx={{ fontSize: 11 }} />
            <Typography variant="caption">{proposal.upvotes}</Typography>
            <ThumbDownOutlinedIcon sx={{ fontSize: 11, ml: 0.5 }} />
            <Typography variant="caption">{proposal.downvotes}</Typography>
          </Box>
        )}
        <Typography variant="caption" color="text.disabled">
          {timeAgo(proposal.created_at)}
        </Typography>
      </Box>
    </ListItemButton>
  );
}
