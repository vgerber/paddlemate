import type { ReactNode } from "react";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadingBox from "./LoadingBox";
import { queryViewState } from "./queryState";

interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Renders a list query's four states apart: loading, error (with Retry),
 * empty (one icon, one line) and filled (the children). `count` is the rows
 * in hand. */
export default function QueryStates({
  query,
  count,
  empty,
  errorFallback,
  loadingSize = 22,
  py,
  children,
}: {
  query: QueryLike;
  count: number;
  empty: { title: string; caption?: string; icon?: ReactNode };
  errorFallback?: string;
  loadingSize?: number;
  py?: number;
  children: ReactNode;
}) {
  const state = queryViewState({
    isLoading: query.isLoading,
    isError: query.isError,
    count,
  });
  if (state === "loading") return <LoadingBox size={loadingSize} />;
  if (state === "error") {
    return (
      <ErrorState
        error={query.error}
        fallback={errorFallback}
        onRetry={() => query.refetch()}
        py={py}
      />
    );
  }
  if (state === "empty") return <EmptyState {...empty} py={py} />;
  return <>{children}</>;
}
