import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { CloseIcon, ExpandIcon } from "@/lib/icons";
import { withAlpha } from "@/lib/theme/alpha";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A filter as a chip: a summary that opens the sheet, or a toggle inside it. */
export default function FilterChip({
  label,
  set,
  onClick,
  onDelete,
  deleteLabel,
  plain = false,
  compact = false,
  testId,
  dropdown = false,
}: {
  /** A chevron after the label: the chip opens a picker. */
  dropdown?: boolean;
  testId?: string;
  label: string;
  set: boolean;
  /** Absent for a chip that only shows a value and can be removed. */
  onClick?: () => void;
  onDelete?: () => void;
  /** Names the X for a screen reader when the chip's own label is not enough. */
  deleteLabel?: string;
  /** A toggle inside the sheet rather than a summary chip. */
  plain?: boolean;
  /** A quiet toggle for a dense pane: a 32px pill, teal when set, inside the
   * same 44px hit area. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Chip
        data-testid={testId}
        clickable
        onClick={onClick}
        aria-pressed={set}
        label={label}
        sx={{
          height: tokens.touch.min,
          mr: 0.5,
          bgcolor: "transparent",
          "&:hover": { bgcolor: "transparent" },
          ...focusRingSx(-2),
          "& .MuiChip-label": {
            px: 1.5,
            lineHeight: "32px",
            borderRadius: `${tokens.radii.pill}px`,
            fontSize: "0.8125rem",
            fontWeight: 600,
            bgcolor: set
              ? withAlpha(tokens.primary, "wash")
              : tokens.surfaceLow,
            color: set ? tokens.primary : tokens.onSurfaceVariant,
          },
          "&:hover .MuiChip-label": {
            bgcolor: set
              ? withAlpha(tokens.primary, "hover")
              : tokens.surfaceHigh,
          },
        }}
      />
    );
  }
  return (
    <Chip
      data-testid={testId}
      variant="outlined"
      clickable={onClick != null}
      onClick={onClick}
      onDelete={onDelete}
      deleteIcon={
        deleteLabel ? <CloseIcon titleAccess={deleteLabel} /> : undefined
      }
      aria-pressed={plain ? set : undefined}
      color={set ? "primary" : "default"}
      // A toggle in the sheet is the thing being tapped: full touch height.
      sx={{
        height: tokens.touch.min,
        // The theme's chip style drops the button focus ring.
        ...focusRingSx(),
        // The X is a touch target of its own.
        "& .MuiChip-deleteIcon": {
          position: "relative",
          zIndex: 1,
          m: 0,
          mr: 0.5,
          p: 1.25,
          boxSizing: "content-box",
        },
        ...(!set &&
          !plain && {
            bgcolor: tokens.surface,
            borderColor: "transparent",
            // Beats the dark edge rule in the theme (same specificity, later).
            '[data-theme="dark"] &.MuiChip-outlined:not(.MuiChip-colorPrimary)':
              { borderColor: "transparent" },
            boxShadow: tokens.elevation.e1,
          }),
      }}
      label={
        dropdown ? (
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
          >
            {label}
            <ExpandIcon fontSize="small" />
          </Box>
        ) : (
          label
        )
      }
    />
  );
}
