export interface DayProps {
  today: string;
  /** The day the reader is on; null where nothing is picked. */
  current: string | null;
  /** The trip's own span, tinted. */
  from: string;
  to: string | null;
  runs: Map<string, number>;
  /** Days that can be picked; null means every day. */
  planned: Set<string> | null;
  onPick: (date: string) => void;
}
