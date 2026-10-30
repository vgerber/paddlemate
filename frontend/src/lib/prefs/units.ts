import { useSyncExternalStore } from "react";

/** Where the choice is kept, per device like the colour mode. */
export const UNITS_KEY = "pm-units";

export type WeightUnit = "kg" | "lb";
export type DistanceUnit = "km" | "mi";
export type LengthUnit = "cm" | "in";

export interface Units {
  weight: WeightUnit;
  distance: DistanceUnit;
  /** Volume follows length: litres with cm, US gallons with in. */
  length: LengthUnit;
}

/** What each quantity is stored as: kg, km, cm and litres. */
export type Quantity = "weight" | "distance" | "length" | "volume";

export const METRIC: Units = { weight: "kg", distance: "km", length: "cm" };
export const IMPERIAL: Units = { weight: "lb", distance: "mi", length: "in" };

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
const CM_PER_IN = 2.54;
const L_PER_GAL = 3.785411784;

/** Metric units per display unit. */
const FACTOR = {
  kg: 1,
  lb: KG_PER_LB,
  km: 1,
  mi: KM_PER_MI,
  cm: 1,
  in: CM_PER_IN,
  l: 1,
  gal: L_PER_GAL,
} as const;

type UnitName = keyof typeof FACTOR;

function unitFor(quantity: Quantity, units: Units): UnitName {
  if (quantity === "volume") return units.length === "in" ? "gal" : "l";
  return units[quantity];
}

/** The label of a quantity's unit: "kg", "mi", "in", "gal". */
export function unitLabel(quantity: Quantity, units: Units): string {
  return unitFor(quantity, units);
}

/** A stored metric value in the chosen unit, unrounded. */
export function toDisplay(
  quantity: Quantity,
  metric: number,
  units: Units,
): number {
  return metric / FACTOR[unitFor(quantity, units)];
}

/** A value typed in the chosen unit back to metric, rounded to `decimals`
 * (2 is plenty for a stored measurement; a filter that shows the value again
 * wants more, so 150 lb comes back as 150 lb). */
export function fromDisplay(
  quantity: Quantity,
  value: number,
  units: Units,
  decimals = 2,
): number {
  return roundTo(value * FACTOR[unitFor(quantity, units)], decimals);
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/** A metric value for a text field: up to 2 decimals, no trailing zeros. */
export function toInputText(
  quantity: Quantity,
  metric: number,
  units: Units,
): string {
  return String(roundTo(toDisplay(quantity, metric, units), 2));
}

/** What a text field holds, read as metric. Comma or point, blank is absent,
 * anything else that is not a number is absent too. */
export function parseInput(
  quantity: Quantity,
  raw: string,
  units: Units,
  decimals = 2,
): number | undefined {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value)
    ? fromDisplay(quantity, value, units, decimals)
    : undefined;
}

/** A measurement with its unit, one decimal and no trailing zeros: "264 cm",
 * "103.9 in", "20.5 kg". */
export function formatQuantity(
  quantity: Quantity,
  metric: number,
  units: Units,
): string {
  const value = Number(toDisplay(quantity, metric, units).toFixed(1));
  return `${value} ${unitLabel(quantity, units)}`;
}

/** A distance in kilometres, one fixed decimal: "0.3 km", "0.2 mi". */
export function formatDistanceKm(km: number, units: Units): string {
  return `${toDisplay("distance", km, units).toFixed(1)} ${unitLabel("distance", units)}`;
}

/** The unit-free number of a distance given in kilometres: "0.3". */
export function distanceText(km: number, units: Units): string {
  return toDisplay("distance", km, units).toFixed(1);
}

/** Imperial for a US English device, metric for everyone else. A bare "en"
 * names no country, so it stays metric. */
export function defaultUnits(language: string | undefined): Units {
  try {
    if (language && new Intl.Locale(language).region === "US") return IMPERIAL;
  } catch {
    // Not a language tag: metric.
  }
  return METRIC;
}

/** The stored choice over the device default; a stored unit that is not one of
 * the two valid ones is ignored. */
export function resolveUnits(
  raw: string | null | undefined,
  language: string | undefined,
): Units {
  const base = defaultUnits(language);
  if (!raw) return base;
  let stored: Partial<Record<keyof Units, unknown>>;
  try {
    stored = JSON.parse(raw) ?? {};
  } catch {
    return base;
  }
  const pick = <T extends string>(
    value: unknown,
    ok: readonly T[],
    fb: T,
  ): T => (ok.includes(value as T) ? (value as T) : fb);
  return {
    weight: pick(stored.weight, ["kg", "lb"], base.weight),
    distance: pick(stored.distance, ["km", "mi"], base.distance),
    length: pick(stored.length, ["cm", "in"], base.length),
  };
}

function language(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

function readUnits(): Units {
  try {
    return resolveUnits(localStorage.getItem(UNITS_KEY), language());
  } catch {
    return defaultUnits(language());
  }
}

let current: Units = readUnits();
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
    if (e.key !== null && e.key !== UNITS_KEY) return;
    current = readUnits();
    for (const fn of listeners) fn();
  });
}

/** The units in force now, for code outside a component. A component also
 * calls `useUnits()` so it re-renders when the choice changes. */
export function currentUnits(): Units {
  return current;
}

function setUnits(patch: Partial<Units>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(UNITS_KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  for (const fn of listeners) fn();
}

/** The device-local units and their setter. */
export function useUnits(): [Units, (patch: Partial<Units>) => void] {
  const units = useSyncExternalStore(
    subscribe,
    () => current,
    () => METRIC,
  );
  return [units, setUnits];
}
