import { useSyncExternalStore } from "react";

const NONE: ReadonlyMap<number, number> = new Map();

let current: ReadonlyMap<number, number> = NONE;
const listeners = new Set<() => void>();

/** The numbers the open section's features carry (feature id to number), so
 * the pins on the map match the rows in the card. */
export function setFeatureNumbers(next: ReadonlyMap<number, number> | null) {
  current = next ?? NONE;
  for (const l of listeners) l();
}

export function useFeatureNumbers(): ReadonlyMap<number, number> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
