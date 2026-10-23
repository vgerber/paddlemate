import type { Locator } from "@playwright/test";

/** The matches that are visible and not inside the swipe ghost: the inert
 * copy of the neighbour pane that renders a second set of the same controls
 * and states. */
export const seen = (l: Locator) =>
  l
    .filter({ visible: true })
    .locator("xpath=self::*[not(ancestor::*[@data-testid='swipe-ghost'])]");
