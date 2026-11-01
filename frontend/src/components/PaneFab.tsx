import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme/theme";

/** Bottom padding of a scrolling list so the FAB never covers its last row
 * (phone only; desktop docks its action). */
export const fabRoom = {
  xs: `${theme.tokens.phone.fabRoom}px`,
} as const;

/** Gap between the FAB and what rides above it, px. */
const FAB_GAP = 8;
const FAB_SIZE = 56;
const FAB_EDGE = 16;

/** How far above the bottom nav a bar must sit to clear the FAB, px. For a bar
 * pinned inside a scroller that already ends at the nav. */
export const fabClearance = FAB_EDGE + FAB_SIZE + FAB_GAP;

/** The bottom offset that clears the FAB: for a bar pinned above it. */
export const aboveFab = `calc(${BOTTOM_NAV_SPACE} + ${fabClearance}px)`;

/** On a phone, the screen's corner above the bottom nav. From `md` up a
 * pane's primary action is docked at its foot instead (`DockedAction`), so
 * the button never floats over the content it adds to. */
export const fabSx = {
  position: "fixed" as const,
  bottom: `calc(${BOTTOM_NAV_SPACE} + ${FAB_EDGE}px)`,
  right: FAB_EDGE,
  display: { xs: "flex", md: "none" },
};
