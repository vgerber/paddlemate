import Box from "@mui/material/Box";
import type { ProposalStatus } from "@/lib/api";
import { fonts, theme } from "@/lib/theme";
import { STATUS_LABEL } from "./status";

const { tokens } = theme;

const TONE: Record<ProposalStatus, { bg: string; fg: string }> = {
  pending: { bg: tokens.surfaceHighest, fg: tokens.onSurfaceVariant },
  approved: { bg: tokens.successContainer, fg: tokens.onSuccessContainer },
  rejected: { bg: tokens.errorContainer, fg: tokens.error },
};

/** A proposal's state as a quiet word on a tinted pill. Not a hit target. */
export default function StatusChip({ status }: { status: ProposalStatus }) {
  const tone = TONE[status];
  return (
    <Box
      component="span"
      data-testid="proposal-status"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        px: 1.25,
        borderRadius: `${tokens.radii.pill}px`,
        bgcolor: tone.bg,
        color: tone.fg,
        fontFamily: fonts.body,
        fontWeight: 600,
        fontSize: "0.75rem",
        flexShrink: 0,
      }}
    >
      {STATUS_LABEL[status]}
    </Box>
  );
}
