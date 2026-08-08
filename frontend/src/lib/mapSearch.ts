/** The map route's full search-param shape with every key cleared. TanStack
 * Router requires the complete object on cross-route navigation - spread
 * this and set only the keys you need. */
export const EMPTY_MAP_SEARCH = {
  waterway: undefined,
  section: undefined,
  q: undefined,
  country: undefined,
  min_diff: undefined,
  max_diff: undefined,
  mode: undefined,
  panel: undefined,
  lat: undefined,
  lon: undefined,
  radius: undefined,
} as const;
