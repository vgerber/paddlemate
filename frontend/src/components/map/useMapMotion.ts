import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { durations, REDUCED_FADE_MS, useReducedMotion } from "@/lib/motion";
import { theme } from "@/lib/theme";

/** Layers and sources the motion drives; SectionLayers draws them. */
export const FLOW_LAYER = "sections-flow";
export const DRAWIN_SOURCE = "section-drawin";
export const DRAWIN_CASING_LAYER = "section-drawin-casing";
export const DRAWIN_LINE_LAYER = "section-drawin-line";
export const SELECTED_CASING_LAYER = "sections-line-selected-casing";
export const SELECTED_LINE_LAYER = "sections-line-selected";

/** The flow: 12 frames at 12 Hz, one dash pattern per frame. */
export const FLOW_FRAMES = 12;
export const FLOW_FPS = 12;
const FLOW_DASH = 2;
const FLOW_GAP = 3;

/** No pointer, key or camera input for this long stops the ambient motion. */
export const IDLE_MS = 20_000;
const LOW_BATTERY = 0.2;

export const DRAWIN_MS = durations.slow;

/** Why ambient (looping) motion is paused. Empty means it may run. */
export type PauseReason =
  | "hidden"
  | "idle"
  | "reduced"
  | "overlay"
  | "battery"
  | "software";

const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/** True when a WebGL renderer string names a CPU rasteriser. */
export function isSoftwareRenderer(renderer: string | null | undefined) {
  return !!renderer && SOFTWARE_RENDERER.test(renderer);
}

/** The map canvas's GL renderer string, when the browser reveals it. */
function glRenderer(map: MlMap): string | null {
  const canvas = map.getCanvas();
  const gl = (canvas.getContext("webgl2") ??
    canvas.getContext("webgl")) as WebGLRenderingContext | null;
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  if (!gl || !info) return null;
  return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}

/** A dash pattern [dash, gap, ...] moved `shift` along its cycle. Always sums
 * to dash + gap, so the frames loop without a jump. */
export function shiftedDash(dash: number, gap: number, shift: number) {
  if (shift <= gap) return [0, shift, dash, gap - shift];
  const into = shift - gap;
  return [into, gap, dash - into, 0];
}

/** The loop of dash patterns, one per frame. */
export function flowFrames(count = FLOW_FRAMES): number[][] {
  const cycle = FLOW_DASH + FLOW_GAP;
  return Array.from({ length: count }, (_, i) =>
    shiftedDash(FLOW_DASH, FLOW_GAP, (i * cycle) / count),
  );
}

/** Control points of a CSS `cubic-bezier(a, b, c, d)` string. */
export function parseBezier(css: string): [number, number, number, number] {
  const nums = (css.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  if (nums.length !== 4) return [0, 0, 1, 1];
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 1, nums[3] ?? 1];
}

/** Easing function for CSS control points (x in 0..1 to y). */
export function cubicBezier([x1, y1, x2, y2]: readonly number[]) {
  const cx = 3 * (x1 ?? 0);
  const bx = 3 * ((x2 ?? 1) - (x1 ?? 0)) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * (y1 ?? 0);
  const by = 3 * ((y2 ?? 1) - (y1 ?? 0)) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(err) < 1e-5 || d === 0) break;
      t -= err / d;
    }
    return sy(t);
  };
}

const easeInOut = cubicBezier(parseBezier(theme.tokens.motion.easeInOut));

/** How far the draw-in has got (0..1) `elapsed` ms after it started. */
export function drawProgress(elapsed: number, durationMs = DRAWIN_MS): number {
  if (durationMs <= 0) return 1;
  return easeInOut(Math.min(1, Math.max(0, elapsed / durationMs)));
}

/** A line-gradient that shows `color` up to `progress` along the line. */
export function drawGradient(
  color: string,
  progress: number,
): ExpressionSpecification {
  return ["step", ["line-progress"], color, progress, "transparent"];
}

