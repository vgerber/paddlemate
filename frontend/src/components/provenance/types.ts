/** Whose history: a river, one of its sections, or one feature. */
export type HistoryTarget =
  | { waterwayId: number }
  | { waterwayId: number; sectionId: number }
  | { waterwayId: number; sectionId: number; featureId: number };
