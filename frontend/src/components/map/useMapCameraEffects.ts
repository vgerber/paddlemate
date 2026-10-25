import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { SectionWithFeatures } from "@/lib/api";
import {
  type AreaCircle,
  type Bounds,
  boundsOf,
  circleBounds,
  lineCoords,
} from "@/lib/geo";
import { cameraMs } from "@/lib/motion";
import { cameraEasing, fitMs, fitSelection, screensTo } from "./cameraMotion";
import type { MapPadding, MapSubject } from "./Map";

interface UseMapCameraEffectsParams {
  mapRef: RefObject<MapRef | null>;
  mapLoaded: boolean;
  setMapLoaded: Dispatch<SetStateAction<boolean>>;
  addMapImages: (map: ReturnType<MapRef["getMap"]> | undefined) => void;
  sections?: SectionWithFeatures[];
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  selectedSectionId?: number | null;
  focusedPoint?: [number, number] | null;
  /** A region is the search area, so the camera belongs to it rather than to
   * the rivers found inside it. */
  regionFocused?: boolean;
  focusBounds?: Bounds | null;
  /** Extra bottom padding (px) for focus moves when an overlay covers the
   * lower part of the canvas (mobile suggest panel). */
  focusPaddingBottom?: number;
  /** The free map area as fit padding; replaces the fixed values below. */
  padding?: MapPadding;
  /** The framed subject; undefined leaves the camera to the fits below. */
  subject?: MapSubject | null;
}

/** A refit that follows a padding change after this many ms of quiet eases;
 * changes arriving faster (a card being dragged) jump so the map keeps up. */
const DRAG_GAP_MS = 120;
/** The subject counts as inside the free area within this many px. */
const INSIDE_SLACK = 1;

