import Box from "@mui/material/Box";
import CircularProgress, {
  type CircularProgressProps,
} from "@mui/material/CircularProgress";
import { SPINNER_DELAY_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { motion } = theme.tokens;

/** A spinner that waits `SPINNER_DELAY_MS` before it shows, so a fast answer
 * never flashes one. It keeps its box meanwhile, so nothing shifts. */
export default function DelayedSpinner({
  sx,
  ...props
}: CircularProgressProps) {
  // The delay sits on a wrapper: on the spinner itself it would replace
  // MUI's rotate animation.
  return (
    <Box
      component="span"
      data-delayed-spinner
      sx={{
        display: "inline-flex",
        animation: `pm-spinner-in ${motion.fast}ms ${motion.easeOut} ${SPINNER_DELAY_MS}ms backwards`,
        "@keyframes pm-spinner-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      <CircularProgress {...props} sx={sx} />
    </Box>
  );
}
