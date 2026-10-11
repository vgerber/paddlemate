import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** A section's whitewater grade as a small square-cornered tag. */
export default function GradeTag({ grade }: { grade: string }) {
  return (
    <Box
      component="span"
      data-testid="grade-tag"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: "7px",
        height: 20,
        borderRadius: `${tokens.radii.xs}px`,
        bgcolor: tokens.surfaceHigh,
        boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
        color: "text.secondary",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: "20px",
        whiteSpace: "nowrap",
      }}
    >
      {grade}
    </Box>
  );
}
