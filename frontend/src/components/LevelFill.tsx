import {
  type CSSProperties,
  type HTMLAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/motion";

/** A round dot whose colour change fills from the centre: the new colour
 * grows over the old one as a scale on a layer, never as width or height.
 * Reduced motion cross-fades the new colour instead. The first colour is
 * shown at once. */
/** A level that is not known yet: the first reading arriving is not a change. */
const UNKNOWN = new Set(["unknown", "none"]);

export default function LevelFill({
  color,
  level,
  style,
  ...rest
}: {
  /** The level the colour stands for: only a change from one known level to another animates, a
   * colour that shifts with the theme is applied at once. */
  level: string;
  /** Any CSS colour, `transparent` for a ring-only dot. */
  color: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLSpanElement>, "style" | "color">) {
  const [shown, setShown] = useState(color);
  const [shownLevel, setShownLevel] = useState(level);
  const layer = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = layer.current;
    if (color === shown) return setShownLevel(level);
    if (!el || level === shownLevel || UNKNOWN.has(shownLevel)) {
      setShown(color);
      return setShownLevel(level);
    }
    const reduced = prefersReducedMotion();
    const anim = el.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: "scale(0)" }, { transform: "scale(1)" }],
      {
        duration: reduced ? REDUCED_FADE_MS : durations.base,
        easing: css.easeOut,
        fill: "both",
      },
    );
    const done = () => {
      setShown(color);
      setShownLevel(level);
    };
    anim.onfinish = done;
    anim.oncancel = done;
    return () => anim.cancel();
  }, [color, level, shown, shownLevel]);
  return (
    <span
      {...rest}
      data-fill-color={color}
      style={{
        position: "relative",
        display: "block",
        overflow: "hidden",
        background: shown,
        ...style,
      }}
    >
      {color !== shown && level !== shownLevel && !UNKNOWN.has(shownLevel) && (
        <span
          ref={layer}
          data-testid="level-fill-layer"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: color,
          }}
        />
      )}
    </span>
  );
}
