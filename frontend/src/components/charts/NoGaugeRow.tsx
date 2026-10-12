import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The card's foot when the section has no gauge: it says so and, for a
 * signed-in user, offers the way to fix it. */
export default function NoGaugeRow({ onLink }: { onLink?: () => void }) {
  return (
    <Box
      data-testid="no-gauge"
      sx={{
        height: 64,
        flexShrink: 0,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        pl: 2,
        pr: 1,
        bgcolor: tokens.surface,
        borderTop: `1px solid ${tokens.outlineVariant}`,
      }}
    >
      <Typography sx={{ fontSize: "0.875rem", color: tokens.onSurfaceVariant }}>
        No gauge for this section
      </Typography>
      {onLink && (
        <Button
          onClick={onLink}
          sx={{ minHeight: tokens.touch.min, fontWeight: 600 }}
        >
          Link a gauge
        </Button>
      )}
    </Box>
  );
}
