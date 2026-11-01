import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A label and its value on one line, a dimmed rule between rows: the
 * measurements of a detail card. */
export default function FactRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        minHeight: tokens.touch.min,
        "&:not(:last-child)": {
          borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
        },
      }}
    >
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
