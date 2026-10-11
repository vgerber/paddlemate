import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { SPINNER_DELAY_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { motion } = theme.tokens;

/** Centered loading spinner for panel and page bodies. It waits 150 ms before
 * it shows, so a fast answer never flashes one. */
export default function LoadingBox({
  size = 24,
  py = 4,
  pt,
}: {
  size?: number;
  py?: number;
  /** Top-only padding for route-level screens; overrides py. */
  pt?: number;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        ...(pt != null ? { pt } : { py }),
        animation: `pm-spinner-in ${motion.fast}ms ${motion.easeOut} ${SPINNER_DELAY_MS}ms backwards`,
        "@keyframes pm-spinner-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      <CircularProgress size={size} thickness={4} />
    </Box>
  );
}
