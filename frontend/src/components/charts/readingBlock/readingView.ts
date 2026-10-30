/** What the block says about the newest reading (or the one scrubbed): when,
 * and which level. The value itself is drawn at the line's end. */
export interface ReadingView {
  /** "18:48" or "Oct 10, 14:00"; empty when there is no reading at all. */
  time: string;
  /** "12m ago", beside the time. */
  age: string;
  /** The reading shown: the latest, or the hovered point. */
  value: number | null;
  unit: string;
  /** Level word and its dot colour; absent while stale or uncalibrated. */
  level?: { word: string; color: string };
  stale: boolean;
}

/** The Level or Flow choice; only for a gauge that measures both. */
export interface ReadingMeasurement {
  types: { type: string; label: string }[];
  type: string | null;
  onType: (type: string) => void;
}

/** The number as drawn: one decimal at most, a dash when there is none. */
export function readingNumberText(value: number | null): string {
  return value == null ? "-" : String(Number(value.toFixed(1)));
}

/** The time line under the gauge name: "time · age", or the time alone. */
export function readingTimeLine(view: ReadingView): string {
  return view.age ? `${view.time} · ${view.age}` : view.time;
}