export interface DrawIn {
  sectionId: number;
  /** performance.now() when the head left the put-in. */
  startedAt: number;
  durationMs: number;
}

export interface MapMotion {
  reduced: boolean;
  /** True while a section is drawing itself in: the plain selected line waits. */
  drawing: boolean;
  /** The running draw-in, for markers that fade in as the head passes. */
  drawIn: DrawIn | null;
  /** True when looping motion is allowed right now (no pause reason). */
  ambient: boolean;
  /** True while the flow requests frames. Gauge markers read this. */
  flowing: boolean;
  pauseReasons: ReadonlySet<PauseReason>;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

interface Options {
  map: MlMap | null;
  selectedSectionId?: number | null;
  /** The selected section's feature is in the sections data. */
  hasSelectedFeature: boolean;
  /** A full-screen overlay covers the map. */
  covered?: boolean;
  /** Section lines are drawn at all (a wizard preview map has none). */
  enabled?: boolean;
  colors: DrawColors;
}

export interface DrawColors {
  casing: string;
  line: string;
}

function noop() {
  // nothing is waiting to be woken
}

function layerOn(map: MlMap, id: string) {
  return map.getLayer(id) != null;
}

/** Owns the map's motion policy: the flow along the selected section, its
 * draw-in, and when ambient motion must stop. React never runs per frame;
 * every tick is a MapLibre paint call. */
export function useMapMotion({
  map,
  selectedSectionId,
  hasSelectedFeature,
  covered = false,
  enabled = true,
  colors,
}: Options): MapMotion {
  const reduced = useReducedMotion();
  const [reasons, setReasons] = useState<ReadonlySet<PauseReason>>(new Set());
  const reasonsRef = useRef<ReadonlySet<PauseReason>>(reasons);
  const wake = useRef<() => void>(noop);
  const [doneId, setDoneId] = useState<number | null>(null);
  const [drawIn, setDrawIn] = useState<DrawIn | null>(null);

  const setReason = useCallback((r: PauseReason, on: boolean) => {
    if (reasonsRef.current.has(r) === on) return;
    const next = new Set(reasonsRef.current);
    if (on) next.add(r);
    else next.delete(r);
    reasonsRef.current = next;
    setReasons(next);
    if (next.size === 0) wake.current();
  }, []);

  useEffect(() => setReason("reduced", reduced), [reduced, setReason]);
  // Browser tests cover the map without a real overlay (development only).
  const [forcedCover, setForcedCover] = useState(false);
  const [forcedSoftware, setForcedSoftware] = useState<boolean | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __paddlemateMotion: {
        cover: setForcedCover,
        software: setForcedSoftware,
      },
    });
  }, []);
  // A CPU rasteriser pays for every repaint, so the flow is not worth it.
  const [software, setSoftware] = useState(false);
  useEffect(() => {
    if (map) setSoftware(isSoftwareRenderer(glRenderer(map)));
  }, [map]);
  useEffect(
    () => setReason("software", forcedSoftware ?? software),
    [forcedSoftware, software, setReason],
  );
  useEffect(
    () => setReason("overlay", covered || forcedCover),
    [covered, forcedCover, setReason],
  );

  useEffect(() => {
    const onVis = () => setReason("hidden", document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [setReason]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const touch = () => {
      setReason("idle", false);
      clearTimeout(timer);
      timer = setTimeout(() => setReason("idle", true), IDLE_MS);
    };
    touch();
    const opts = { passive: true } as const;
    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "touchstart",
    ] as const;
    for (const e of events) window.addEventListener(e, touch, opts);
    map?.on("movestart", touch);
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, touch);
      map?.off("movestart", touch);
    };
  }, [map, setReason]);

  useEffect(() => {
    // Chromium only; where the API is missing there is no battery rule.
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (!nav.getBattery) return;
    let battery: BatteryManager | undefined;
    let gone = false;
    const check = () =>
      battery &&
      setReason("battery", !battery.charging && battery.level < LOW_BATTERY);
    nav.getBattery().then((b) => {
      if (gone) return;
      battery = b;
      check();
      b.addEventListener("levelchange", check);
      b.addEventListener("chargingchange", check);
    });
    return () => {
      gone = true;
      battery?.removeEventListener("levelchange", check);
      battery?.removeEventListener("chargingchange", check);
    };
  }, [setReason]);

  // Deselecting forgets the draw-in, so selecting the same section again
  // draws it in again.
  useEffect(() => {
    if (selectedSectionId == null) setDoneId(null);
  }, [selectedSectionId]);

  const drawing =
    enabled &&
    !reduced &&
    selectedSectionId != null &&
    doneId !== selectedSectionId;
  const ambient = reasons.size === 0;
  const flowing =
    enabled && ambient && selectedSectionId != null && !drawing && map != null;

  useLayoutEffect(() => {
    if (!map || !drawing || selectedSectionId == null || !hasSelectedFeature) {
      return;
    }
    const id = selectedSectionId;
    // Cleared head first, so a stale gradient never shows on the new line.
    paintDrawIn(map, colors, 0);
    const startedAt = performance.now();
    setDrawIn({ sectionId: id, startedAt, durationMs: DRAWIN_MS });
    let raf = 0;
    const frame = (now: number) => {
      const p = drawProgress(now - startedAt);
      paintDrawIn(map, colors, p);
      if (p < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      setDrawIn(null);
      setDoneId(id);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      setDrawIn(null);
    };
  }, [map, drawing, selectedSectionId, hasSelectedFeature, colors]);

  useEffect(() => {
    if (!map || !flowing) return;
    const frames = flowFrames();
    const step = 1000 / FLOW_FPS;
    let raf = 0;
    let running = false;
    // The next frame is due on a fixed grid, so a late or early display
    // frame does not shift the average rate; half a display frame of slack.
    let due = Number.NEGATIVE_INFINITY;
    let i = 0;
    const frame = (ts: number) => {
      // Read the ref, not state: a pause stops the very next frame.
      if (reasonsRef.current.size > 0) {
        running = false;
        return;
      }
      if (ts >= due - 8) {
        due = Math.max(due + step, ts + step / 2);
        if (layerOn(map, FLOW_LAYER)) {
          map.setPaintProperty(
            FLOW_LAYER,
            "line-dasharray",
            frames[i % frames.length],
          );
        }
        i++;
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    wake.current = start;
    start();
    return () => {
      wake.current = noop;
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [map, flowing]);

  return useMemo<MapMotion>(
    () => ({
      reduced,
      drawing,
      drawIn,
      ambient,
      flowing,
      pauseReasons: reasons,
    }),
    [reduced, drawing, drawIn, ambient, flowing, reasons],
  );
}

function paintDrawIn(map: MlMap, colors: DrawColors, progress: number) {
  const layers: [string, string][] = [
    [DRAWIN_CASING_LAYER, colors.casing],
    [DRAWIN_LINE_LAYER, colors.line],
  ];
  for (const [layer, color] of layers) {
    if (!layerOn(map, layer)) continue;
    map.setPaintProperty(layer, "line-gradient", drawGradient(color, progress));
  }
}

let fadedOnce = false;

/** The map surface fades in once per page load, when its style is ready; later
 * maps appear at once. Spread the result into the map's style. */
export function useFirstLoadFade(ready: boolean): CSSProperties {
  const reduced = useReducedMotion();
  const [fades] = useState(() => !fadedOnce);
  useEffect(() => {
    if (ready) fadedOnce = true;
  }, [ready]);
  if (!fades) return {};
  const time = reduced ? REDUCED_FADE_MS : durations.base;
  return {
    opacity: ready ? 1 : 0,
    transition: `opacity ${time}ms ${theme.tokens.motion.easeOut}`,
  };
}
