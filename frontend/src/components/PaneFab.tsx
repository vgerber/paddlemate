import { BOTTOM_NAV_SPACE } from "@/lib/theme";

/** On a phone, the screen's corner above the bottom nav. From `md` up a
 * pane's primary action is docked at its foot instead (`DockedAction`), so
 * the button never floats over the content it adds to. */
export const fabSx = {
  position: "fixed" as const,
  bottom: `calc(${BOTTOM_NAV_SPACE} + 16px)`,
  right: 16,
  display: { xs: "flex", md: "none" },
};
