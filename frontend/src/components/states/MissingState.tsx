import { ApiError } from "@/lib/api/client";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

/** A single item that did not load: "not found" only when the server said
 * 404, the server's own message with a Retry for anything else. */
export default function MissingState({
  error,
  notFound,
  onRetry,
  py = 6,
}: {
  error: unknown;
  /** The line for a 404 or a missing item without an error. */
  notFound: string;
  onRetry?: () => void;
  py?: number;
}) {
  if (error && !(error instanceof ApiError && error.status === 404)) {
    return <ErrorState error={error} onRetry={onRetry} py={py} />;
  }
  return <EmptyState title={notFound} py={py} />;
}
