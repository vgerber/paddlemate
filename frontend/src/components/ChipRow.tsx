import Box from "@mui/material/Box";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NO_SWIPE_ATTR } from "@/lib/hooks/useSwipeTabs";

/** Width of the fade at an edge the row continues past, in px. */
const FADE = 24;

/** One row of chips that scrolls sideways, fading at the edge it continues
 * past. The chips are the theme's: 32px to look at, 44px to hit. The row
 * keeps its own horizontal gesture, so a tab swipe never starts on it. */
export default function ChipRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const fade = `linear-gradient(to right, ${more.start ? "transparent" : "#000"}, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${more.end ? "transparent" : "#000"})`;

  return (
    <Box
      ref={ref}
      {...{ [NO_SWIPE_ATTR]: "" }}
      onScroll={measure}
      sx={{
        display: "flex",
        gap: 1,
        // Room for the chips' 44px hit area, which overflow would clip.
        py: "6px",
        overflowX: "auto",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        "& > *": { flexShrink: 0 },
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    >
      {children}
    </Box>
  );
}
