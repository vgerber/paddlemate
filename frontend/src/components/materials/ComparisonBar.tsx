import Box from "@mui/material/Box";
import { css } from "@/lib/theme/motion";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A zero-based bar under a number: its length is the value's share of the
 * largest. The transform moves, never the width; reduced motion drops it. */
export default function ComparisonBar({ ratio }: { ratio: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        mt: 0.5,
        height: 4,
        borderRadius: tokens.radii.pill,
        bgcolor: tokens.surfaceHigh,
        overflow: "hidden",
      }}
    >
      <Box
        data-testid="compare-bar-fill"
        sx={{
          height: "100%",
          bgcolor: tokens.primary,
          transformOrigin: "left",
          transform: `scaleX(${ratio})`,
          transition: `transform ${css.base} ${css.easeOut}`,
        }}
      />
    </Box>
  );
}
