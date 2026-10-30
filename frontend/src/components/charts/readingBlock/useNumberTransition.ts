import { useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion, REDUCED_FADE_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";

/** Follows a displayed text: the previous text while it leaves, and a count of
 * changes that keys the entering element so its animation replays. */
export function useNumberTransition(text: string) {
  const shown = useRef(text);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [changes, setChanges] = useState(0);
  useLayoutEffect(() => {
    if (text === shown.current) return;
    setLeaving(shown.current);
    setChanges((n) => n + 1);
    shown.current = text;
    const t = setTimeout(
      () => setLeaving(null),
      prefersReducedMotion() ? REDUCED_FADE_MS : theme.tokens.motion.fast,
    );
    return () => clearTimeout(t);
  }, [text]);
  return { leaving, changes };
}
