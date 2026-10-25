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
  return (
    <CircularProgress
      {...props}
      sx={[
        {
          animation: `pm-spinner-in ${motion.fast}ms ${motion.easeOut} ${SPINNER_DELAY_MS}ms backwards`,
          "@keyframes pm-spinner-in": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
