import { useEffect, useRef } from "react";
import {
  Marker,
  type MarkerInstance,
  type MarkerProps,
} from "react-map-gl/maplibre";

/** A named, clickable cluster that is not a Tab stop: a catalog holds
 * hundreds, most off screen, so the map's own keys (arrows, plus, minus)
 * are the keyboard path. */
export default function ClusterMarker({
  label,
  children,
  ...props
}: MarkerProps & { label: string }) {
  const ref = useRef<MarkerInstance>(null);
  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.setAttribute("tabindex", "-1");
  }, [label]);
  return (
    <Marker ref={ref} {...props}>
      {children}
    </Marker>
  );
}
