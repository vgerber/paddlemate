import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { Proposal } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { ENTITY_LABEL, OP_LABEL, proposalTitle } from "@/lib/proposals";
import { fonts, labelSx, theme } from "@/lib/theme";
import StatusChip from "./StatusChip";

const { tokens } = theme;

/** One proposal as a card in the list: what changed, of what kind, how old,
 * where its votes stand and its state. On a desktop it opens beside the
 * list, on a phone as its own page. */
export default function ProposalRow({
  proposal,
  selected,
  onSelect,
}: {
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasVotes = proposal.upvotes > 0 || proposal.downvotes > 0;
  return (
    <ButtonBase
      data-testid="proposal-card"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      sx={{
        display: "block",
        textAlign: "left",
        width: "calc(100% - 24px)",
        mx: 1.5,
        my: 0.75,
        px: 2,
        py: 1.5,
        minHeight: tokens.touch.row,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: selected ? tokens.primaryContainer : tokens.surface,
        boxShadow: tokens.elevation.e1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography
          noWrap
          sx={{
            fontFamily: fonts.label,
            fontWeight: 600,
            fontSize: "0.9375rem",
            flex: 1,
            minWidth: 0,
          }}
        >
          {proposalTitle(proposal)}
        </Typography>
        <StatusChip status={proposal.status} />
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
        <Typography sx={labelSx}>
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
            <ThumbUpOutlinedIcon sx={{ fontSize: 12 }} />
            <Typography variant="caption">{proposal.upvotes}</Typography>
            <ThumbDownOutlinedIcon sx={{ fontSize: 12, ml: 0.5 }} />
            <Typography variant="caption">{proposal.downvotes}</Typography>
          </Box>
        )}
        <Typography variant="caption" color="textDisabled">
          {timeAgo(proposal.created_at)}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
