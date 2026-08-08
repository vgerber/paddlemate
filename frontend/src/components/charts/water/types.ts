export type TimeRange = "24h" | "7d" | "1m" | "3m" | "6m" | "1y";

/** A logged descent drawn as a shaded time band in the charts (ms timestamps). */
export interface DescentSpan {
  id: number;
  start: number;
  end: number;
  /** Shown as a native hover tooltip on the band. */
  name?: string;
}
