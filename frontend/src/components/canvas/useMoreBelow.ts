import { useEffect, useState } from "react";

/** Whether a scroller has more content below its visible part, for a fade
 * over its last pixels. */
export function useMoreBelow(el: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!el) return;
    const read = () =>
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // The scroller's content changes without its own box changing.
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
      mo.disconnect();
    };
  }, [el]);
  return more;
}
