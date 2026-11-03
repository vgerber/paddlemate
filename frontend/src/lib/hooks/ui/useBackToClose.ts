import { useEffect, useRef } from "react";

const LAYER_KEY = "__layer";

let nextId = 0;

/** The layer id a history state carries, if any. */
export function layerOf(state: unknown): number | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const id = (state as Record<string, unknown>)[LAYER_KEY];
  return typeof id === "number" ? id : undefined;
}

/** A copy of `state` marked as layer `id`. The router's own keys are kept, so
 * its index bookkeeping sees the same entry. */
export function withLayer(state: unknown, id: number) {
  const base = typeof state === "object" && state !== null ? state : {};
  return { ...base, [LAYER_KEY]: id };
}

function pushLayer() {
  const id = nextId++;
  window.history.pushState(withLayer(window.history.state, id), "");
  return id;
}

/** Lets the phone's back button close a layer (a sheet, a viewer) instead of
 * leaving the page. While `open`, one history entry is pushed with the same
 * URL; going back pops it and calls `onBack`, which returns true when the
 * layer stays open (it stepped up one level) and the entry is pushed again.
 *
 * The popstate is stopped in the capture phase, so the router never sees it.
 * When the layer closes some other way the entry is popped again, unless a
 * navigation has already replaced it - a choice that navigates is kept. */
export function useBackToClose(open: boolean, onBack: () => boolean | void) {
  const handler = useRef(onBack);
  handler.current = onBack;
  const entry = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (timer.current !== undefined) {
      // A StrictMode re-run: the entry from the first run is still ours.
      window.clearTimeout(timer.current);
      timer.current = undefined;
    } else {
      entry.current = pushLayer();
    }

    const onPop = (e: PopStateEvent) => {
      if (
        entry.current === null ||
        layerOf(window.history.state) === entry.current
      )
        return;
      e.stopImmediatePropagation();
      entry.current = null;
      if (handler.current() === true) entry.current = pushLayer();
    };
    window.addEventListener("popstate", onPop, true);

    return () => {
      window.removeEventListener("popstate", onPop, true);
      const id = entry.current;
      if (id === null) return;
      // Later than the router's own queued navigation, so a choice that
      // navigates has replaced the entry by then and is left alone.
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        if (entry.current !== id) return;
        entry.current = null;
        if (layerOf(window.history.state) !== id) return;
        const swallow = (e: PopStateEvent) => {
          e.stopImmediatePropagation();
          window.removeEventListener("popstate", swallow, true);
        };
        window.addEventListener("popstate", swallow, true);
        window.history.back();
      }, 0);
    };
  }, [open]);
}
