import { useSyncExternalStore } from "react";
import {
  type CardInput,
  type CardSide,
  type DockRect,
  dockMode,
  dockRect,
  expandedLimit,
  type FreeArea,
  freeArea,
  layoutCards,
  type Placement,
} from "@/lib/canvasLayout";
import { type CardKind, cardWidth, clampCardWidth } from "@/lib/cardWidth";
import { theme } from "@/lib/theme";
import type { MapScene } from "./scene";

const { chrome } = theme.tokens;

/** A tiny external store: a value, listeners, and a hook. Components read
 * slices, so a change to one slice re-renders only its readers. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

interface SceneEntry {
  owner: symbol;
  scene: MapScene;
  rank: number;
}

/** The scenes routes have set, lowest rank first and oldest first within a
 * rank; the map draws the last. A screen inside a route (the log form in the
 * logs route) sets a higher rank, so its scene covers the route's whatever
 * order the two mount in, and uncovers it again when it unmounts. */
const sceneStore = createStore<readonly SceneEntry[]>([]);

/** Only an owner may replace or clear its entry, so a route that unmounts
 * after its successor mounted cannot clear the new one. */
export const scenes = {
  set(owner: symbol, scene: MapScene, rank = 0) {
    const stack = sceneStore.get();
    const at = stack.findIndex((e) => e.owner === owner);
    if (at >= 0 && stack[at].rank === rank) {
      sceneStore.set(
        stack.map((e, i) => (i === at ? { owner, scene, rank } : e)),
      );
      return;
    }
    // Insert after the last entry of the same or a lower rank.
    const rest = stack.filter((e) => e.owner !== owner);
    let to = rest.length;
    while (to > 0 && rest[to - 1].rank > rank) to--;
    sceneStore.set([
      ...rest.slice(0, to),
      { owner, scene, rank },
      ...rest.slice(to),
    ]);
  },
  current: (): MapScene | null => sceneStore.get().at(-1)?.scene ?? null,
  clear(owner: symbol) {
    const stack = sceneStore.get();
    if (!stack.some((e) => e.owner === owner)) return;
    sceneStore.set(stack.filter((e) => e.owner !== owner));
  },
};

export function useScene(): MapScene | null {
  return useSyncExternalStore(
    sceneStore.subscribe,
    () => sceneStore.get().at(-1)?.scene ?? null,
  );
}

export interface CardEntry {
  id: string;
  side: CardSide;
  kind: CardKind;
  priority: number;
  /** Remembered width fraction, for a resizable card. */
  frac: number | null;
}

export interface Viewport {
  /** Width without the scrollbar, and the full window height. */
  w: number;
  h: number;
}

export interface LayoutSnapshot {
  viewport: Viewport;
  placements: Map<string, Placement>;
  /** Sum of expanded widths, and the most they may sum to. */
  used: number;
  limit: number;
  free: FreeArea;
  /** The reading rail along the foot, when a chart wants it. */
  dock: DockRect | null;
}

interface LayoutState {
  cards: CardEntry[];
  live: { id: string; width: number } | null;
  pinned: string | null;
  viewport: Viewport;
  /** Charts that want the rail. */
  docks: number;
}

const initialViewport = (): Viewport =>
  typeof window === "undefined"
    ? { w: 1280, h: 800 }
    : { w: document.documentElement.clientWidth, h: window.innerHeight };

let state: LayoutState = {
  cards: [],
  live: null,
  pinned: null,
  viewport: initialViewport(),
  docks: 0,
};

function derive(s: LayoutState): LayoutSnapshot {
  const { w, h } = s.viewport;
  const inputs: CardInput[] = s.cards.map((c) => ({
    id: c.id,
    side: c.side,
    kind: c.kind,
    priority: c.priority,
    width:
      s.live?.id === c.id
        ? clampCardWidth(c.kind, s.live.width, w)
        : cardWidth(c.kind, w, c.frac),
  }));
  const list = layoutCards(inputs, w, s.pinned);
  const placements = new Map(list.map((p) => [p.id, p]));
  const used = list.reduce((sum, p) => (p.collapsed ? sum : sum + p.width), 0);
  const docked = s.docks > 0 && dockMode(w, h) === "dock";
  const dock = docked ? dockRect(list, w, h) : null;
  const hostHeight = h - chrome.appBar;
  return {
    viewport: s.viewport,
    placements,
    used,
    limit: expandedLimit(w, inputs),
    free: freeArea(list, w, hostHeight, dock?.height ?? null),
    dock,
  };
}

const layoutStore = createStore<LayoutSnapshot>(derive(state));

function update(next: Partial<LayoutState>) {
  state = { ...state, ...next };
  layoutStore.set(derive(state));
}

export const layout = {
  register(entry: CardEntry) {
    update({
      cards: [...state.cards.filter((c) => c.id !== entry.id), entry],
    });
  },
  unregister(id: string) {
    update({
      cards: state.cards.filter((c) => c.id !== id),
      pinned: state.pinned === id ? null : state.pinned,
      live: state.live?.id === id ? null : state.live,
    });
  },
  setFrac(id: string, frac: number) {
    update({
      cards: state.cards.map((c) => (c.id === id ? { ...c, frac } : c)),
    });
  },
  setLive(live: { id: string; width: number } | null) {
    update({ live });
  },
  pin(id: string | null) {
    update({ pinned: id });
  },
  setViewport(viewport: Viewport) {
    const v = state.viewport;
    if (v.w === viewport.w && v.h === viewport.h) return;
    update({ viewport });
  },
  addDock(delta: 1 | -1) {
    update({ docks: Math.max(0, state.docks + delta) });
  },
  get: () => layoutStore.get(),
};

export function useLayout<T>(select: (s: LayoutSnapshot) => T): T {
  return useSyncExternalStore(layoutStore.subscribe, () =>
    select(layoutStore.get()),
  );
}

const overlayStore = createStore<HTMLElement | null>(null);

export const overlay = {
  set: (el: HTMLElement | null) => overlayStore.set(el),
};

export function useOverlay(): HTMLElement | null {
  return useSyncExternalStore(overlayStore.subscribe, overlayStore.get);
}
