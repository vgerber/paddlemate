import Typography from "@mui/material/Typography";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** A small fact about a row as a pill on the quiet fill: a member's role, a
 * trip's role for you, the kind of a base. */
export default function RolePill({
  children,
  testId,
  minWidth,
}: {
  children: string;
  testId?: string;
  /** Pills in a column share one width so their edges line up. */
  minWidth?: number;
}) {
  return (
    <Typography
      component="span"
      data-testid={testId}
      sx={{
        ...labelSx,
        flexShrink: 0,
        minWidth,
        textAlign: "center",
        lineHeight: "22px",
        px: "9px",
        borderRadius: `${tokens.radii.pill}px`,
        bgcolor: tokens.surfaceHigh,
        color: tokens.onSurfaceVariant,
      }}
    >
      {children}
    </Typography>
  );
}
