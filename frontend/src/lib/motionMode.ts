import { useEffect, useSyncExternalStore } from "react";

/** Where the choice is kept; the inline script in index.html reads it too. */
export const MOTION_KEY = "pm-motion";

export type MotionMode = "system" | "reduced" | "full";

const OS_QUERY = "(prefers-reduced-motion: reduce)";

/** What a stored mode shows. Full is the default; System follows the device.
 * index.html repeats this before first paint. */
export function resolveMotion(
  mode: MotionMode,
  osReduced: boolean,
): "reduced" | "full" {
  if (mode === "reduced") return "reduced";
  if (mode === "full") return "full";
  return osReduced ? "reduced" : "full";
}

/** Anything but reduced or system is Full, the default. */
export function parseMotionMode(raw: string | null | undefined): MotionMode {
  return raw === "reduced" || raw === "system" ? raw : "full";
}

function readMode(): MotionMode {
  try {
    return parseMotionMode(localStorage.getItem(MOTION_KEY));
  } catch {
    return "full";
  }
}

let current: MotionMode = readMode();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Another tab changed the choice: follow it (the event fires only there).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== MOTION_KEY) return;
    current = readMode();
    for (const fn of listeners) fn();
  });
}

function setMode(mode: MotionMode) {
  current = mode;
  try {
    if (mode === "full") localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  for (const fn of listeners) fn();
}

/** The device-local motion choice and its setter. */
export function useMotionMode(): [MotionMode, (m: MotionMode) => void] {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => "full" as const,
  );
  return [mode, setMode];
}

/** Keeps `html[data-motion]` on the resolved value after the setting or the
 * device setting changes. Mount once, in the root. */
export function useMotionSync() {
  const [mode] = useMotionMode();
  useEffect(() => {
    const query = window.matchMedia(OS_QUERY);
    const apply = () =>
      document.documentElement.setAttribute(
        "data-motion",
        resolveMotion(mode, query.matches),
      );
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [mode]);
}
