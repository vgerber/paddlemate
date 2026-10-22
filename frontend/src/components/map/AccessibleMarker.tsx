import { useEffect, useRef } from "react";
import {
  Marker,
  type MarkerInstance,
  type MarkerProps,
} from "react-map-gl/maplibre";

/** A react-map-gl `Marker` whose MapLibre wrapper element is not a second,
 * generically named "Map marker" button. By default the wrapper is
 * presentational and the child is the one control (or decoration). With
 * `label` the wrapper itself is the named control, for children that are not
 * interactive. */
export default function AccessibleMarker({
  label,
  children,
  ...props
}: MarkerProps & { label?: string }) {
  const ref = useRef<MarkerInstance>(null);
  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    if (label) {
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", label);
      el.setAttribute("tabindex", "0");
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        el.click();
      };
      el.addEventListener("keydown", onKey);
      return () => el.removeEventListener("keydown", onKey);
    }
    el.setAttribute("role", "presentation");
    el.removeAttribute("aria-label");
  }, [label]);
  return (
    <Marker ref={ref} {...props}>
      {children}
    </Marker>
  );
}
