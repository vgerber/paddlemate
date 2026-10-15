import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/api/client";
import { StateTile } from "./EmptyState";

/** A failed load as a quiet note: the server's message and a Retry. Shown
 * where the list would be, never the empty state. */
export default function ErrorState({
  error,
  fallback = "Could not load this.",
  onRetry,
  py = 4,
}: {
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
  py?: number;
}) {
  return (
    <Box
      data-testid="error-state"
      role="alert"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.75,
        py,
        px: 2,
        textAlign: "center",
      }}
    >
      <StateTile>
        <ErrorOutlineIcon />
      </StateTile>
      <Typography
        variant="body2"
        sx={{
          fontSize: "0.875rem",
          lineHeight: "20px",
          color: "text.secondary",
        }}
      >
        {apiErrorMessage(error, fallback)}
      </Typography>
      {onRetry && (
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
