import { useEffect, useState } from "react";

const isLost = (el: Element | null) =>
  !el || el === document.body || el === document.documentElement;

/** Puts focus into a view that has just replaced the one holding it, so the
 * next Tab continues inside it instead of starting at the page's top. Attach
 * the ref to the view's heading (give it `tabIndex={-1}`).
 * - `lost`: only when the old view took focus with it (a Save that
 *   navigates away); a click that leaves focus on its row keeps it there.
 * - `always`: also when focus sits on the opener, and hand it back to the
 *   opener when the view closes. */
export function useViewFocus<T extends HTMLElement>(
  mode: "lost" | "always" | undefined,
) {
  // A state ref: the heading may mount after the view (behind a loading state).
  const [node, ref] = useState<T | null>(null);
  useEffect(() => {
    if (!mode || !node) return;
    const opener = document.activeElement;
    const lost = isLost(opener);
    if (mode === "always" || lost) node?.focus({ preventScroll: true });
    return () => {
      if (mode !== "always" || lost || !(opener instanceof HTMLElement)) return;
      // After the commit: the opener may sit in a subtree that was inert.
      requestAnimationFrame(() => {
        if (opener.isConnected && isLost(document.activeElement))
          opener.focus({ preventScroll: true });
      });
    };
  }, [mode, node]);
  return ref;
}
