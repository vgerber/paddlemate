import { ApiError } from "@/lib/api/client";

/** Query retry rule: a 4xx is the answer and never retried; a 5xx or a
 * network failure is retried once. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}
