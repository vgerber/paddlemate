import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/** Centered loading spinner for panel and page bodies. */
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
      <CircularProgress size={size} />
    </Box>
  );
}
