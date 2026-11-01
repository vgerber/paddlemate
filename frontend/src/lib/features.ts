import { redirect } from "@tanstack/react-router";

/** A build-time switch is on unless it is exactly "false". */
export function flagOn(value: string | undefined): boolean {
  return value !== "false";
}

/** Feature switches, read once from the build's env. */
export const features = {
  materials: flagOn(import.meta.env.VITE_FEATURE_MATERIALS),
};

/** Route guard for the /materials screens: sends visitors to Tools while the
 * wiki is switched off. */
export function requireMaterials(enabled: boolean = features.materials): void {
  if (!enabled) throw redirect({ to: "/tools" });
}
