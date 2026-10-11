export type QueryViewState = "loading" | "error" | "empty" | "filled";

/** What a list should show for its query. Rows already in hand win over a
 * failed refetch, so a hiccup never blanks a list; a failure with nothing to
 * show is an error, never "empty". */
export function queryViewState(q: {
  isLoading: boolean;
  isError: boolean;
  count: number;
}): QueryViewState {
  if (q.count > 0) return "filled";
  if (q.isLoading) return "loading";
  if (q.isError) return "error";
  return "empty";
}
