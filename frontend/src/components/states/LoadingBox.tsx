import Box from "@mui/material/Box";
import DelayedSpinner from "./DelayedSpinner";

/** Centered loading spinner for panel and page bodies. The spinner is delayed. */
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
      }}
    >
      <DelayedSpinner size={size} thickness={4} />
    </Box>
  );
}
