import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/api/client";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The chart's placeholder while its data loads: it fills the plot area, so
 * the card keeps its height and nothing jumps when the plot arrives. */
export function ChartSkeleton() {
  return (
    <Box
      data-testid="chart-skeleton"
      sx={{ height: "100%", p: 1.75, boxSizing: "border-box" }}
    >
      <Skeleton
        variant="rounded"
        animation="wave"
        sx={{
          height: "100%",
          minHeight: 48,
          borderRadius: `${tokens.radii.sm}px`,
        }}
      />
    </Box>
  );
}

/** A quiet note inside the chart card when its data could not be loaded. */
export function ChartError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Box
      data-testid="chart-error"
      role="alert"
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        px: 2,
        textAlign: "center",
      }}
    >
      <Typography variant="body2" color="textSecondary">
        {apiErrorMessage(error, "The chart could not be loaded.")}
      </Typography>
      <Button
        size="small"
        onClick={onRetry}
        sx={{ minHeight: tokens.touch.min }}
      >
        Retry
      </Button>
    </Box>
  );
}
