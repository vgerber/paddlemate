import Chip from "@mui/material/Chip";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** A filter as a chip: a summary that opens the sheet, or a toggle inside it. */
export default function FilterChip({
  label,
  set,
  onClick,
  onDelete,
  plain = false,
  testId,
}: {
  testId?: string;
  label: string;
  set: boolean;
  /** Absent for a chip that only shows a value and can be removed. */
  onClick?: () => void;
  onDelete?: () => void;
  /** A toggle inside the sheet rather than a summary chip. */
  plain?: boolean;
}) {
  return (
    <Chip
      data-testid={testId}
      variant="outlined"
      clickable={onClick != null}
      onClick={onClick}
      onDelete={onDelete}
      aria-pressed={plain ? set : undefined}
      color={set ? "primary" : "default"}
      // A toggle in the sheet is the thing being tapped: full touch height.
      sx={{
        height: tokens.touch.min,
        // The X is a touch target of its own.
        "& .MuiChip-deleteIcon": {
          position: "relative",
          zIndex: 1,
          m: 0,
          mr: 0.5,
          p: 1.25,
          boxSizing: "content-box",
        },
        // Dark: a resting chip needs a visible outline (light draws none on
        // summary chips and MUI's own hairline on toggles).
        ...(!set && {
          '[data-theme="dark"] &': { borderColor: tokens.outline },
        }),
        ...(!set &&
          !plain && {
            bgcolor: tokens.surface,
            borderColor: "transparent",
            boxShadow: tokens.elevation.e1,
          }),
      }}
      label={label}
    />
  );
}
