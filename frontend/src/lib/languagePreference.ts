/**
 * Which language the app shows names and descriptions in.
 *
 * Kept in a module store rather than React context because `localizedName` is
 * also called from plain modules such as the map layer builder, which cannot
 * read context. Components subscribe through `useLanguage`, everything else
 * reads `preferredLanguage()` directly.
 */

import { useSyncExternalStore } from "react";
import { isKnownLanguage } from "./languages";

const STORAGE_KEY = "paddlemate_display_language";
const FALLBACK = "en";

/** Base subtag only: "de-CH" and "de" are one language for our purposes. */
function baseCode(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? FALLBACK;
}

function resolveInitial(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isKnownLanguage(baseCode(stored))) return baseCode(stored);
  } catch {
    // Storage can be unavailable in private mode; fall through to the browser.
  }
  const fromBrowser = (navigator.languages ?? [navigator.language])
    .map(baseCode)
    .find(isKnownLanguage);
  return fromBrowser ?? FALLBACK;
}

let current = resolveInitial();
const listeners = new Set<() => void>();

/** Readable from anywhere, including outside React. */
export function preferredLanguage(): string {
  return current;
}

export function setPreferredLanguage(code: string): void {
  const next = baseCode(code);
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // A preference that cannot be persisted still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep other tabs of the same app in step.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      current = baseCode(event.newValue);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Re-renders the component when the display language changes. */
export function useLanguage(): string {
  return useSyncExternalStore(subscribe, preferredLanguage);
}

export function useLanguagePreference(): [string, (code: string) => void] {
  return [useLanguage(), setPreferredLanguage];
}
