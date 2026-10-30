const HOUR = 3_600_000;

/** A reading older than this no longer says what the water does now. */
export function staleAfterMs(fetchIntervalSecs: number): number {
  return Math.max(3 * HOUR, 3 * fetchIntervalSecs * 1000);
}

/** True when the newest reading is missing or too old to stand for now. */
export function isStale(
  measuredAt: string | null | undefined,
  now: number,
  fetchIntervalSecs: number,
): boolean {
  if (!measuredAt) return true;
  const t = Date.parse(measuredAt);
  return !Number.isFinite(t) || now - t > staleAfterMs(fetchIntervalSecs);
}
