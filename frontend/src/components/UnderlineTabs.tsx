import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useEffect, useRef } from "react";
import type { SwipeTrack } from "@/lib/hooks/useSwipeTabs";
import { transition } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { primary, onSurfaceVariant } = theme.tokens;

interface UnderlineTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  /** Swipe progress from `useSwipeTabs`. The underline and the two labels
   * follow it by direct DOM writes, so a drag renders nothing. */
  track?: SwipeTrack;
}

/** Where the underline runs between, measured when a drag starts. */
interface Span {
  from: number;
  to: number;
  left: number;
  right: number;
  width: number;
  toWidth: number;
}

/** The panel tab bar: MUI tabs with a 3px underline, scrollable when they do
 * not fit. */
export default function UnderlineTabs<T extends string>({
  value,
  onChange,
  items,
  track,
}: UnderlineTabsProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLElement | null)[]>([]);
  const index = items.findIndex((i) => i.value === value);
  const latest = useRef({ index, count: items.length });
  latest.current = { index, count: items.length };

  useEffect(() => {
    const wrap = root.current;
    const line = bar.current;
    if (!track || !wrap || !line) return;
    let span: Span | null = null;
    const label = (i: number, share: number | null) => {
      const el = tabs.current[i];
      if (!el) return;
      el.style.color =
        share === null
          ? ""
          : `color-mix(in srgb, ${primary} ${Math.round(share * 100)}%, ${onSurfaceVariant})`;
    };
    const clear = () => {
      if (span) {
        label(span.from, null);
        label(span.to, null);
      }
      span = null;
      wrap.removeAttribute("data-swiping");
      line.style.display = "none";
    };
    // Geometry is read once, when the drag first moves.
    const measure = (to: number): Span | null => {
      const from = latest.current.index;
      const a = tabs.current[from];
      const t = tabs.current[to];
      if (!a || !t) return null;
      const origin = wrap.getBoundingClientRect().left;
      const ra = a.getBoundingClientRect();
      const rt = t.getBoundingClientRect();
      return {
        from,
        to,
        left: ra.left - origin,
        right: rt.left - origin,
        width: ra.width,
        toWidth: rt.width,
      };
    };
    return track.subscribe((e) => {
      if (e.phase === "done") return clear();
      if (e.phase === "down" || e.progress === 0) {
        if (!span) return;
      }
      const to = latest.current.index + (e.progress < 0 ? -1 : 1);
      if (!span || (e.progress !== 0 && span.to !== to)) {
        clear();
        span = measure(to);
        if (!span) return;
        wrap.setAttribute("data-swiping", "");
        line.style.display = "block";
        line.style.width = `${span.width}px`;
      }
      const mix = Math.abs(e.progress);
      const x = span.left + (span.right - span.left) * mix;
      const w = span.width + (span.toWidth - span.width) * mix;
      line.style.transition =
        e.phase === "move"
          ? "none"
          : transition("transform", { duration: "base" });
      line.style.transform = `translate3d(${x}px,0,0) scaleX(${w / span.width})`;
      label(span.from, 1 - mix);
      label(span.to, mix);
    });
  }, [track]);

  return (
    <Box
      ref={root}
      sx={{
        position: "relative",
        // The drag draws its own underline; the tabs' one waits underneath.
        "&[data-swiping] .MuiTabs-indicator": {
          visibility: "hidden",
          transition: "none",
        },
      }}
    >
      <Tabs
        value={index < 0 ? false : value}
        onChange={(_, v: T) => onChange(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          // The scroller is its own touch-action boundary: without this a
          // swipe that starts on the bar is taken as a sideways scroll.
          "& .MuiTabs-scroller": { touchAction: "pan-y" },
          "& .MuiTabs-list": { gap: 2.5 },
        }}
      >
        {items.map((item, i) => (
          <Tab
            key={item.value}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            value={item.value}
            label={item.label}
          />
        ))}
      </Tabs>
      <Box
        ref={bar}
        component="span"
        sx={{
          display: "none",
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 3,
          bgcolor: primary,
          borderRadius: "3px 3px 0 0",
          transformOrigin: "left",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
