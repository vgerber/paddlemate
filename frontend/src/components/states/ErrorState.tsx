import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Button from "@mui/material/Button";
import { apiErrorMessage } from "@/lib/api/client";
import StateLayout from "./StateLayout";

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
    <StateLayout
      data-testid="error-state"
      role="alert"
      icon={<ErrorOutlineIcon />}
      title={apiErrorMessage(error, fallback)}
      py={py}
    >
      {onRetry && (
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      )}
    </StateLayout>
  );
}
