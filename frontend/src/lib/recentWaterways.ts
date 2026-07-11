/** Recently viewed rivers, persisted in localStorage (most recent first). */
export interface RecentWaterway {
  id: number;
  name: string;
}

const LS_KEY = "pm.recent-waterways";
const MAX_RECENT = 20;

export function readRecentWaterways(): RecentWaterway[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentWaterway =>
          e != null && typeof e.id === "number" && typeof e.name === "string",
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Move (or insert) a river at the front of the recent list, keeping 20. */
export function pushRecentWaterway(entry: RecentWaterway): void {
  try {
    const rest = readRecentWaterways().filter((e) => e.id !== entry.id);
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([entry, ...rest].slice(0, MAX_RECENT)),
    );
  } catch {
    // Storage unavailable (private mode, quota) - recents are best-effort
  }
}
