import { theme } from "@/lib/theme";

/** What the area and region searches show above the bottom navigation while
 * their sheet rests at the peek: handle, mode tabs, the mode's own control. */
const PEEK_CONTENT = { area: 204, region: 252 } as const;

export type SheetMode = keyof typeof PEEK_CONTENT;

/** The sheet's peek height, with the bottom navigation that stands over it. */
export function modeSheetPeek(mode: SheetMode): number {
  return PEEK_CONTENT[mode] + theme.tokens.chrome.bottomNav;
}

interface SheetInput {
  isMobile: boolean;
  isAreaMode: boolean;
  isRegionMode: boolean;
  selectedWaterwayId: number | undefined;
  suggestMode: unknown;
}

/** The mode whose sheet holds the search on a phone, or null. Area and region
 * are searched by touching the map, so there the map stays in view and the
 * search rests over it as a peek sheet. A river takes the screen back. */
export function modeSheetMode(input: SheetInput): SheetMode | null {
  if (!input.isMobile || input.selectedWaterwayId != null) return null;
  if (input.suggestMode != null) return null;
  if (input.isAreaMode) return "area";
  return input.isRegionMode ? "region" : null;
}
