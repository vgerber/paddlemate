import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useLayoutEffect, useRef, useState } from "react";
import { transition } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { primary, onSurfaceVariant } = theme.tokens;

interface UnderlineTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  /** Swipe progress toward a neighbour, -1 to 1 (positive is the next tab).
   * The underline and the two labels follow it. */
  progress?: number;
  /** True while a finger is down: the underline then tracks without easing. */
  dragging?: boolean;
}

/** The panel tab bar: MUI tabs with a 3px underline, scrollable when they do
 * not fit. */
export default function UnderlineTabs<T extends string>({
  value,
  onChange,
  items,
  progress = 0,
  dragging = false,
}: UnderlineTabsProps<T>) {
  const tabs = useRef<(HTMLElement | null)[]>([]);
  const [layout, setLayout] = useState<{ left: number; width: number }[]>([]);
  const index = items.findIndex((i) => i.value === value);
  const neighbour = progress === 0 ? -1 : index + Math.sign(progress);
  const target = items[neighbour] ? neighbour : -1;
  const mix = Math.abs(progress);

  // Tab geometry is only needed while a swipe is under way.
  const swiping = progress !== 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: items is a fresh array each render; its length is the change that matters
  useLayoutEffect(() => {
    if (!swiping) return;
    setLayout(
      items.map((_, i) => ({
        left: tabs.current[i]?.offsetLeft ?? 0,
        width: tabs.current[i]?.offsetWidth ?? 0,
      })),
    );
  }, [swiping, items.length]);

  const from = layout[index];
  const to = layout[target];
  const indicatorStyle =
    from && to
      ? {
          left: from.left + (to.left - from.left) * mix,
          width: from.width + (to.width - from.width) * mix,
          transition: dragging
            ? "none"
            : transition(["left", "width"], { duration: "base" }),
        }
      : undefined;

  const labelColor = (i: number) => {
    if (target < 0) return undefined;
    const share = i === index ? 1 - mix : i === target ? mix : 0;
    if (i !== index && i !== target) return undefined;
    return `color-mix(in srgb, ${primary} ${Math.round(share * 100)}%, ${onSurfaceVariant})`;
  };

  return (
    <Tabs
      value={index < 0 ? false : value}
      onChange={(_, v: T) => onChange(v)}
      variant="scrollable"
      scrollButtons={false}
      slotProps={{ indicator: { style: indicatorStyle } }}
      sx={{ "& .MuiTabs-flexContainer": { gap: 2.5 } }}
    >
      {items.map((item, i) => (
        <Tab
          key={item.value}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          value={item.value}
          label={item.label}
          style={{ color: labelColor(i) }}
        />
      ))}
    </Tabs>
  );
}