export function useMapCameraEffects({
  mapRef,
  mapLoaded,
  setMapLoaded,
  addMapImages,
  sections,
  areaCircle,
  areaLocked,
  selectedSectionId,
  focusedPoint,
  regionFocused,
  focusBounds,
  focusPaddingBottom = 0,
  padding,
  subject,
}: UseMapCameraEffectsParams) {
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const focusedRef = useRef(focusedPoint);
  focusedRef.current = focusedPoint;
  const padKey = padding
    ? `${padding.top},${padding.right},${padding.bottom},${padding.left}`
    : "";
  const subjectKey = subject?.key;
  // A subject (even an empty one) hands the camera to the canvas.
  const hasSubject = subject !== undefined;

  // The images are drawn for one scheme; a different `addMapImages` means the
  // scheme changed and they are drawn again.
  const drawnWith = useRef(addMapImages);
  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap();
    drawnWith.current = addMapImages;
    addMapImages(map);
    // MapLibre opens the compact attribution on load and only closes it when
    // the info button is tapped, which on a phone leaves a bar across the
    // top of the map for good. Start it collapsed instead; the button is
    // still there and still opens it.
    map
      ?.getContainer()
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show");
  }, [setMapLoaded, mapRef, addMapImages]);

  // Re-add custom images whenever the style is swapped (e.g. satellite toggle)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const handler = () => addMapImages(map);
    if (drawnWith.current !== addMapImages) {
      drawnWith.current = addMapImages;
      handler();
    }
    map.on("style.load", handler);
    return () => {
      map.off("style.load", handler);
    };
  }, [mapLoaded, mapRef, addMapImages]);

  // Fit bounds to all sections. Area and region searches frame the search
  // area instead - the rivers found in a region sit somewhere inside it, and
  // zooming to them would hide the region the user just picked.
  useEffect(() => {
    if (areaCircle || regionFocused || hasSubject) return;
    const map = mapRef.current;
    if (!map || !mapLoaded || !sections?.length || areaLocked) return;
    const bounds = boundsOf(
      sections.flatMap((s) => lineCoords(s.location) ?? []),
    );
    if (!bounds) return;
    map.fitBounds(bounds, {
      padding: paddingRef.current ?? 60,
      duration: fitMs(true),
      easing: cameraEasing,
    });
  }, [
    sections,
    mapLoaded,
    areaLocked,
    areaCircle,
    regionFocused,
    hasSubject,
    mapRef,
  ]);

  // Fit bounds to area circle (area search mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !areaCircle) return;
    map.fitBounds(circleBounds(areaCircle), {
      padding: paddingRef.current ?? 60,
      duration: fitMs(true),
      easing: cameraEasing,
    });
  }, [areaCircle, mapLoaded, mapRef]);

  // Fit bounds to selected section
  useEffect(() => {
    const map = mapRef.current;
    if (hasSubject) return;
    if (!map || !mapLoaded || !selectedSectionId || !sections?.length) return;
    const section = sections.find((s) => s.id === selectedSectionId);
    const bounds = boundsOf(lineCoords(section?.location) ?? []);
    if (!bounds) return;
    fitSelection(map, bounds, { padding: paddingRef.current ?? 80 });
  }, [selectedSectionId, sections, mapLoaded, hasSubject, mapRef]);

  // Fly to a focused feature point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !focusedPoint) return;
    const zoom = Math.max(map.getZoom(), 14);
    map.easeTo({
      center: focusedPoint,
      zoom,
      // Centre it in the free area beside the cards, not the whole window.
      ...(paddingRef.current && { padding: paddingRef.current }),
      duration: cameraMs(screensTo(map, focusedPoint, zoom)),
      easing: cameraEasing,
    });
  }, [focusedPoint, mapLoaded, mapRef]);

  // Fit a requested bounding box (e.g. a gauge-backed river's stations).
  // maxZoom keeps a single-station box from zooming in to street level.
  // The extra bottom padding keeps the target inside the visible strip when
  // an overlay covers the lower part of the canvas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !focusBounds) return;
    map.fitBounds(focusBounds, {
      padding: paddingRef.current ?? {
        top: 60,
        left: 60,
        right: 60,
        bottom: 60 + focusPaddingBottom,
      },
      duration: fitMs(true),
      easing: cameraEasing,
      maxZoom: 11,
    });
  }, [focusBounds, mapLoaded, mapRef, focusPaddingBottom]);

  // Frame the subject when it changes. The first fit jumps so a deep link
  // opens on its subject instead of flying there.
  const framedKey = useRef<string | null>(null);
  const padKeyFramed = useRef(padKey);
  const padKeyNow = useRef(padKey);
  padKeyNow.current = padKey;
  useEffect(() => {
    const map = mapRef.current;
    const s = subjectRef.current;
    if (!map || !mapLoaded || !s || subjectKey === undefined) return;
    const first = framedKey.current === null;
    framedKey.current = subjectKey;
    padKeyFramed.current = padKeyNow.current;
    const padding = paddingRef.current ?? 60;
    const zoomCap = s.maxZoom === undefined ? {} : { maxZoom: s.maxZoom };
    if (first) {
      map.fitBounds(s.bounds, { padding, duration: 0, ...zoomCap });
      return;
    }
    fitSelection(map, s.bounds, { padding, ...zoomCap });
  }, [subjectKey, mapLoaded, mapRef]);

  // Keep the subject in the free area when the padding changes (a card
  // dragged, collapsed or opened), unless it is already inside.
  const lastPadChange = useRef(0);
  useEffect(() => {
    if (!mapLoaded || padKeyFramed.current === padKey) return;
    padKeyFramed.current = padKey;
    const now = performance.now();
    const dragging = now - lastPadChange.current < DRAG_GAP_MS;
    lastPadChange.current = now;
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      const s = subjectRef.current;
      const pad = paddingRef.current;
      if (!map || !pad) return;
      // A focused feature keeps its place in the free area, at its zoom.
      const focus = focusedRef.current;
      if (focus) {
        map.easeTo({
          center: focus,
          padding: pad,
          duration: dragging ? 0 : fitMs(),
          easing: cameraEasing,
        });
        return;
      }
      if (!s || subjectInside(map, s, pad)) return;
      map.fitBounds(s.bounds, {
        padding: pad,
        duration: dragging ? 0 : fitMs(),
        easing: cameraEasing,
        ...(s.maxZoom !== undefined && { maxZoom: s.maxZoom }),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [padKey, mapLoaded, mapRef]);

  return { handleMapLoad };
}

/** Whether the subject's corners project inside the padded canvas. */
function subjectInside(
  map: MapRef,
  subject: MapSubject,
  pad: MapPadding,
): boolean {
  const el = map.getContainer();
  const [[west, south], [east, north]] = subject.bounds;
  const sw = map.project([west, south]);
  const ne = map.project([east, north]);
  return (
    sw.x >= pad.left - INSIDE_SLACK &&
    ne.x <= el.clientWidth - pad.right + INSIDE_SLACK &&
    ne.y >= pad.top - INSIDE_SLACK &&
    sw.y <= el.clientHeight - pad.bottom + INSIDE_SLACK
  );
}
