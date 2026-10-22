import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import {
  desktopFlatRow,
  openRowSx,
  phoneRowPad,
} from "@/components/canvas/flatRow";
import type { Proposal } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { ENTITY_LABEL, OP_LABEL, proposalTitle } from "@/lib/proposals";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: "text.secondary",
  whiteSpace: "nowrap",
} as const;

/** One proposal as a card in the list: the title, then what it does and how
 * its votes stand. The status is the tab the list is filtered by, so the row
 * does not repeat it. On a desktop it opens beside the list, on a phone as
 * its own page. */
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
  const meta = [
    hasVotes && `▲ ${proposal.upvotes} · ▼ ${proposal.downvotes}`,
    timeAgo(proposal.created_at),
  ].filter(Boolean);
  return (
    <ButtonBase
      data-testid="proposal-card"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        textAlign: "left",
        width: "100%",
        px: "14px",
        ...phoneRowPad,
        py: 1.5,
        minHeight: 64,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        ...openRowSx(selected),
        ...desktopFlatRow,
        "&.Mui-focusVisible": {
          outline: `2px solid ${tokens.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      <Typography
        noWrap
        sx={{
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: "0.9375rem",
          lineHeight: "20px",
          flex: 1,
          minWidth: 0,
        }}
      >
        {proposalTitle(proposal)}
      </Typography>
      <Box sx={{ flexShrink: 0, textAlign: "right" }}>
        <Typography sx={{ ...metaSx, fontWeight: 400 }}>
          {OP_LABEL[proposal.operation] ?? proposal.operation} ·{" "}
          {ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}
        </Typography>
        <Typography
          data-testid="proposal-meta"
          sx={{ ...metaSx, fontWeight: 500 }}
        >
          {meta.join(" · ")}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
